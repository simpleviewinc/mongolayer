var async = require("async");
var validator = require("jsvalidator");

const {
	callbackify
} = require("./utils.js");

var Connection = function(args) {
	args = args || {};
	
	this.db = args.db;
	this.models = {}; // store public facing models
	this.logger = args.logger; // stores method to be called on query execution with log information
	
	this._models = {}; // store arguments of Connection.add()
	this._client = args.client;
	
	this.promises = {
		add : add.bind(this)
	}
}

/**
 * Adds a model to the connection
 * @param {object} args
 * @param {import("./Model")} args.model
 * @param {boolean} [args.sync] - Whether to sync the state of the model to the database. Has a performance implication if creating indexes or the view can cause issues.
 * @param {boolean} [args.createIndexes] - Deprecated: Use sync instead. The passed value here will be used to set the value of sync.
 */
async function add({ model, sync = true, createIndexes }) {	
	if (createIndexes !== undefined) {
		// for backward compatibility we map createIndexes to sync
		sync = createIndexes
	}
	
	model._setConnection({ connection : this });
	
	// allow option to disable createIndexes on add for performance
	if (sync === true) {
		await model.promises.createIndexes();
	}

	if (sync === true && model.viewOn !== undefined) {
		await model.createView();
	}
	
	this.models[model.name] = model;
	this._models[model.name] = { model, sync, createIndexes };
}

Connection.prototype.add = callbackify(add);

Connection.prototype.remove = function(args, cb) {
	var self = this;
	
	args.model._disconnect();
	delete self.models[args.model.name];
	delete self._models[args.model.name];
	
	cb(null);
}

Connection.prototype.removeAll = function(cb) {
	var self = this;
	
	var calls = [];
	
	Object.keys(self.models).forEach(function(val, i) {
		calls.push(function(cb) {
			self.remove({ model : self.models[val] }, cb);
		});
	});
	
	async.series(calls, cb);
}

Connection.prototype.dropCollection = function(args, cb) {
	var self = this;
	
	// args.name
	var result = validator.validate(args, {
		type : "object",
		schema : [
			{ name : "name", type : "string", required : true }
		],
		allowExtraKeys : false
	});
	
	if (result.err) {
		return cb(result.err);
	}
	
	self.db.dropCollection(args.name, function(err) {
		if (err && err.errmsg.match(/ns not found/) === null) {
			return cb(err);
		}
		
		cb(null);
	});
}

Connection.prototype.close = function(cb) {
	var self = this;
	
	self._client.close(false, cb);
}

module.exports = Connection;