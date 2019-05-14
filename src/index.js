const {
	ObjectID,
	MongoClient
} = require("mongodb");
var async = require("async");
var extend = require("extend");
var typecaster = require("typecaster");

var Connection = require("./Connection.js");
var Model = require("./Model.js");
var Document = require("./Document.js");
var QueryLog = require("./QueryLog.js");

const {
	convertValue,
	errors,
	resolveRelationship,
	stringConvert,
	stringConvertV2,
	typecasterObjectIdDef
} = require("./utils.js");

var connect = _connect.bind(null, false);
var connectCached = _connect.bind(null, true);

function _connect(cached, args, cb) {
	var method = cached === true ? _getClientCached : _getClient;
	
	// parse the connectionString to detect a dbName
	var parsed = args.connectionString.match(/mongodb:\/\/.*\/([^?]+)/);
	if (parsed === null) {
		return cb(new Error("You must specify a database in your connectionString."));
	}
	
	var dbName = parsed[1];
	
	method(args, function(err, client) {
		if (err) { return cb(err); }
		
		var db = client.db(dbName);
		
		var connection = new Connection({ db : db, logger : args.logger, client : client });
		
		return cb(null, connection);
	});
}

var _getClient = function(args, cb) {
	// args.connectionString
	// args.options
	
	args.options = args.options || {};
	args.options.useNewUrlParser = true;
	
	MongoClient.connect(args.connectionString, args.options, cb);
}

var _getClientCached = async.memoize(_getClient, function() { return JSON.stringify(arguments) });
var _clearConnectCache = function() {
	for(var i in _getClientCached.memo) {
		delete _getClientCached.memo[i];
	}
}

var toPlain = function(data) {
	if (data instanceof Array) {
		return data.map(function(val, i) {
			return toPlain(val);
		});
	}
	
	return extend(true, {}, data);
}

var testId = function(str) {
	if (str.length > 12) { throw new Error("String must be 12 or less characters long") }
	
	var encoded = (new Buffer(str)).toString("hex");
	
	while(encoded.length < 24) {
		encoded += "0";
	}
	
	return new ObjectID(encoded);
}

module.exports = {
	connect,
	connectCached,
	errors,
	Model,
	Document,
	Connection,
	QueryLog,
	ObjectId : ObjectID,
	testId,
	toPlain,
	stringConvert,
	stringConvertV2,
	convertValue,
	resolveRelationship,
	typecasterObjectIdDef,
	_clearConnectCache
};