var objectLib = require("./lib/objectLib.js");
var arrayLib = require("./lib/arrayLib.js");

var validator = require("jsvalidator");
var extend = require("extend");
var async = require("async");
var util = require("util");
const shuffle = require("lodash/shuffle");

const {
	ObjectId
} = require("mongodb");

const {
	promisifyMethods
} = require("@simpleview/promiselib");

const {
	callbackify,
	errors,
	getMyHooks,
	getMyFields,
	prepareInsert,
	resolveRelationship,
	stringConvert,
	stringConvertV2,
} = require("./utils.js");

const Document = require("./Document.js");
const QueryLog = require("./QueryLog.js");

var queryLogMock = {
	startTimer : function() {},
	stopTimer : function() {},
	get : function() {},
	set : function() {},
	send : function() {}
}

const MODEL_CONSTRUCTOR_VALIDATION = {
	type : "object",
	schema : [
		{ name : "collection", type : "string", required : true },
		{ name : "allowExtraKeys", type : "boolean", default : false },
		{ name : "deleteExtraKeys", type : "boolean", default : false }
	],
	throwOnInvalid : true
};

var Model = function(args) {
	args = args || {};
	
	validator.validate(args, MODEL_CONSTRUCTOR_VALIDATION);
	
	args.fields = args.fields || [];
	args.virtuals = args.virtuals || [];
	args.relationships = args.relationships || [];
	args.modelMethods = args.modelMethods || [];
	args.documentMethods = args.documentMethods || [];
	args.indexes = args.indexes || [];
	args.defaultHooks = args.defaultHooks || {};
	args.hooks = args.hooks || [];
	args.onInit = args.onInit || function() {};
	
	// public
	this.name = args.name || args.collection;
	this.collectionName = args.collection;
	this.connected = false;

	/** @type {import("mongodb").Collection} */
	this.collection = null; // stores reference to MongoClient.Db.collection()
	this.ObjectId = ObjectId;
	this.fields = {};
	this.relationships = {};
	this.methods = {};
	/** @type {import("./Connection")} */
	this.connection = null; // stores Connection ref
	this.hooks = {
		beforeAggregate : {},
		afterAggregate : {},
		beforeInsert : {},
		afterInsert : {},
		beforeSave : {},
		afterSave : {},
		beforeUpdate : {},
		afterUpdate : {},
		beforeFind : {},
		afterFind : {},
		beforeRemove : {},
		afterRemove : {},
		beforeCount : {},
		afterCount : {},
		beforePut : {},
		afterPut : {},
		beforeFilter : {}
	};
	this.viewOn = args.viewOn;
	this.pipeline = args.pipeline;
	
	// private
	this._onInit = args.onInit;
	this._allowExtraKeys = args.allowExtraKeys;
	this._deleteExtraKeys = args.deleteExtraKeys;
	this._virtuals = {};
	this._modelMethods = {};
	this._documentMethods = {};
	this._indexes = [];
	this._convertSchema = undefined;
	this._convertSchemaV2 = undefined;
	
	this.defaultHooks = extend({
		aggregate : [],
		find : [],
		count : [],
		insert : [],
		update : [],
		save : [],
		remove : []
	}, args.defaultHooks);
	
	this.Document = _getModelDocument(this);
	
	// adds _id field
	this.addField({
		name : "_id",
		default : function(args, cb) {
			return new ObjectId();
		},
		validation : {
			type : "class",
			class : ObjectId
		}
	});
	
	// adds id string alias
	this.addVirtual({
		name : "id",
		type : "idToString",
		options : {
			key : "_id"
		},
		requiredFields : ["_id"]
	});
	
	// adds storage for core functionality in case we need this in the future
	this.addField({
		name : "_ml",
		validation : {
			type : "object"
		}
	});
	
	args.modelMethods.forEach(val => {
		this.addModelMethod(val);
	});
	
	args.documentMethods.forEach(val => {
		this.addDocumentMethod(val);
	});
	
	args.fields.forEach(val => {
		this.addField(val);
	});
	
	args.virtuals.forEach(val => {
		this.addVirtual(val);
	});
	
	args.relationships.forEach(val => {
		this.addRelationship(val);
	});
	
	args.hooks.forEach(val => {
		this.addHook(val);
	});
	
	args.indexes.forEach(val => {
		this.addIndex(val);
	});
	
	this.promises = {
		find : find.bind(this),
		findById : findById.bind(this),
		aggregate : aggregate.bind(this),
		...promisifyMethods(this, [
			"insert",
			"save",
			"count",
			"update",
			"remove",
			"removeAll",
			"createIndexes"
		])
	}
}

// re-add all of the indexes to a model, useful if a collection needs to be dropped and re-built at run-time
async function createIndexes() {
	var self = this;

	for (const loopIndex of self._indexes) {
		await self.collection.createIndex(loopIndex.keys, loopIndex.options);
	}
}
Model.prototype.createIndexes = callbackify(createIndexes);

Model.prototype.createView = async function() {
	try {
		await this.connection.db.command({
			create : this.name,
			viewOn : this.viewOn,
			pipeline : this.pipeline
		});

		return {
			created : true,
			updated : false
		}
	} catch(e) {
		// err code 48 represents that the collection already exists, which is not a real problem, so we ignore
		if (e.code !== 48) {
			throw e;
		}
	}

	const collectionInfo = await this.connection.db.listCollections({ name : this.name }).toArray();

	const def = collectionInfo[0];

	const pipelineMatch = JSON.stringify(def.options.pipeline) === JSON.stringify(this.pipeline);
	const viewOnMatch = def.options.viewOn === this.viewOn;

	if (pipelineMatch && viewOnMatch) {
		// No need to update definition
		return {
			created : false,
			updated : false
		};
	}

	// update collection definition
	await this.connection.db.command({
		collMod : this.name,
		viewOn : this.viewOn,
		pipeline : this.pipeline
	});

	return {
		created : false,
		updated : true
	}
}

Model.prototype._setConnection = function(args) {
	var self = this;
	
	// args.connection
	
	self.connection = args.connection;
	self.collection = args.connection.db.collection(self.collectionName);
	
	self.connected = true;
}

Model.prototype._disconnect = function() {
	var self = this;
	
	self.connection = null;
	self.collection = null;
	
	self.connected = false;
}

Model.prototype.addField = function(args) {
	var self = this;
	
	// args.name
	// args.default
	// args.required
	// args.persist
	// args.toJSON
	// args.validation (jsvalidator syntax)
	
	args.toJSON = args.toJSON !== undefined ? args.toJSON : true; // default toJSON to be true
	self.fields[args.name] = args;
}

Model.prototype.addVirtual = function(args) {
	var self = this;
	
	// args.name
	// args.get
	// args.set
	// args.enumerable
	// args.writable
	// args.requiredFields
	
	if (args.type === "idToString") {
		args.get = function() {
			return this[args.options.key] === undefined || this[args.options.key] === null ? this[args.options.key] : this[args.options.key].toString();
		};
		
		args.set = function(val) {
			if (val === undefined || val === null) {
				// unset with null or undefined, your choice
				this[args.options.key] = val;
				
				return;
			}
			
			this[args.options.key] = new ObjectId(val);
		};
	} else if (args.type === "jsonToObject") {
		args.get = function() {
			return this[args.options.key] === undefined || this[args.options.key] === null ? this[args.options.key] : JSON.stringify(this[args.options.key]);
		};
		
		args.set = function(val) {
			if (val === undefined || val === null) {
				// unset with null or undefined, your choice
				this[args.options.key] = val;
				
				return;
			}
			
			this[args.options.key] = JSON.parse(val);
		}
	}
	
	args.get = args.get || undefined;
	args.set = args.set || undefined;
	args.enumerable = args.enumerable !== undefined ? args.enumerable : true;
	args.cache = args.cache !== undefined ? args.cache : false;
	args.requiredFields = args.requiredFields || undefined;
	args.requiredHooks = args.requiredHooks || undefined;
	
	var getter = args.get !== undefined ? args.get : undefined;
	if (args.cache === true && getter !== undefined) {
		getter = function() {
			var value = args.get.call(this);
			
			Object.defineProperty(this, args.name, {
				value : value,
				enumerable : args.enumerable
			});
			
			return value;
		}
	}
	
	// defineProperty treats passing undefined different than now passing the key at all, so we have to only add the keys if they are not undefined
	var propDef = {}
	if (getter !== undefined) {
		propDef.get = getter;
	}
	
	if (args.set !== undefined) {
		propDef.set = args.set;
	}
	
	if (args.writable !== undefined) {
		propDef.writable = args.writable;
	}
	
	if (args.enumerable !== undefined) {
		propDef.enumerable = args.enumerable;
	}
	
	Object.defineProperty(self.Document.prototype, args.name, propDef);
	
	self._virtuals[args.name] = args;
}

Model.prototype.addRelationship = function(args) {
	var self = this;
	
	// args.name
	// args.type
	// args.modelName
	// args.required
	// args.hookRequired
	// args.rightKey
	
	validator.validate(args, {
		type : "object",
		schema : [
			{ name : "name", type : "string", required : true },
			{ name : "type", type : "string", required : true },
			{ name : "modelName", type : "string" },
			{ name : "multipleTypes", type : "boolean", default : false },
			{ name : "required", type : "boolean" },
			{ name : "hookRequired", type : "boolean" },
			{ name : "leftKey", type : "string", default : function(args) { return args.current.name + "_" + (args.current.type === "single" ? "id" : "ids") } },
			{ name : "rightKey", type : "string", default : "_id" },
			{ name : "rightKeyValidation", type : "object", default : { type : "class", class : ObjectId } }
		],
		throwOnInvalid : true,
		allowExtraKeys : false
	});
	
	var originalArgs = args;
	var type = args.type;
	var objectKey = args.name;
	var modelName = args.modelName;
	var multipleTypes = args.multipleTypes;
	var leftKey = args.leftKey;
	var rightKey = args.rightKey;
	var rightKeyValidation = args.rightKeyValidation;
	
	self.addVirtual({
		name : objectKey,
		requiredFields : [args.leftKey],
		requiredHooks : ["afterFind_" + objectKey],
		writable : true
	});
	
	if (multipleTypes === true) {
		rightKeyValidation = {
			type : "object",
			schema : [
				extend(true, {}, rightKeyValidation, { name : "id", required : true }),
				{ name : "modelName", type : "string", required : true }
			]
		}
	}
	
	var hookHandler = function(args, cb) {
		var newOptions = {};
		var hookArgs = extend(true, {}, args.hookArgs || {});
		
		// use the hookArgs fields, or cherry-pick the fields that apply to the relationship
		newOptions.fields = hookArgs.fields !== undefined ? hookArgs.fields : getMyFields(objectKey, args.options.fields || {});
		// use the hookArgs hooks, or cherry-pick the hooks that apply to the relationship
		newOptions.hooks = hookArgs.hooks !== undefined ? hookArgs.hooks : getMyHooks(objectKey, args.options.hooks || []);
		// if we have fields, we pass mapDocs, it will take affect according to the state of castDocs
		newOptions.mapDocs = hookArgs.fields !== undefined ? true : undefined;
		newOptions.castDocs = hookArgs.castDocs !== undefined ? hookArgs.castDocs : args.options.castDocs;
		
		resolveRelationship({
			type : type,
			leftKey : leftKey,
			rightKey : rightKey,
			multipleTypes : multipleTypes,
			modelName : modelName,
			connection : self.connection,
			objectKey : objectKey,
			docs : args.docs,
			mapDocs : newOptions.mapDocs,
			castDocs : newOptions.castDocs,
			hooks : (newOptions.hooks.length > 0) ? newOptions.hooks : undefined,
			fields : (Object.keys(newOptions.fields).length > 0) ? newOptions.fields : undefined,
			context : args.options.context
		}, function(err, docs) {
			if (err) { return cb(err); }
			
			cb(null, args);
		});
	}
	
	if (type === "single") {
		self.addField({
			name : leftKey,
			validation : rightKeyValidation,
			required : args.required === true
		});
		
		self.addHook({
			name : objectKey,
			type : "afterFind",
			handler : hookHandler,
			required : args.hookRequired === true
		});
	} else if (type === "multiple") {
		self.addField({
			name : leftKey,
			validation : {
				type : "array",
				schema : rightKeyValidation
			},
			required : args.required === true
		});
		
		self.addHook({
			name : objectKey,
			type : "afterFind",
			handler : hookHandler,
			required : args.hookRequired === true
		});
	}
	
	self.relationships[args.name] = args;
}

Model.prototype.addIndex = function(args) {
	var self = this;
	
	// args.keys
	// args.options
	
	self._indexes.push(args);
}

Model.prototype.addModelMethod = function(args) {
	var self = this;
	
	// args.name
	// args.handler
	
	self.methods[args.name] = args.handler.bind(self);
	self._modelMethods[args.name] = args;
}

Model.prototype.addDocumentMethod = function(args) {
	var self = this;
	
	// args.name
	// args.handler
	
	self.Document.prototype[args.name] = args.handler;
	self._documentMethods[args.name] = args;
}

Model.prototype.addHook = function(args, cb) {
	var self = this;
	
	// args.type
	// args.name
	// args.handler
	// args.required
	
	self.hooks[args.type][args.name] = args;
}

function insert(docs, options, cb) {
	var self = this;
	
	// if no options, callback is options
	cb = cb || options;
	
	if (self.connected === false) {
		return cb(new Error("Model not connected to a MongoDB database"));
	}
	
	// if options is callback, default the options
	options = options === cb ? {} : options;
	
	var isArray = docs instanceof Array;
	
	// ensure docs is always an array
	docs = docs instanceof Array ? docs : [docs];
	
	options.hooks = self._normalizeHooks(options.hooks || self.defaultHooks.insert);
	options.options = options.options || {};
	
	// used in beforePut and afterPut because that hook takes a single document while insert could work on bulk
	var callPutHook = function(args, cb) {
		// args.hooks
		// args.docs
		// args.type
		// args.options
		
		var calls = [];
		var newDocs = [];
		args.docs.forEach(function(val, i) {
			calls.push(function(cb) {
				self._executeHooks({ type : args.type, hooks : args.hooks, args : { doc : val, options : args.options } }, function(err, temp) {
					if (err) { return cb(err); }
					
					newDocs[i] = temp.doc;
					
					cb(null);
				});
			});
		});
		
		async.parallel(calls, function(err) {
			if (err) { return cb(err); }
			
			cb(null, { docs : newDocs, options : args.options });
		});
	}
	
	self._executeHooks({ type : "beforeInsert", hooks : self._getHooksByType("beforeInsert", options.hooks), args : { docs : docs, options : options } }, function(err, args) {
		if (err) { return cb(err); }
		
		callPutHook({ type : "beforePut", hooks : self._getHooksByType("beforePut", args.options.hooks), docs : args.docs, options : args.options }, async function(err, args) {
			if (err) { return cb(err); }
			
			// validate/add defaults
			let cleanDocs;
			try {
				cleanDocs = self.processDocs({ data : args.docs, validate : true, checkRequired : true, stripEmpty : args.options.stripEmpty });
			} catch(e) {
				return cb(e);
			}
			
			// insert the data into mongo
			let result = await self.collection.insertMany(cleanDocs, args.options.options);
			let castedDocs = self._castDocs(cleanDocs);

			callPutHook({ type : "afterPut", hooks : self._getHooksByType("afterPut", args.options.hooks), docs : castedDocs, options : args.options }, function(err, args) {
				if (err) { return cb(err); }
				
				self._executeHooks({ type : "afterInsert", hooks : self._getHooksByType("afterInsert", args.options.hooks), args : { result : result, docs : args.docs, options : args.options } }, function(err, args) {
					if (err) { return cb(err); }

					cb(null, isArray ? args.docs : args.docs[0], args.result);
				});
			});
		});
	});
}

insert[util.promisify.custom] = function(...args) {
	var self = this;
	
	return new Promise(function(resolve, reject) {
		self.insert(...args, function(err, ignored, result) {
			if (err) { return reject(err); }
			
			return resolve(result);
		});
	});
}

Model.prototype.insert = insert;

function save(doc, options, cb) {
	var self = this;
	
	// if no options, callback is options
	cb = cb || options;
	
	if (self.connected === false) {
		return cb(new Error("Model not connected to a MongoDB database."));
	}
	
	if (doc instanceof Array) {
		return cb(new Error("Save does not support bulk operations."));
	}
	
	// if options is callback, default the options
	options = options === cb ? {} : options;
	options.hooks = self._normalizeHooks(options.hooks || self.defaultHooks.save);
	options.options = options.options || {};
	options.options.upsert = true;
	
	self._executeHooks({ type : "beforeSave", hooks : self._getHooksByType("beforeSave", options.hooks), args : { doc : doc, options : options } }, function(err, args) {
		if (err) { return cb(err); }
		
		self._executeHooks({ type : "beforePut", hooks : self._getHooksByType("beforePut", args.options.hooks), args : { doc : args.doc, options : args.options } }, async function(err, args) {
			if (err) { return cb(err); }
			
			// validate/add defaults
			let cleanDocs;
			try {
				cleanDocs = self.processDocs({ data : [args.doc], validate : true, checkRequired : true, stripEmpty : args.options.stripEmpty });
			} catch(e) {
				return cb(e);
			}
			
			let result = await self.collection.replaceOne({ _id : cleanDocs[0]._id }, cleanDocs[0], args.options.options);
			let castedDoc = self._castDocs(cleanDocs)[0];
				
			self._executeHooks({ type : "afterPut", hooks : self._getHooksByType("afterPut", args.options.hooks), args : { doc : castedDoc, options : args.options } }, function(err, args) {
				if (err) { return cb(err); }
				
				self._executeHooks({ type : "afterSave", hooks : self._getHooksByType("afterSave", args.options.hooks), args : { result : result, doc : args.doc, options : args.options } }, function(err, args) {
					if (err) { return cb(err); }

					cb(null, castedDoc, args.result);
				});
			});
		});
	});
}

save[util.promisify.custom] = function(...args) {
	var self = this;
	
	return new Promise(function(resolve, reject) {
		self.save(...args, function(err, ignored, result) {
			if (err) { return reject(err); }
			
			return resolve(result);
		});
	});
}

Model.prototype.save = save;

async function aggregate(pipeline, options = {}) {
	var self = this;
	
	options.castDocs = options.castDocs !== undefined ? options.castDocs : false;
	options.options = options.options || {};
	options.hooks = self._normalizeHooks(options.hooks || self.defaultHooks.aggregate);
	
	let args;
	args = await self._executeHooksP({ type : "beforeAggregate", hooks : self._getHooksByType("beforeAggregate", options.hooks), args : { pipeline : pipeline, options : options } });
	
	const cursor = self.collection.aggregate(args.pipeline, args.options);
	const docs = await cursor.toArray();
	
	args = await self._executeHooksP({ type : "afterAggregate", hooks : self._getHooksByType("afterAggregate", options.hooks), args : { pipeline : args.pipeline, options : args.options, docs : docs } });
	
	if (args.options.virtuals !== undefined) {
		self._executeVirtuals(args.docs, args.options.virtuals);
	}
	
	if (args.options.castDocs === true) {
		args.docs = self._castDocs(args.docs, { cloneData : false })
	}
	
	if (args.options.maxSize) {
		var size = JSON.stringify(args.docs).length;
		if (size > args.options.maxSize) {
			throw new Error("Max size of result set '" + size + "' exceeds options.maxSize of '" + args.options.maxSize + "'");
		}
	}
	
	return args.docs;
}

Model.prototype.aggregate = callbackify(aggregate);

async function findById(id, options = {}) {
	var self = this;
	
	const docs = await self.promises.find({ _id : id instanceof ObjectId ? id : new ObjectId(id) }, options);
	return docs.length === 0 ? null : docs[0];
}

Model.prototype.findById = callbackify(findById);

async function find(filter, options = {}) {
	var self = this;
	
	if (self.connected === false) {
		throw new Error("Model not connected to a MongoDB database");
	}
	
	options.hooks = options.hooks || self.defaultHooks.find.slice(); // clone default hooks so we don't end up with them being affected when items push on to them via fields
	options.castDocs = options.castDocs !== undefined ? options.castDocs : true;
	options.mapDocs = options.mapDocs !== undefined ? options.mapDocs : true;
	options.fields = options.fields || {};
	options.options = options.options || {};
	options.context = options.context || {};
	
	var originalFields = Object.assign({}, options.fields);
	
	// utilize a mock when logger is disabled for performance reasons
	var queryLog = self.connection.logger === undefined ? queryLogMock : new QueryLog({ type : "find", collection : self.collectionName, connection : self.connection });
	queryLog.startTimer("command");
	
	var fieldResults;
	if (Object.keys(options.fields).length > 0) {
		fieldResults = self._processFields(options);
	}
	
	options.hooks = self._normalizeHooks(options.hooks);
	
	let args;
	
	args = await self._executeHooksP({ type : "beforeFind", hooks : self._getHooksByType("beforeFind", options.hooks), args : { filter : filter, options : options } });
	args = await self._executeHooksP({ type : "beforeFilter", hooks : self._getHooksByType("beforeFilter", args.options.hooks), args : { filter : args.filter, options : args.options } });
	
	var findFields = self._getMyFindFields(args.options.fields);

	let findFilter = args.filter;

	if (options.random !== undefined) {
		if (options.skip !== undefined || options.limit !== undefined) {
			throw new Error("When using 'random' you cannot also use 'skip' and 'limit'.")
		}

		findFilter = await calculateFilterWithRandom(this, args.filter, options.random);
	}
	
	var cursor = self.collection.find(findFilter, args.options.options);
	if (findFields) { cursor = cursor.project(findFields); }
	if (args.options.sort && args.options.sort !== "random") { cursor = cursor.sort(args.options.sort) }
	if (args.options.collation) { cursor = cursor.collation(args.options.collation) }
	if (args.options.limit) { cursor = cursor.limit(args.options.limit) }
	if (args.options.skip) { cursor = cursor.skip(args.options.skip) }
	
	const getDocsFn = async function() {
		queryLog.startTimer("raw");
		const docs = await cursor.toArray();
		queryLog.stopTimer("raw");
		
		return docs;
	}
	
	const countFn = async function() {
		if (args.options.count !== true) {
			return;
		}
		
		return await self.collection.countDocuments(args.filter);
	}
	
	const [docs, count] = await Promise.all([
		getDocsFn(),
		countFn()
	]);
	
	args = await self._executeHooksP({ type : "afterFind", hooks : self._getHooksByType("afterFind", args.options.hooks), args : { filter : args.filter, options : args.options, docs : docs, count : count } });
	
	if (args.options.castDocs === true) {
		args.docs = self._castDocs(args.docs, { cloneData : false });
	}
	
	if (args.options.castDocs === false && fieldResults !== undefined && fieldResults.virtuals.length > 0) {
		// if castDocs === false and our fields obj included any virtual fields we need to execute them to ensure they exist in the output
		self._executeVirtuals(args.docs, fieldResults.virtuals);
	}
	
	if (args.options.mapDocs === true && args.options.castDocs === false && fieldResults !== undefined && (fieldResults.fieldsAdded === true || fieldResults.virtualsAdded === true)) {
		// if we are in a castDocs === false situation with mapDocs true (not a relationship find()), and we have added fields, we need to map them away
		args.docs = objectLib.mongoProject(args.docs, originalFields);
	}
	
	if (args.options.maxSize) {
		var size = JSON.stringify(args.docs).length;
		if (size > args.options.maxSize) {
			throw new Error("Max size of result set '" + size + "' exceeds options.maxSize of '" + args.options.maxSize + "'");
		}
	}
	
	queryLog.stopTimer("command");
	queryLog.set({ rawFilter : args.filter, rawOptions : args.options, count : args.docs.length });
	queryLog.send();

	if (args.options.sort === "random") {
		args.docs = shuffle(args.docs);
	}
	
	if (args.count !== undefined) {
		return { count : args.count, docs : args.docs };
	} else {
		return args.docs;
	}
}

async function calculateFilterWithRandom(model, filter, count) {
	const randomIds = await model.promises.aggregate([
		{
			$match: filter
		},
		{
			$sample: {
				size: count
			}
		},
		{
			$project: {
				_id: true
			}
		}
	]);

	return {
		_id: {
			$in: randomIds.map(val => val._id)
		}
	}
}

Model.prototype.find = callbackify(find);

Model.prototype.count = function(filter, options, cb) {
	var self = this;
	
	cb = cb || options;
	
	if (self.connected === false) {
		return cb(new Error("Model not connected to a MongoDB database"));
	}
	
	options = options === cb ? {} : options;
	options.hooks = self._normalizeHooks(options.hooks || self.defaultHooks.count);
	options.options = options.options || {};
	
	self._executeHooks({ type : "beforeCount", hooks : self._getHooksByType("beforeCount", options.hooks), args : { filter : filter, options : options } }, function(err, args) {
		if (err) { return cb(err); }
		
		self._executeHooks({ type : "beforeFilter", hooks : self._getHooksByType("beforeFilter", args.options.hooks), args : { filter : filter, options : options } }, async function(err, args) {
			if (err) { return cb(err); }
			let count = await self.collection.countDocuments(args.filter, args.options.options);
			self._executeHooks({ type : "afterCount", hooks : self._getHooksByType("afterCount", args.options.hooks), args : { filter : args.filter, options : args.options, count : count } }, function(err, args) {
				if (err) { return cb(err); }
				cb(null, args.count);
			});
		});
	});
}

Model.prototype.update = function(filter, delta, options, cb) {
	var self = this;
	
	cb = cb || options;
	
	if (self.connected === false) {
		return cb(new Error("Model not connected to a MongoDB database"));
	}
	
	options = options === cb ? {} : options;
	options.hooks = self._normalizeHooks(options.hooks || self.defaultHooks.update);
	options.options = options.options || {};
	
	self._executeHooks({ type : "beforeUpdate", hooks : self._getHooksByType("beforeUpdate", options.hooks), args : { filter : filter, delta: delta, options : options } }, function(err, args) {
		if (err) { return cb(err); }
		
		self._executeHooks({ type : "beforeFilter", hooks : self._getHooksByType("beforeFilter", options.hooks), args : { filter : filter, options : options } }, async function(err, tempArgs) {
			if (err) { return cb(err); }
			
			let hasOps = true;
			
			if (Object.keys(args.delta).filter(function(val, i) { return val.match(/^\$/) !== null }).length === 0) {
				hasOps = false;
				// no $ operators at the root level, validate the whole delta
				let cleanDocs;
				try {
					cleanDocs = self.processDocs({ data : [args.delta], validate : true, checkRequired : true, stripEmpty : options.stripEmpty });
				} catch(e) {
					return cb(e);
				}
				
				args.delta = cleanDocs[0];
				
				// update delta cannot modify _id
				delete args.delta._id;
			} else {
				if (args.delta["$set"] !== undefined) {
					// validate the $set argument
					try {
						self._validateDocData(args.delta["$set"]);
					} catch(e) {
						return cb(e);
					}
				}
				
				if (args.delta["$setOnInsert"] !== undefined) {
					// validate the $setOnInsert argument
					try {
						self._validateDocData(args.delta["$setOnInsert"]);
					} catch(e) {
						return cb(e);
					}
				}
			}
			
			// The old update() syntax supported 3 patterns, update one item, update many items, or fully replace an item
			// if the delta has no ops, it's a replace, if it has multi true, it's updateMany, if it has neither it's updateOne
			const method =
				hasOps === false ? "replaceOne"
				: tempArgs.options.options.multi === true ? "updateMany"
				: "updateOne"
			;
			
			delete tempArgs.options.options.multi;

			let result = await self.collection[method](tempArgs.filter, args.delta, tempArgs.options.options);
			self._executeHooks({ type : "afterUpdate", hooks : self._getHooksByType("afterUpdate", args.options.hooks), args : { filter : tempArgs.filter, delta : args.delta, options : tempArgs.options, result : result } }, function(err, args) {
				if (err) { return cb(err); }
				
				cb(null, args.result);
			});
		});
	});
}

// Removes from model
Model.prototype.remove = function(filter, options, cb) {
	var self = this;
	
	cb = cb || options;
	
	if (self.connected === false) {
		return cb(new Error("Model not connected to a MongoDB database"));
	}
	
	options = options === cb ? {} : options;
	options.hooks = self._normalizeHooks(options.hooks || self.defaultHooks.remove);
	options.options = options.options || {};
	
	self._executeHooks({ type : "beforeRemove", hooks : self._getHooksByType("beforeRemove", options.hooks), args : { filter : filter, options : options } }, function(err, args) {
		if (err) { return cb(err); }
		
		self._executeHooks({ type : "beforeFilter", hooks : self._getHooksByType("beforeFilter", args.options.hooks), args : { filter : args.filter, options : args.options } }, async function(err, args) {
			if (err) { return cb(err); }
			
			let result = await self.collection.deleteMany(args.filter, args.options.options);
			self._executeHooks({ type : "afterRemove", hooks : self._getHooksByType("afterRemove", args.options.hooks), args : { filter : args.filter, options : args.options, result : result } }, function(err, args) {
				if (err) { return cb(err); }
				
				cb(null, args.result);
			});
		});
	});
}

Model.prototype.removeAll = function(cb) {
	var self = this;
	
	self.connection.dropCollection({ name : self.collectionName }, function(err) {
		if (err) { return cb(err); }
		
		self.createIndexes(cb);
	});
}

Model.prototype.stringConvert = function(data) {
	var self = this;
	
	var schema = self.getConvertSchema();
	
	return stringConvert(data, schema);
}

Model.prototype.stringConvertV2 = function(data) {
	var self = this;

	var schema = self.getConvertSchemaV2();

	return stringConvertV2(data, schema);
}


Model.prototype.getConvertSchema = function() {
	var self = this;

	if (self._convertSchema !== undefined) {
		return self._convertSchema;
	}
	
	var schema = {};
	
	var walkField = function(field, chain) {
		if (field.type === "array") {
			walkField(field.schema, chain);
		} else if (field.type === "object" || field.type === "indexObject") {
			if (field.schema === undefined) {
				return;
			}
			
			if (field.type === "indexObject") {
				chain.push("~");
			}
			
			field.schema.forEach(function(val, i) {
				var newChain = chain.slice(0);
				newChain.push(val.name);
				walkField(val, newChain);
			});
		} else if (field.type === "class") {
			if (field.class === self.ObjectId) {
				// only class we support is ObjectId
				schema[chain.join(".")] = "objectid";
			}
		} else if (field.type === "any") {
			return;
		} else {
			schema[chain.join(".")] = field.type;
		}
	}
	
	objectLib.forEach(self.fields, function(val, i) {
		if (val.validation === undefined) {
			return;
		}
		
		var chain = [val.name];
		
		var temp = { name : val.name, type : val.validation.type };
		if (val.validation.schema !== undefined) {
			temp.schema = val.validation.schema;
		}
		
		if (val.validation.class !== undefined) {
			temp.class = val.validation.class;
		}
		
		walkField(temp, chain);
	});
	
	self._convertSchema = schema;

	return self.getConvertSchema();
}

Model.prototype.getConvertSchemaV2 = function() {
	var self = this;
	
	if (self._convertSchemaV2 !== undefined) {
		return self._convertSchemaV2;
	}
	
	var schema = self.getConvertSchema();
	
	var newSchema = {};
	
	var schemaKeys = Object.keys(schema);
	for(var i = 0; i < schemaKeys.length; i++) {
		var path = schemaKeys[i];
		var type = schema[path];
		var pathArr = path.split(".");
		
		var current = newSchema;
		for (var j = 0; j < pathArr.length; j++) {
			var currentKey = pathArr[j];
			
			if (j === pathArr.length - 1) {
				current[currentKey] = type;
				break;
			}
			
			if (current[currentKey] === undefined) {
				current[currentKey] = {};
			}
			
			current = current[currentKey];
		}
	}
	
	self._convertSchemaV2 = newSchema;
	
	return self.getConvertSchemaV2();
}

Model.prototype._getHooksByType = function(type, hooks) {
	var self = this;
	
	var matcher = new RegExp("^" + type + "_");
	
	var returnHooks = [];
	
	for(var i = 0; i < hooks.length; i++) {
		var val = hooks[i];
		var isMyType = val.name.match(matcher) !== null;
		if (isMyType === false) { continue; }
		
		var temp = {
			name : val.name.replace(matcher, "")
		}
		
		if (val.args !== undefined) {
			temp.args = val.args;
		}
		
		returnHooks.push(temp);
	}
	
	return returnHooks;
}

Model.prototype._normalizeHooks = function(hooks, cb) {
	var self = this;
	
	// args.hooks
	
	var newHooks = [];
	for(var i = 0; i < hooks.length; i++) {
		var val = hooks[i];
		newHooks.push(typeof val === "string" ? { name : val } : val);
	}
	
	return newHooks;
}

async function _executeHooks(args) {
	var self = this;
	
	// args.hooks
	// args.type
	// args.args
	
	var hooks = [];
	var state = args.args;
	
	for(var i = 0; i < args.hooks.length; i++) {
		var val = args.hooks[i];
		if (val.name.match(/\./) !== null) {
			// only execute hooks which are part of my namespace
			continue;
		}
		
		if (self.hooks[args.type][val.name] === undefined) {
			throw new Error(util.format("Hook '%s' of type '%s' was requested but does not exist", val.name, args.type));
		}
		
		hooks.push({ hook : self.hooks[args.type][val.name], requestedHook : val });
	}
	
	var hookIndex = arrayLib.index(hooks, ["hook", "name"]);
	
	for(var i in self.hooks[args.type]) {
		var val = self.hooks[args.type][i];
		if (hookIndex[i] === undefined && val.required === true) {
			hooks.push({ hook : val, requestedHook : { name : i } });
		}
	}
	
	// no hooks to run, short circuit out
	if (hooks.length === 0) {
		return state;
	}
	
	var calls = [];
	for(let [key, val] of Object.entries(hooks)) {
		await new Promise(function(resolve, reject) {
			state.hookArgs = val.requestedHook.args;
			val.hook.handler(state, function(err, temp) {
				if (err) { return reject(err); }
				
				state = temp;
				
				resolve();
			});
		});
	}
	
	return state;
}

Model.prototype._executeHooksP = _executeHooks;

Model.prototype._executeHooks = callbackify(_executeHooks);

var _getMyFindFields_regex = /^(\w+?)\./;
Model.prototype._getMyFindFields = function(fields) {
	var self = this;
	
	if (fields === null) { return fields };
	
	var newFields = {};
	var hasKeys = false;
	
	for(var val in fields) {
		if (self._virtuals[val] !== undefined) { continue; }
		
		var temp = val.match(_getMyFindFields_regex);
		if (temp === null || self.relationships[temp[1]] === undefined) {
			// if the key either has no root, or it's root is not a known relationship, then include it
			hasKeys = true;
			newFields[val] = fields[val];
		}
	}
	
	if (hasKeys === false) {
		return null;
	}
	
	return newFields;
}

Model.prototype._castDocs = function(docs, options) {
	var self = this;
	
	options = options || {};
	
	var castedDocs = [];
	for(var i = 0; i < docs.length; i++) {
		var val = docs[i];
		castedDocs.push(new self.Document(val, { fillDefaults : false, cloneData : options.cloneData }));
	}
	
	return castedDocs;
}

// Validate and fill defaults into an array of documents. If one document fails it will cb an error
Model.prototype.processDocs = function(args) {
	var self = this;
	
	validator.validate(args, {
		type : "object",
		schema : [
			{ name : "data", type : "array", required : true },
			{ name : "validate", type : "boolean" },
			{ name : "checkRequired", type : "boolean" },
			{ name : "stripEmpty", type : "boolean" }
		],
		allowExtraKeys : false,
		throwOnInvalid : true
	});
	
	var newData = [];
	args.data.forEach(function(val, i) {
		// convert data to Document and back to plain to ensure virtual setters are ran and we know "simple" data is being passed to the DB
		// this step also removes all "undefined"-y values such as [], {}, undefined, and ""
		if (val instanceof self.Document) {
			newData.push(prepareInsert(val, args.stripEmpty));
		} else {
			var temp = new self.Document(val);
			
			newData.push(prepareInsert(temp, args.stripEmpty));
		}
	});
	
	newData.forEach(function(val, i) {
		if (args.validate === true) {
			self._validateDocData(val);
		}
		
		if (args.checkRequired === true) {
			self._checkRequired(val);
		}
	});
	
	return newData;
}

Model.prototype._validateDocData = function(data) {
	var self = this;
	
	var errs = [];
	
	objectLib.forEach(data, function(val, i) {
		if (self._virtuals[i] !== undefined) {
			// value is a virtual 
			delete data[i];
			return;
		}
		
		if (self._documentMethods[i] !== undefined) {
			// value is a documentMethod
			delete data[i];
			return;
		}
		
		if (self.fields[i] !== undefined) {
			if (self.fields[i].persist === false) {
				// value is non-persistent
				delete data[i];
				return;
			}
			
			if (val === null) {
				// allow null to be saved to DB regardless of validation type
				return;
			}
			
			var result = validator.validate(val, self.fields[i].validation);
			
			if (result.success === false) {
				var validationErrors = result.errors.map(function(val) { return val.err.message}).join(",");
				errs.push(util.format("Column '%s' is not of valid type '%s'. Validation Error is: '%s'", i, self.fields[i].validation.type, validationErrors));
			}
			
			return;
		}
		
		if (self._deleteExtraKeys === true) {
			delete data[i];
			return;
		}
		
		if (self._allowExtraKeys === false) {
			// not a virtual, not a field, not allowing extra keys
			errs.push(util.format("Cannot save invalid column '%s'. It is not declared in the Model as a field or a virtual.", i));
			return;
		}
		
		// field is not declared, but the value is still saved because deleteExtrakeys === false && allowExtraKeys === true
	});
	
	if (errs.length > 0) {
		throw new errors.ValidationError("Doc failed validation. " + errs.join(" "));
	}
}

Model.prototype._checkRequired = function(data) {
	var self = this;
	
	var errs = [];
	
	objectLib.forEach(self.fields, function(val, i) {
		if (val.required === true && data[i] === undefined) {
			errs.push(util.format("Column '%s' is required and not provided.", i));
		}
	});
	
	if (errs.length > 0) {
		throw new errors.ValidationError("Doc failed validation. " + errs.join(" "));
	}
}

Model.prototype._fillDocDefaults = function(data) {
	var self = this;
	
	for(var i in self.fields) {
		var val = self.fields[i];
		if (val.default !== undefined && data[i] === undefined) {
			if (typeof val.default === "function") {
				data[i] = val.default({ raw : data, column : i });
			} else {
				data[i] = val.default;
			}
		}
	}
}

Model.prototype._processFields = function(options) {
	var self = this;
	
	var returnData = {
		virtuals : [], // fields which need to be .call() in the return docs
		fields : options.fields,
		fieldsAdded : false,
		virtualsAdded : false,
		hooks : options.hooks
	}
	
	var evaluatedKeys = [];
	
	var hookNames = returnData.hooks.map(val => typeof val === "string" ? val : val.name);
	
	for(var i in options.fields) {
		var val = options.fields[i];
		// we only process truthy fields
		if (val !== 1 && val !== true) { continue; }
		
		// if we have already evaluated this rootKey, such as when { "foo.bar" : 1, "foo.baz" : 1 }, no need to process "foo" twice
		var rootKey = _getRootKey(i);
		if (evaluatedKeys.indexOf(rootKey) > -1) { continue; }
		
		evaluatedKeys.push(rootKey);
		
		var virtual = self._virtuals[rootKey];
		if (virtual === undefined) { continue; }
		
		var temp = self._getFieldDependecies(rootKey);
		for(var j = 0; j < temp.virtuals.length; j++) {
			var val = temp.virtuals[j];
			if (returnData.virtuals.indexOf(val) === -1) {
				returnData.virtualsAdded = true;
				returnData.virtuals.push(val);
			}
		}
		
		for(var j = 0; j < temp.hooks.length; j++) {
			var val = temp.hooks[j];
			if (hookNames.indexOf(val) === -1) {
				hookNames.push(val);
				returnData.hooks.push(val);
			}
		}
		
		temp.fields.forEach(function(val, i) {
			if (returnData.fields[val] !== undefined) { return; }
			
			returnData.fieldsAdded = true;
			returnData.fields[val] = 1;
		});
	}
	
	if (options.castDocs === false && evaluatedKeys.length > 0 && returnData.fields._id === undefined) {
		// if we are in castDocs, and we have at least one truthy key, and no value for _id, then we explicitly exclude it for performance since it's going to be mapped away
		returnData.fields._id = 0;
	}
	
	return returnData;
}

Model.prototype._getFieldDependecies = function(name) {
	var self = this;
	
	var returnData = {
		virtuals : [],
		fields : [],
		hooks : []
	}
	
	if (self.fields[name] !== undefined) {
		returnData.fields.push(name);
	}
	
	var virtual = self._virtuals[name];
	if (virtual === undefined) { return returnData; }
	
	if (virtual.requiredFields !== undefined) {
		virtual.requiredFields.forEach(function(val) {
			var temp = self._getFieldDependecies(val);
			// push the fields on
			returnData.fields.push(...temp.fields);
			// the required virtuals should be pushed before the current virtuals
			returnData.virtuals.push(...temp.virtuals);
			// the required hooks should be pushed before the current hooks
			returnData.hooks.push(...temp.hooks);
		});
	}

	if (virtual.get !== undefined) {
		returnData.virtuals.push(name);
	}

	if (virtual.requiredHooks !== undefined) {
		returnData.hooks.push(...virtual.requiredHooks);
	}
	
	return returnData;
}

var _getRootKey_re = /^[^\.]*/;
var _getRootKey = function(str) {
	return str.match(_getRootKey_re)[0];
}

Model.prototype._executeVirtuals = function(docs, virtuals) {
	var self = this;
	
	docs.forEach(function(val, i) {
		virtuals.forEach(function(virtualName) {
			// check if we have already executed this virtual
			if (val[virtualName] !== undefined) { return; }
			
			// call the virtual
			val[virtualName] = self._virtuals[virtualName].get.call(val);
		});
	});
	
	return;
}

// need a closure to wrap the model reference
var _getModelDocument = function(model) {
	var ModelDocument = function(data, options) {
		var self = this;
		
		data = data || {};
		options = options || {};
		
		options.fillDefaults = options.fillDefaults === undefined ? true : options.fillDefaults;
		options.cloneData = options.cloneData === undefined ? true : options.cloneData;
		
		// clone the incoming data
		var temp = options.cloneData === true ? extend(true, {}, data) : data;
		
		// fold in the top level keys, we can't just call extend on self because it will execute getters on "self" even though it should only execute setters
		for(var i in temp) {
			self[i] = temp[i];
		}
		
		if (options.fillDefaults) {
			model._fillDocDefaults(self);
		}
		
		model._onInit.call(self);
	}
	
	// ensure that objects created from model.Document are instanceof Document
	ModelDocument.prototype = Object.create(Document.prototype);

	ModelDocument.prototype.toJSON = function() {
		var self = this;
		
		var data = {};
		
		// copy across the normal keys
		var keys = Object.keys(self);
		for(var i = 0; i < keys.length; i++) {
			var field = model.fields[keys[i]];
			if (field !== undefined && field.toJSON === false) { continue; }
			
			data[keys[i]] = self[keys[i]];
		}
		
		// copy across keys declared as enumerable virtual values
		var protoKeys = Object.keys(Object.getPrototypeOf(self));
		for(var i = 0; i < protoKeys.length; i++) {
			if (protoKeys[i] === "toJSON") { continue; }
			
			data[protoKeys[i]] = self[protoKeys[i]];
		}
		
		return data;
	}
	
	return ModelDocument;
}

module.exports = Model;