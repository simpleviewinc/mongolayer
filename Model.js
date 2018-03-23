var mongolayer = require("./index.js");
var objectLib = require("./lib/objectLib.js");
var arrayLib = require("./lib/arrayLib.js");

var validator = require("jsvalidator");
var extend = require("extend");
var async = require("async");
var util = require("util");

var queryLogMock = {
	startTimer : function() {},
	stopTimer : function() {},
	get : function() {},
	set : function() {},
	send : function() {}
}

var Model = function(args) {
	var self = this;
	
	args = args || {};
	
	validator.validate(args, {
		type : "object",
		schema : [
			{ name : "collection", type : "string", required : true },
			{ name : "allowExtraKeys", type : "boolean", default : false },
			{ name : "deleteExtraKeys", type : "boolean", default : false }
		],
		throwOnInvalid : true
	});
	
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
	self.name = args.name || args.collection;
	self.collectionName = args.collection;
	self.connected = false;
	self.collection = null; // stores reference to MongoClient.Db.collection()
	self.ObjectId = mongolayer.ObjectId;
	self.fields = {};
	self.relationships = {};
	self.methods = {};
	self.connection = null; // stores Connection ref
	self.hooks = {
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
	
	// private
	self._onInit = args.onInit;
	self._allowExtraKeys = args.allowExtraKeys;
	self._deleteExtraKeys = args.deleteExtraKeys;
	self._virtuals = {};
	self._modelMethods = {};
	self._documentMethods = {};
	self._indexes = [];
	self._convertSchema = undefined;
	self._convertSchemaV2 = undefined;
	
	self.defaultHooks = extend({
		aggregate : [],
		find : [],
		count : [],
		insert : [],
		update : [],
		save : [],
		remove : []
	}, args.defaultHooks);
	
	self.Document = _getModelDocument(self);
	
	// adds _id field
	self.addField({
		name : "_id",
		default : function(args, cb) {
			return new mongolayer.ObjectId();
		},
		validation : {
			type : "class",
			class : mongolayer.ObjectId
		}
	});
	
	// adds id string alias
	self.addVirtual({
		name : "id",
		type : "idToString",
		options : {
			key : "_id"
		},
		requiredFields : ["_id"]
	});
	
	// adds storage for core functionality in case we need this in the future
	self.addField({
		name : "_ml",
		validation : {
			type : "object"
		}
	});
	
	args.modelMethods.forEach(function(val, i) {
		self.addModelMethod(val);
	});
	
	args.documentMethods.forEach(function(val, i) {
		self.addDocumentMethod(val);
	});
	
	args.fields.forEach(function(val, i) {
		self.addField(val);
	});
	
	args.virtuals.forEach(function(val, i) {
		self.addVirtual(val);
	});
	
	args.relationships.forEach(function(val, i) {
		self.addRelationship(val);
	});
	
	args.hooks.forEach(function(val, i) {
		self.addHook(val);
	});
	
	args.indexes.forEach(function(val, i) {
		self.addIndex(val);
	});
}

// re-add all of the indexes to a model, useful if a collection needs to be dropped and re-built at run-time
Model.prototype.createIndexes = function(cb) {
	var self = this;
	
	var calls = [];
	
	self._indexes.forEach(function(val, i) {
		calls.push(function(cb) {
			self.collection.createIndex(val.keys, val.options, function(err) {
				if (err) { return cb(new Error(util.format("Unable to createIndex on model '%s'. Original: %s", self.name, err.message))); }
				
				cb(null);
			});
		});
	});
	
	async.series(calls, cb);
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
			
			this[args.options.key] = new mongolayer.ObjectId(val);
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
			{ name : "rightKeyValidation", type : "object", default : { type : "class", class : mongolayer.ObjectId } }
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
		newOptions.fields = hookArgs.fields !== undefined ? hookArgs.fields : mongolayer._getMyFields(objectKey, args.options.fields || {});
		// use the hookArgs hooks, or cherry-pick the hooks that apply to the relationship
		newOptions.hooks = hookArgs.hooks !== undefined ? hookArgs.hooks : mongolayer._getMyHooks(objectKey, args.options.hooks || []);
		// if we have fields, we pass mapDocs, it will take affect according to the state of castDocs
		newOptions.mapDocs = hookArgs.fields !== undefined ? true : undefined;
		newOptions.castDocs = hookArgs.castDocs !== undefined ? hookArgs.castDocs : args.options.castDocs;
		
		mongolayer.resolveRelationship({
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
			hooks : newOptions.hooks,
			fields : newOptions.fields
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

Model.prototype.insert = function(docs, options, cb) {
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
	options.options.fullResult = true; // this option needed by mongolayer, but we wash it away so the downstream result is the same
	
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
		
		callPutHook({ type : "beforePut", hooks : self._getHooksByType("beforePut", args.options.hooks), docs : args.docs, options : args.options }, function(err, args) {
			if (err) { return cb(err); }
			
			// validate/add defaults
			self.processDocs({ data : args.docs, validate : true, checkRequired : true, stripEmpty : args.options.stripEmpty }, function(err, cleanDocs) {
				if (err) { return cb(err); }
				
				// insert the data into mongo
				self.collection.insert(cleanDocs, args.options.options, function(err, result) {
					if (err) { return cb(err); }
					
					var castedDocs = self._castDocs(cleanDocs);
					
					callPutHook({ type : "afterPut", hooks : self._getHooksByType("afterPut", args.options.hooks), docs : castedDocs, options : args.options }, function(err, args) {
						if (err) { return cb(err); }
						
						self._executeHooks({ type : "afterInsert", hooks : self._getHooksByType("afterInsert", args.options.hooks), args : { result : result, docs : args.docs, options : args.options } }, function(err, args) {
							if (err) { return cb(err); }
							
							cb(null, isArray ? args.docs : args.docs[0], args.result);
						});
					});
				});
			});
		});
	});
}

Model.prototype.save = function(doc, options, cb) {
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
	options.options.fullResult = true; // this option needed by mongolayer, but we wash it away so the downstream result is the same
	
	self._executeHooks({ type : "beforeSave", hooks : self._getHooksByType("beforeSave", options.hooks), args : { doc : doc, options : options } }, function(err, args) {
		if (err) { return cb(err); }
		
		self._executeHooks({ type : "beforePut", hooks : self._getHooksByType("beforePut", args.options.hooks), args : { doc : args.doc, options : args.options } }, function(err, args) {
			if (err) { return cb(err); }
			
			// validate/add defaults
			self.processDocs({ data : [args.doc], validate : true, checkRequired : true, stripEmpty : args.options.stripEmpty }, function(err, cleanDocs) {
				if (err) { return cb(err); }
				
				self.collection.save(cleanDocs[0], args.options.options, function(err, result) {
					if (err) { return cb(err); }
					
					var castedDoc = self._castDocs(cleanDocs)[0];
					
					self._executeHooks({ type : "afterPut", hooks : self._getHooksByType("afterPut", args.options.hooks), args : { doc : castedDoc, options : args.options } }, function(err, args) {
						if (err) { return cb(err); }
						
						self._executeHooks({ type : "afterSave", hooks : self._getHooksByType("afterSave", args.options.hooks), args : { result : result, doc : args.doc, options : args.options } }, function(err, args) {
							if (err) { return cb(err); }
							
							cb(null, castedDoc, args.result);
						});
					});
				});
			});
		});
	});
}

Model.prototype.aggregate = function(pipeline, options, cb) {
	var self = this;
	
	cb = cb || options;
	options = options === cb ? {} : options;
	options.castDocs = options.castDocs !== undefined ? options.castDocs : false;
	options.options = options.options || {};
	options.hooks = self._normalizeHooks(options.hooks || self.defaultHooks.aggregate);
	
	self._executeHooks({ type : "beforeAggregate", hooks : self._getHooksByType("beforeAggregate", options.hooks), args : { pipeline : pipeline, options : options } }, function(err, args) {
		if (err) { return cb(err); }
		
		self.collection.aggregate(args.pipeline, args.options, function(err, docs) {
			if (err) { return cb(err); }
			
			self._executeHooks({ type : "afterAggregate", hooks : self._getHooksByType("afterAggregate", options.hooks), args : { pipeline : args.pipeline, options : args.options, docs : docs } }, function(err, args) {
				if (err) { return cb(err); }
				
				if (args.options.virtuals !== undefined) {
					self._executeVirtuals(args.docs, args.options.virtuals);
				}
				
				if (args.options.castDocs === true) {
					args.docs = self._castDocs(args.docs, { cloneData : false })
				}
				
				if (args.options.maxSize) {
					var size = JSON.stringify(args.docs).length;
					if (size > args.options.maxSize) {
						return cb(new Error("Max size of result set '" + size + "' exceeds options.maxSize of '" + args.options.maxSize + "'"));
					}
				}
				
				cb(null, args.docs);
			});
		});
	});
}

Model.prototype.findById = function(id, options, cb) {
	var self = this;
	
	cb = cb || options;
	options = options === cb ? {} : options;
	
	self.find({ _id : id instanceof mongolayer.ObjectId ? id : new mongolayer.ObjectId(id) }, options, function(err, docs) {
		if (err) { return cb(err); }
		
		cb(null, docs.length === 0 ? null : docs[0]);
	});
}

Model.prototype.find = function(filter, options, cb) {
	var self = this;
	
	cb = cb || options;
	
	if (self.connected === false) {
		return cb(new Error("Model not connected to a MongoDB database"));
	}
	
	options = options === cb ? {} : options;
	options.hooks = options.hooks || self.defaultHooks.find.slice(); // clone default hooks so we don't end up with them being affected when items push on to them via fields
	options.castDocs = options.castDocs !== undefined ? options.castDocs : true;
	options.mapDocs = options.mapDocs !== undefined ? options.mapDocs : true;
	options.fields = options.fields || {};
	options.options = options.options || {};
	
	var originalFields = Object.assign({}, options.fields);
	
	// utilize a mock when logger is disabled for performance reasons
	var queryLog = self.connection.logger === undefined ? queryLogMock : new mongolayer.QueryLog({ type : "find", collection : self.collectionName, connection : self.connection });
	queryLog.startTimer("command");
	
	var fieldResults;
	if (Object.keys(options.fields).length > 0) {
		fieldResults = self._processFields(options);
	}
	
	options.hooks = self._normalizeHooks(options.hooks);
	
	self._executeHooks({ type : "beforeFind", hooks : self._getHooksByType("beforeFind", options.hooks), args : { filter : filter, options : options } }, function(err, args) {
		if (err) { return cb(err); }
		
		self._executeHooks({ type : "beforeFilter", hooks : self._getHooksByType("beforeFilter", args.options.hooks), args : { filter : args.filter, options : args.options } }, function(err, args) {
			if (err) { return cb(err); }
			
			var rawFilter = self.connection.logger === undefined ? {} : extend(true, {}, args.filter);
			var rawOptions = self.connection.logger === undefined ? {} : extend(true, {}, args.options);
			
			var findFields = self._getMyFindFields(args.options.fields);
			
			var cursor = self.collection.find(args.filter, findFields, args.options.options);
			if (args.options.sort) { cursor = cursor.sort(args.options.sort) }
			if (args.options.limit) { cursor = cursor.limit(args.options.limit) }
			if (args.options.skip) { cursor = cursor.skip(args.options.skip) }
			
			var calls = {};
			
			if (args.options.count === true) {
				calls.count = function(cb) {
					cursor.count(false, cb);
				}
			}
			
			calls.docs = function(cb) {
				queryLog.startTimer("raw");
				cursor.toArray(function(err, docs) {
					if (err) { return cb(err); }
					
					queryLog.stopTimer("raw");
					
					cb(null, docs);
				});
			}
			
			async.parallel(calls, function(err, results) {
				if (err) { return cb(err); }
				
				var docs = results.docs;
				var count = results.count;
				
				self._executeHooks({ type : "afterFind", hooks : self._getHooksByType("afterFind", args.options.hooks), args : { filter : args.filter, options : args.options, docs : docs, count : count } }, function(err, args) {
					if (err) { return cb(err); }

					// we set this back to what actually got sent, so that we can verify in unit tests what was sent to mongo
					args.options.fields = findFields;
					
					if (args.options.castDocs === true) {
						args.docs = self._castDocs(args.docs, { cloneData : false });
					}
					
					if (args.options.castDocs === false && fieldResults !== undefined && fieldResults.virtuals.length > 0) {
						// if castDocs === false and our fields obj included any virtual fields we need to execute them to ensure they exist in the output
						self._executeVirtuals(args.docs, fieldResults.virtuals);
					}
					
					if (args.options.mapDocs === true && args.options.castDocs === false && fieldResults !== undefined && fieldResults.fieldsAdded === true) {
						// if we are in a castDocs === false situation with mapDocs true (not a relationship find()), and we have added fields, we need to map them away
						args.docs = objectLib.mongoProject(args.docs, originalFields);
					}
					
					if (args.options.maxSize) {
						var size = JSON.stringify(args.docs).length;
						if (size > args.options.maxSize) {
							return cb(new Error("Max size of result set '" + size + "' exceeds options.maxSize of '" + args.options.maxSize + "'"));
						}
					}
					
					queryLog.stopTimer("command");
					queryLog.set({ rawFilter : args.filter, rawOptions : args.options, count : args.docs.length });
					queryLog.send();
					
					if (args.count !== undefined) {
						cb(null, { count : args.count, docs : args.docs });
					} else {
						cb(null, args.docs);
					}
				});
			});
		});
	});
}

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
		
		self._executeHooks({ type : "beforeFilter", hooks : self._getHooksByType("beforeFilter", args.options.hooks), args : { filter : filter, options : options } }, function(err, args) {
			if (err) { return cb(err); }
			
			self.collection.count(args.filter, args.options.options, function(err, count) {
				if (err) { return cb(err); }
				
				self._executeHooks({ type : "afterCount", hooks : self._getHooksByType("afterCount", args.options.hooks), args : { filter : args.filter, options : args.options, count : count } }, function(err, args) {
					if (err) { return cb(err); }
					
					cb(null, args.count);
				});
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
	options.options.fullResult = true; // this option needed by mongolayer, but we wash it away so the downstream result is the same
	
	self._executeHooks({ type : "beforeUpdate", hooks : self._getHooksByType("beforeUpdate", options.hooks), args : { filter : filter, delta: delta, options : options } }, function(err, args) {
		if (err) { return cb(err); }
		
		self._executeHooks({ type : "beforeFilter", hooks : self._getHooksByType("beforeFilter", options.hooks), args : { filter : filter, options : options } }, function(err, tempArgs) {
			if (err) { return cb(err); }
			
			var calls = [];
			
			if (Object.keys(args.delta).filter(function(val, i) { return val.match(/^\$/) !== null }).length === 0) {
				// no $ operators at the root level, validate the whole delta
				calls.push(function(cb) {
					self.processDocs({ data : [args.delta], validate : true, checkRequired : true, stripEmpty : options.stripEmpty }, function(err, cleanDocs) {
						if (err) { return cb(err); }
						
						args.delta = cleanDocs[0];
						
						// update delta cannot modify _id
						delete args.delta._id;
						
						cb(null);
					});
				});
			} else {
				if (args.delta["$set"] !== undefined) {
					// validate the $set argument
					calls.push(function(cb) {
						self._validateDocData(args.delta["$set"], cb);
					});
				}
				
				if (args.delta["$setOnInsert"] !== undefined) {
					// validate the $setOnInsert argument
					calls.push(function(cb) {
						self._validateDocData(args.delta["$setOnInsert"], cb);
					});
				}
			}
			
			async.series(calls, function(err) {
				if (err) { return cb(err); }
				
				self.collection.update(tempArgs.filter, args.delta, tempArgs.options.options, function(err, result) {
					if (err) { return cb(err); }
					
					self._executeHooks({ type : "afterUpdate", hooks : self._getHooksByType("afterUpdate", args.options.hooks), args : { filter : tempArgs.filter, delta : args.delta, options : tempArgs.options, result : result } }, function(err, args) {
						if (err) { return cb(err); }
						
						cb(null, args.result);
					});
				});
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
	options.options.fullResult = true; // this option needed by mongolayer, but we wash it away so the downstream result is the same
	
	self._executeHooks({ type : "beforeRemove", hooks : self._getHooksByType("beforeRemove", options.hooks), args : { filter : filter, options : options } }, function(err, args) {
		if (err) { return cb(err); }
		
		self._executeHooks({ type : "beforeFilter", hooks : self._getHooksByType("beforeFilter", args.options.hooks), args : { filter : args.filter, options : args.options } }, function(err, args) {
			if (err) { return cb(err); }
			
			self.collection.remove(args.filter, args.options.options, function(err, result) {
				if (err) { return cb(err); }
				
				self._executeHooks({ type : "afterRemove", hooks : self._getHooksByType("afterRemove", args.options.hooks), args : { filter : args.filter, options : args.options, result : result } }, function(err, args) {
					if (err) { return cb(err); }
					
					cb(null, args.result);
				});
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
	
	return mongolayer.stringConvert(data, schema);
}

Model.prototype.stringConvertV2 = function(data) {
	var self = this;

	var schema = self.getConvertSchemaV2();

	return mongolayer.stringConvertV2(data, schema);
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


Model.prototype._executeHooks = function(args, cb) {
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
		return cb(null, state);
	}
	
	var calls = [];
	hooks.forEach(function(val, i) {
		calls.push(function(cb) {
			state.hookArgs = val.requestedHook.args;
			val.hook.handler(state, function(err, temp) {
				if (err) { return cb(err); }
				
				state = temp;
				
				cb(null);
			});
		});
	});
	
	async.series(calls, function(err) {
		if (err) { return cb(err); }
		
		cb(null, state);
	});
}

var _getMyFindFields_regex = /^(\w+?)\./;
Model.prototype._getMyFindFields = function(fields) {
	var self = this;
	
	if (fields === null) { return fields };
	
	var newFields = {};
	var hasKeys = false;
	
	for (var val in fields) {
		// we do not want to include virtuals in the fields object sent to mongo
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
Model.prototype.processDocs = function(args, cb) {
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
	
	var calls = [];
	var noop = function(cb) { cb(null); }
	
	var newData = [];
	args.data.forEach(function(val, i) {
		// convert data to Document and back to plain to ensure virtual setters are ran and we know "simple" data is being passed to the DB
		// this step also removes all "undefined"-y values such as [], {}, undefined, and ""
		if (val instanceof self.Document) {
			newData.push(mongolayer._prepareInsert(val, args.stripEmpty));
		} else {
			var temp = new self.Document(val);
			
			newData.push(mongolayer._prepareInsert(temp, args.stripEmpty));
		}
	});
	
	newData.forEach(function(val, i) {
		calls.push(function(cb) {
			if (args.validate === true) {
				var call = function(cb) {
					self._validateDocData(val, cb);
				}
			} else {
				var call = noop;
			}
			
			call(function(err) {
				if (err) {
					err.message = util.format("Document %s. %s", i, err.message);
					return cb(err);
				}
				
				if (args.checkRequired === true) {
					var call = function(cb) {
						self._checkRequired(val, cb);
					}
				} else {
					var call = noop;
				}
				
				call(function(err) {
					if (err) {
						err.message = util.format("Document %s. %s", i, err.message);
						return cb(err);
					}
					
					setImmediate(cb);
				});
			});
		});
	});
	
	async.series(calls, function(err) {
		if (err) { return cb(err); }
		
		cb(null, newData);
	});
}

Model.prototype._validateDocData = function(data, cb) {
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
		return cb(new mongolayer.errors.ValidationError("Doc failed validation. " + errs.join(" ")));
	}
	
	setImmediate(cb);
}

Model.prototype._checkRequired = function(data, cb) {
	var self = this;
	
	var errs = [];
	
	objectLib.forEach(self.fields, function(val, i) {
		if (val.required === true && data[i] === undefined) {
			errs.push(util.format("Column '%s' is required and not provided.", i));
		}
	});
	
	if (errs.length > 0) {
		return cb(new mongolayer.errors.ValidationError("Doc failed validation. " + errs.join(" ")));
	}
	
	setImmediate(cb);
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
		fields : [name],
		hooks : []
	}
	
	var virtual = self._virtuals[name];
	if (virtual === undefined) { return returnData; }
	
	if (virtual.get !== undefined) {
		returnData.virtuals.push(name);
	}
	
	if (virtual.requiredHooks !== undefined) {
		returnData.hooks.push.apply(returnData.hooks, virtual.requiredHooks);
	}
	
	if (virtual.requiredFields !== undefined) {
		virtual.requiredFields.forEach(function(val, i) {
			var temp = self._getFieldDependecies(val);
			// push the fields on
			returnData.fields.push.apply(returnData.fields, temp.fields);
			// push the required virtuals so they end up before the current virtual
			returnData.virtuals.splice.apply(returnData.virtuals, [i, 0].concat(temp.virtuals));
			// push the required hooks so they end up before the current hook
			returnData.hooks.splice.apply(returnData.hooks, [i, 0].concat(temp.hooks));
		});
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
	
	// ensure that objects created from model.Document are instanceof mongolayer.Document
	ModelDocument.prototype = Object.create(mongolayer.Document.prototype);

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