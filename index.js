var mongodb = require("mongodb");
var async = require("async");
var extend = require("extend");

var Connection = require("./Connection.js");
var Model = require("./Model.js");
var Document = require("./Document.js");

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
	
	var temp = {};
	
	for(var i in data) {
		temp[i] = data[i];
	}
	
	return temp;
}

extend(module.exports, {
	connect : connect,
	connectCached : connectCached,
	Model : Model,
	Document : Document,
	Connection : Connection,
	ObjectId : mongodb.ObjectID,
	toPlain : toPlain
});