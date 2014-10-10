var mongodb = require("mongodb");
var async = require("async");
var extend = require("extend");
var util = require("util");

var Connection = require("./Connection.js");
var Model = require("./Model.js");
var Document = require("./Document.js");
var objectLib = require("./lib/objectLib.js");

var connect = function(args, cb) {
	_getDb(args, function(err, db) {
		if (err) { return cb(err); }
		
		cb(null, new Connection({ db : db }));
	});
}

var connectCached = function(args, cb) {
	_getDbCached(args, function(err, db) {
		if (err) { return cb(err); }
		
		cb(null, new Connection({ db : db }));
	});
}

var _getDb = function(args, cb) {
	// args.connectionString
	// args.options
	
	args.options = args.options || {};
	
	mongodb.MongoClient.connect(args.connectionString, args.options, function(err, db) {
		if (err) { return cb(err); }
		
		var op;
		if (args.auth) {
			args.auth.options = args.auth.options || { authMechanism : "MONGODB-CR" };
			op = function(cb) {
				db.authenticate(args.auth.username, args.auth.password, args.auth.options, cb);
			}
		} else {
			var op = function(cb) { cb(null); }
		}
		
		op(function(err) {
			if (err) { return cb(err); }
			
			cb(null, db);
		});
	});
}

var _getDbCached = async.memoize(_getDb);

var toPlain = function(data) {
	if (data instanceof Array) {
		return data.map(function(val, i) {
			return toPlain(val);
		});
	}
	
	return extend(true, {}, data);
}

// Converts structured data of arrays, objects of strings into meaningful primitives
// This is required because HTTP transmits as strings, while server-side code needs primitives such as boolean, number, date and mongoid.
// EXPERIMENTAL!
var stringConvert = function(data, schema) {
	var hasOps = function(data) {
		var hasOps = false;
		objectLib.forEach(data, function(val, i) {
			if (i.match(/^\$/)) {
				hasOps = true;
			}
		});
		
		return hasOps;
	}
	
	var convertObject = function(data, type, chain) {
		var returnValue;
		
		if (typeof data === "object") {
			// filter syntax with query operators
			returnValue = {};
			objectLib.forEach(data, function(val, i) {
				if (i === "$exists") {
					returnValue[i] = convertValue(val, "boolean");
				} else if (i === "$in" || i === "$nin") {
					returnValue[i] = [];
					val.forEach(function(val2, i2) {
						returnValue[i].push(convertValue(val2, type));
					});
				} else if (["$ne", "$gt", "$lt", "$gte", "$lte", "$not"].indexOf(i) !== -1) {
					// fields to convert in-place;
					returnValue[i] = convertValue(val, type);
				} else if (i === "$elemMatch") {
					if (hasOps(data)) {
						// if the item has ops we stay where we are at in the context
						returnValue[i] = convertObject(data[i], type, chain);
					} else {
						// no operations, then it is a sub-document style
						returnValue[i] = walk(data, chain.slice(0));
					}
				} else if (i === "$all") {
					returnValue[i] = [];
					val.forEach(function(val2, i2) {
						if (hasOps(val2)) {
							returnValue[i].push(walk(val2.$elemMatch, chain.slice(0)));
						} else if (typeof val2 === "object") {
							returnValue[i].push(convertObject(val2, type, chain.slice(0)));
						} else {
							returnValue[i].push(convertValue(val2, type));
						}
					});
				} else {
					throw new Error("Unsupported query operator '" + i + "'");
				}
			});
		} else {
			// standard value
			returnValue = convertValue(data, type);
		}
		
		return returnValue;
	}
	
	var walk = function(obj, chain) {
		var newObj = {};
		
		objectLib.forEach(obj, function(val, i) {
			var returnValue;
			
			if (["$and", "$or", "$nor"].indexOf(i) !== -1) {
				returnValue = [];
				
				val.forEach(function(val, i) {
					returnValue.push(walk(val, chain));
				});
			} else {
				var newChain = chain.slice(0);
				newChain.push(i);
				
				var key = newChain.join(".");
				if (schema[key] !== undefined) {
					if (val instanceof Array) {
						returnValue = [];
						val.forEach(function(val2, i2) {
							returnValue.push(convertObject(val2, schema[key], newChain));
						});
					} else {
						returnValue = convertObject(obj[i], schema[key], newChain);
					}
				} else {
					if (val instanceof Array) {
						returnValue = [];
						val.forEach(function(val, i) {
							if (typeof val === "object" && !(val instanceof Array)) {
								returnValue.push(walk(val, newChain));
							} else {
								returnValue.push(val);
							}
						});
					} else if (typeof val === "object") {
						returnValue = walk(val, newChain);
					} else {
						// not in schema, and not walkable, just return the value
						returnValue = val;
					}
				}
			}
			
			newObj[i] = returnValue;
		});
		
		return newObj;
	}
	
	var temp = walk(data, []);
	
	return temp;
}

var convertValue = function(data, type) {
	var self = this;
	
	var val;
	
	if (type === "boolean") {
		if (typeof data === "boolean") {
			return data;
		}
		
		if (["1", 1, "0", 0, "yes", "no", "true", "false"].indexOf(data) === -1) {
			// ensure boolean is "true" or "false"
			throw new Error(util.format("Cannot convert '%s' to boolean, it must be 'true' or 'false'", data));
		}
		
		return data === "true" || data === "1" || data === 1 || data === "yes";
	} else if (type === "date") {
		if (data instanceof Date) {
			return data;
		}
		
		var temp = new Date(data);
		if (isNaN(temp)) {
			throw new Error(util.format("Cannot convert '%s' to date, it's value is not valid in a JS new Date() constructor", data));
		}
		
		return temp;
	} else if (type === "number") {
		if (typeof data === "number") {
			return data;
		}
		
		var temp = Number(data);
		if (isNaN(temp)) {
			throw new Error(util.format("Cannot convert '%s' to number, it's value is not a valid number", data));
		}
		
		return temp;
	} else if (type === "string") {
		return data;
	} else if (type === "objectid") {
		if (data instanceof mongodb.ObjectID) {
			return data;
		}
		
		try {
			var temp = new mongodb.ObjectID(data);
		} catch (e) {
			throw new Error(util.format("Cannot convert '%s' to mongodb, it's value is not a valid objectid", data));
		}
		
		return temp;
	} else {
		throw new Error(util.format("Cannot convert, '%s' is not a supported conversion type", type));
	}
}

extend(module.exports, {
	connect : connect,
	connectCached : connectCached,
	Model : Model,
	Document : Document,
	Connection : Connection,
	ObjectId : mongodb.ObjectID,
	toPlain : toPlain,
	stringConvert : stringConvert,
	convertValue : convertValue
});