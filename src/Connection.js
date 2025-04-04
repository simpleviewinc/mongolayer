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
	this.client = args.client;
	
	this.promises = {
		add : add.bind(this),
		close: close.bind(this),
		dropCollection: dropCollection.bind(this),
		remove: remove.bind(this),
		removeAll: removeAll.bind(this)
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
	
	model.setConnection({ connection : this });
	
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

async function remove(args) {
	var self = this;
	
	args.model.disconnect();
	delete self.models[args.model.name];
	delete self._models[args.model.name];
}

Connection.prototype.remove = callbackify(remove);

async function removeAll() {
	var self = this;

	for (const [key, model] of Object.entries(self.models)) {
		await self.promises.remove({ model: model });
	}
}

Connection.prototype.removeAll = callbackify(removeAll);

async function dropCollection(args) {
	var self = this;

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
	return await self.db.dropCollection(args.name);
}
Connection.prototype.dropCollection = callbackify(dropCollection);

async function close() {
	await this.client.close(false);
}
Connection.prototype.close = callbackify(close);

module.exports = Connection;