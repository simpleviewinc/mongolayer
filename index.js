var mongodb = require("mongodb");
var async = require("async");
var extend = require("extend");
var util = require("util");

var Connection = require("./Connection.js");
var Model = require("./Model.js");
var Document = require("./Document.js");
var QueryLog = require("./QueryLog.js");
var objectLib = require("./lib/objectLib.js");
var arrayLib = require("./lib/arrayLib.js");

var connect = function(args, cb) {
	_getDb(args, function(err, db) {
		if (err) { return cb(err); }
		
		cb(null, new Connection({ db : db, logger : args.logger }));
	});
}

var connectCached = function(args, cb) {
	_getDbCached(args, function(err, db) {
		if (err) { return cb(err); }
		
		cb(null, new Connection({ db : db, logger : args.logger }));
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

var _getDbCached = async.memoize(_getDb, function() { return JSON.stringify(arguments) });

var toPlain = function(data) {
	if (data instanceof Array) {
		return data.map(function(val, i) {
			return toPlain(val);
		});
	}
	
	return extend(true, {}, data);
}

// converts incoming data to simple object literals
// strips out {}, [], "" and undefined
var _prepareInsert = function(data, stripEmpty) {
	var returnData = data;
	
	stripEmpty = (stripEmpty === undefined) ? true : stripEmpty;
	
	if (data instanceof Date || data instanceof mongodb.ObjectID) {
		// certain types are passed straight in without being unfolded
	} else if (data instanceof Function) {
		// Function instanceof Object so have to catch it prior to checking for Object
		returnData = undefined;
	} else if (data instanceof Array) {
		returnData = data.map(function(val, i) {
			return _prepareInsert(val, stripEmpty);
		}).filter(function(val, i) {
			return val !== undefined;
		});
		
		if (stripEmpty && returnData.length === 0) {
			// remove empty arrays
			returnData = undefined;
		}
	} else if (data instanceof Object && data !== null) {
		// at this point we know it's not a Date, Function, Array, ObjectId, so lets walk it
		returnData = {};
		Object.keys(data).forEach(function(i) {
			// only run keys which do not have a "getter" declared
			if (Object.getOwnPropertyDescriptor(data, i).get === undefined) {
				var temp = _prepareInsert(data[i], stripEmpty);
				if (temp !== undefined) {
					returnData[i] = temp;
				}
			}
		});
		
		if (stripEmpty && Object.keys(returnData).length === 0) {
			// remove empty objects
			returnData = undefined;
		}
	} else if (typeof data === "string" && data === "" && stripEmpty) {
		// remove empty strings
		returnData = undefined;
	}
	
	return returnData;
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
		
		// check for plain javascript objects
		if (typeof data === "object" && Object.getPrototypeOf(data) === Object.prototype) {
			// filter syntax with query operators
			returnValue = {};
			objectLib.forEach(data, function(val, i) {
				if (i === "$exists") {
					returnValue[i] = convertValue(val, "boolean");
				} else if (i === "$in" || i === "$nin" || i === "$all") {
					returnValue[i] = [];
					val.forEach(function(val2, i2) {
						returnValue[i].push(convertValue(val2, type));
					});
				} else if (["$ne", "$gt", "$lt", "$gte", "$lte", "$not"].indexOf(i) !== -1) {
					// fields to convert in-place;
					returnValue[i] = convertValue(val, type);
				} else if (i === "$elemMatch") {
					if (hasOps(val)) {
						// if the item has ops we stay where we are at in the context
						returnValue[i] = convertObject(val, type, chain.slice(0));
					} else {
						// no operations, then it is a sub-document style
						returnValue[i] = walk(val, chain.slice(0));
					}
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
				
				// $elemMatch and $all both allow nested objects which won't have schema matches until the leaf is hit
				// for these cases we don't want to push
				if (i !== "$elemMatch" && i !== "$all") {
					newChain.push(i);
				}
				
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
	var val;
	
	if (type === "any") {
		return data;
	} else if (type === "boolean") {
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
		
		if (typeof data === "string" && data.match(/^[\d]+$/)) {
			// handles Unix Offset passed in string
			data = parseInt(data, 10);
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

// gets only hooks which apply to a specific model and de-namespaces them
var _getMyHooks = function(myKey, hooks) {
	var myHooks = [];
	var regMatch = new RegExp("^" + myKey + "\\..*");
	var regReplace = new RegExp("^" + myKey + "\\.");
	hooks.forEach(function(val, i) {
		if (val.name.match(regMatch) !== null) {
			myHooks.push(extend(true, {}, val, { name : val.name.replace(regReplace, "") }));
		}
	});
	
	return myHooks;
}

var resolveRelationship = function(args, cb) {
	// args.type - single or multiple
	// args.leftKey - The key in our Document that points to an object in the related model
	// args.rightKey - The key in the related model that the leftKey points to
	// args.modelName - Name of the related model
	// args.connection - An instance of mongolayer.Connection which we using to locate and query the models
	// args.multipleTypes - Boolean whether this supports multiple types
	// args.objectKey - The key in our Document which will be filled with the found results
	// args.docs - The array of Documents
	// args.hooks - Any hooks that need to be run
	
	if (args.docs.length === 0) {
		return cb(null, args.docs);
	}
	
	var queries = {};
	var addToQuery = function(modelName, id) {
		queries[modelName] = queries[modelName] || {
			result : undefined, // result stores the result of querying this model
			ids : [] // the ids that will be queried
		};
		queries[modelName].ids.push(id);
	}
	
	var originalIndex = {};
	
	args.docs.forEach(function(val, i) {
		var values = val[args.leftKey];
		
		if (values !== undefined) {
			var modelName;
			var id;
			
			if (args.type === "single") {
				if (args.multipleTypes === true) {
					addToQuery(values.modelName, values.id);
				} else {
					addToQuery(args.modelName, values);
				}
			} else {
				if (args.multipleTypes === true) {
					values.forEach(function(val, i) {
						addToQuery(val.modelName, val.id);
					});
				} else {
					values.forEach(function(val, i) {
						addToQuery(args.modelName, val);
					});
				}
			}
		}
	});
	
	if (Object.keys(queries).length === 0) {
		return cb(null, args.docs);
	}
	
	// ensure we only pass hooks if we have them allowing defaultHooks on related models to execute
	var tempHooks = _getMyHooks(args.objectKey, args.hooks);
	if (tempHooks.length === 0) {
		tempHooks = undefined;
	}
	
	var calls = [];
	
	objectLib.forEach(queries, function(val, i) {
		calls.push(function(cb) {
			var filter = {};
			filter[args.rightKey] = { "$in" : val.ids };
			
			var model = args.connection.models[i];
			
			if (model === undefined) {
				return cb(null);
			}
			
			model.find(filter, { hooks : tempHooks }, function(err, docs) {
				if (err) { return cb(err); }
				
				// stash the result to be used after all queries have finished
				val.result = arrayLib.index(docs, args.rightKey);
				
				cb(null);
			});
		});
	});
	
	async.parallel(calls, function(err) {
		if (err) { return cb(err); }
		
		args.docs.forEach(function(val, i) {
			var leftValue = val[args.leftKey];
			
			if (leftValue === undefined) {
				// left value doesn't exist so this documents lacks data for this relationship
				return;
			}
			
			var tempValue;
			
			if (args.type === "single") {
				var modelName = args.multipleTypes === true ? leftValue.modelName : args.modelName;
				var leftKey = args.multipleTypes === true ? leftValue.id : leftValue;
				
				if (queries[modelName].result === undefined) {
					// model query didn't return, likely because model doesn't exist on connection
					return;
				}
				
				tempValue = queries[modelName].result[leftKey];
			} else {
				var tempArray = [];
				leftValue.forEach(function(val, i) {
					var modelName = args.multipleTypes === true ? val.modelName : args.modelName;
					var leftKey = args.multipleTypes === true ? val.id : val;
					
					if (queries[modelName].result === undefined) {
						// model query didn't return, likely because model doesn't exist on connection
						return;
					}
					
					var temp = queries[modelName].result[leftKey];
					if (temp !== undefined) {
						tempArray.push(temp);
					}
				});
				
				if (tempArray.length > 0) {
					tempValue = tempArray;
				}
			}
			
			val[args.objectKey] = tempValue;
		});
		
		cb(null, args.docs);
	});
}

var _newErrorType = function(name) {
	var CustomErrorType = function(message) {
		if (Object.defineProperty) {
			Object.defineProperty(this, "message", {
				value : message || "",
				enumerable : false
			});
		} else {
			this.message = message;
		}
		
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, CustomErrorType);
		}
	}

	CustomErrorType.prototype = new Error();
	CustomErrorType.prototype.name = name;
	
	return CustomErrorType;
}

var errors = {
	ValidationError : _newErrorType("ValidationError")
}

var testId = function(str) {
	if (str.length > 12) { throw new Error("String must be 12 or less characters long") }
	
	var encoded = (new Buffer(str)).toString("hex");
	
	while(encoded.length < 24) {
		encoded += "0";
	}
	
	return new mongodb.ObjectID(encoded);
}

extend(module.exports, {
	connect : connect,
	connectCached : connectCached,
	errors : errors,
	_newErrorType : _newErrorType,
	Model : Model,
	Document : Document,
	Connection : Connection,
	QueryLog : QueryLog,
	ObjectId : mongodb.ObjectID,
	testId : testId,
	toPlain : toPlain,
	stringConvert : stringConvert,
	convertValue : convertValue,
	resolveRelationship : resolveRelationship,
	_prepareInsert : _prepareInsert,
	_getMyHooks : _getMyHooks
});