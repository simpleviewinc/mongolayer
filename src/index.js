const {
	MongoClient
} = require("mongodb");
var async = require("async");
var extend = require("extend");
var typecaster = require("typecaster");

var Connection = require("./Connection.js");
var Model = require("./Model.js");
var Document = require("./Document.js");
var QueryLog = require("./QueryLog.js");

const pMemoize = require("p-memoize");

const { ObjectId } = require("./ObjectId.js");

const {
	callbackify,
	convertValue,
	errors,
	resolveRelationship,
	stringConvert,
	stringConvertV2,
	typecasterObjectIdDef
} = require("./utils.js");

const connect = _connect.bind(null, false);
const connectCached = _connect.bind(null, true);

async function _connect(cached, args) {
	const method = cached === true ? _getClientCached : _getClient;
	
	// parse the connectionString to detect a dbName
	const parsed = args.connectionString.match(/mongodb:\/\/.*\/([^?]+)/);
	if (parsed === null) {
		throw new Error("You must specify a database in your connectionString.");
	}
	
	const dbName = parsed[1];
	const client = await method(args);
	const db = client.db(dbName);
	const connection = new Connection({ db : db, logger : args.logger, client : client });
	
	return connection;
}

var _getClient = function(args) {
	// args.connectionString
	// args.options
	
	args.options = args.options || {};
	
	return MongoClient.connect(args.connectionString, args.options);
}

var _getClientCached = pMemoize(_getClient);
var _clearConnectCache = function() {
	pMemoize.clear(_getClientCached);
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
	
	var encoded = Buffer.from(str).toString("hex");
	
	while(encoded.length < 24) {
		encoded += "0";
	}
	
	return new ObjectId(encoded);
}

module.exports = {
	connect : callbackify(connect),
	connectCached : callbackify(connectCached),
	errors,
	Model,
	Document,
	Connection,
	QueryLog,
	ObjectId : ObjectId,
	testId,
	toPlain,
	stringConvert,
	stringConvertV2,
	convertValue,
	resolveRelationship,
	typecasterObjectIdDef,
	_clearConnectCache,
	promises : {
		connect,
		connectCached
	}
};
