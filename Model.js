var mongolayer = require("./index.js");
var objectLib = require("./lib/objectLib.js");
var arrayLib = require("./lib/arrayLib.js");

var validator = require("jsvalidator");
var extend = require("extend");
var async = require("async");
var util = require("util");

var Model = function(args) {
	var self = this;
	
	args = args || {};
	
	validator.validate(args, {
		type : "object",
		schema : [
			{ name : "collection", type : "string", required : true }
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
	self.connected = false;
	
	// private
	self._onInit = args.onInit;
	self._fields = {};
	self._virtuals = {};
	self._relationships = {};
	self.methods = {};
	self._modelMethods = {};
	self._documentMethods = {};
	self._indexes = [];
	self._hooks = {
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
		afterCount : {}
	};
	self.defaultHooks = extend({
		beforeInsert : [],
		afterInsert : [],
		beforeSave : [],
		afterSave : [],
		beforeUpdate : [],
		afterUpdate : [],
		beforeFind : [],
		afterFind : [],
		beforeRemove : [],
		afterRemove : [],
		beforeCount : [],
		afterCount : []
	}, args.defaultHooks);
	self._connection = null; // stores Connection ref
	self._collectionName = args.collection;
	self.collection = null; // stores reference to MongoClient.Db.collection()
	
	self._Document = function(model, args) {
		mongolayer.Document.call(this, model, args); // call constructor of parent but pass this as context
	};
	
	// ensures that all documents we create are instanceof mongolayer.Document and instanceof self.Document
	self._Document.prototype = Object.create(mongolayer.Document.prototype);
	
	// binds the model into the document so that the core document is aware of the model, but not required when instantiating a new one
	self.Document = self._Document.bind(self._Document, self);
	
	self.ObjectId = mongolayer.ObjectId;
	
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
		}
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

Model.prototype._setConnection = function(args) {
	var self = this;
	
	// args.connection
	
	self._connection = args.connection;
	self.collection = args.connection.db.collection(self._collectionName);
	
	self.connected = true;
}

Model.prototype._disconnect = function() {
	var self = this;
	
	self._connection = null;
	self.collection = null;
	
	self.connected = false;
}

Model.prototype.addField = function(args) {
	var self = this;
	
	// args.name
	// args.default
	// args.required
	// args.persist
	// args.validation (jsvalidator syntax)
	
	self._fields[args.name] = args;
}

Model.prototype.addVirtual = function(args) {
	var self = this;
	
	// args.name
	// args.get
	// args.set
	// args.enumerable
	
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
	
	Object.defineProperty(self._Document.prototype, args.name, {
		get : args.get !== undefined ? args.get : undefined,
		set : args.set !== undefined ? args.set : undefined,
		enumerable : args.enumerable
	});
	
	self._virtuals[args.name] = args;
}

Model.prototype.addRelationship = function(args) {
	var self = this;
	
	// args.name
	// args.type
	// args.modelName
	// args.required
	
	var idKey;
	var objectKey = args.name;
	var modelName = args.modelName;
	
	if (args.type === "single") {
		idKey = args.name + "_id";
		
		self.addField({
			name : idKey,
			validation : {
				type : "class",
				class : mongolayer.ObjectId
			},
			required : args.required === true
		});
		
		self.addField({
			name : objectKey,
			persist : false
		});
		
		self.addHook({
			name : objectKey,
			type : "afterFind",
			handler : function(args, cb) {
				if (args.docs.length === 0) {
					return cb(null, args);
				}
				
				var ids = [];
				
				args.docs.forEach(function(val, i) {
					if (val[idKey] instanceof mongolayer.ObjectId) {
						ids.push(val[idKey]);
					}
				});
				
				if (ids.length === 0) {
					return cb(null, args);
				}
				
				var afterHooks = self._getMyHooks(objectKey, args.options.afterHooks);
				var beforeHooks = self._getMyHooks(objectKey, args.options.beforeHooks);
				self._connection.models[modelName].find({ _id : { "$in" : ids } }, { beforeHooks : beforeHooks, afterHooks : afterHooks }, function(err, docs) {
					if (err) { return cb(err); }
					
					var index = arrayLib.index(docs, "id");
					
					args.docs.forEach(function(val, i) {
						if (val[idKey] instanceof mongolayer.ObjectId && index[val[idKey].toString()] !== undefined) {
							val[objectKey] = index[val[idKey].toString()];
						}
					});
					
					cb(null, args);
				});
			}
		});
	} else if (args.type === "multiple") {
		idKey = args.name + "_ids";
		
		self.addField({
			name : idKey,
			validation : {
				type : "array",
				schema : {
					type : "class",
					class : mongolayer.ObjectId
				}
			},
			required : args.required === true
		});
		
		self.addField({
			name : objectKey,
			persist : false
		});
		
		self.addHook({
			name : objectKey,
			type : "afterFind",
			handler : function(args, cb) {
				if (args.docs.length === 0) {
					return cb(null, args);
				}
				
				var ids = [];
				
				args.docs.forEach(function(val, i) {
					if (val[idKey] instanceof Array) {
						ids = ids.concat(val[idKey]);
					}
				});
				
				if (ids.length === 0) {
					return cb(null, args);
				}
				
				var afterHooks = self._getMyHooks(objectKey, args.options.afterHooks);
				var beforeHooks = self._getMyHooks(objectKey, args.options.beforeHooks);
				self._connection.models[modelName].find({ _id : { "$in" : ids } }, { beforeHooks : beforeHooks, afterHooks : afterHooks }, function(err, docs) {
					if (err) { return cb(err); }
					
					var index = arrayLib.index(docs, "id");
					
					args.docs.forEach(function(val, i) {
						if (val[idKey] instanceof Array) {
							var newArray = [];
							
							val[idKey].forEach(function(val, i) {
								if (index[val.toString()] !== undefined) {
									newArray.push(index[val.toString()]);
								}
							});
							
							val[objectKey] = newArray;
						}
					});
					
					cb(null, args);
				});
			}
		});
	}
}

Model.prototype.addIndex = function(args) {
	var self = this;
	
	// args.keys
	// args.options
	
	self._indexes.push(args);
}

Model.prototype._getMyHooks = function(myKey, hooks) {
	// gets only hooks which apply to my namespace and de-namespaces them
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
	
	self._Document.prototype[args.name] = args.handler;
	self._documentMethods[args.name] = args;
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
	
	options.beforeHooks = self._normalizeHooks(options.beforeHooks || self.defaultHooks.beforeInsert);
	options.afterHooks = self._normalizeHooks(options.afterHooks || self.defaultHooks.afterInsert);
	options.options = options.options || {};
	
	self._executeHooks({ type : "beforeInsert", hooks : options.beforeHooks, args : { docs : docs, options : options } }, function(err, args) {
		if (err) { return cb(err); }
		
		// validate/add defaults
		self._processDocs({ data : args.docs, validate : true, checkRequired : true }, function(err, cleanDocs) {
			if (err) { return cb(err); }
			
			// insert the data into mongo
			self.collection.insert(cleanDocs, args.options.options, function(err, objects) {
				if (err) { return cb(err); }
				
				var castedDocs = self._castDocs(objects);
				
				self._executeHooks({ type : "afterInsert", hooks : options.afterHooks, args : { docs : castedDocs, options : args.options } }, function(err, args) {
					if (err) { return cb(err); }
					
					cb(null, isArray ? args.docs : args.docs[0]);
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
	options.beforeHooks = self._normalizeHooks(options.beforeHooks || self.defaultHooks.beforeSave);
	options.afterHooks = self._normalizeHooks(options.afterHooks || self.defaultHooks.afterSave);
	options.options = options.options || {};
	
	self._executeHooks({ type : "beforeSave", hooks : options.beforeHooks, args : { doc : doc, options : options } }, function(err, args) {
		if (err) { return cb(err); }
		
		// validate/add defaults
		self._processDocs({ data : [args.doc], validate : true, checkRequired : true }, function(err, cleanDocs) {
			if (err) { return cb(err); }
			
			self.collection.save(cleanDocs[0], args.options.options, function(err, number, result) {
				if (err) { return cb(err); }
				
				var castedDoc = self._castDocs(cleanDocs)[0];
				
				self._executeHooks({ type : "afterSave", hooks : args.options.afterHooks, args : { result : result, doc : castedDoc, options : args.options } }, function(err, args) {
					if (err) { return cb(err); }
					
					cb(null, castedDoc, args.result);
				});
			});
		});
	});
}

Model.prototype.findById = function(id, options, cb) {
	var self = this;
	
	cb = cb || options;
	
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
	options.beforeHooks = self._normalizeHooks(options.beforeHooks || self.defaultHooks.beforeFind);
	options.afterHooks = self._normalizeHooks(options.afterHooks || self.defaultHooks.afterFind);
	options.fields = options.fields || null;
	options.options = options.options || {};
	
	self._executeHooks({ type : "beforeFind", hooks : options.beforeHooks, args : { filter : filter, options : options } }, function(err, args) {
		if (err) { return cb(err); }
		
		var cursor = self.collection.find(args.filter, args.options.fields, args.options.options);
		if (args.options.sort) { cursor = cursor.sort(args.options.sort) }
		if (args.options.limit) { cursor = cursor.limit(args.options.limit) }
		if (args.options.skip) { cursor = cursor.skip(args.options.skip) }
		
		cursor.toArray(function(err, docs) {
			if (err) { return cb(err); }
			
			var castedDocs = self._castDocs(docs);
			
			self._executeHooks({ type : "afterFind", hooks : options.afterHooks, args : { filter : args.filter, options : args.options, docs : castedDocs } }, function(err, args) {
				if (err) { return cb(err); }
				
				cb(null, args.docs);
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
	options.beforeHooks = self._normalizeHooks(options.beforeHooks || self.defaultHooks.beforeCount);
	options.afterHooks = self._normalizeHooks(options.afterHooks || self.defaultHooks.afterCount);
	options.options = options.options || {};
	
	self._executeHooks({ type : "beforeCount", hooks : options.beforeHooks, args : { filter : filter, options : options } }, function(err, args) {
		if (err) { return cb(err); }
		
		self.collection.count(args.filter, args.options.options, function(err, count) {
			if (err) { return cb(err); }
			
			self._executeHooks({ type : "afterCount", hooks : options.afterHooks, args : { filter : args.filter, options : args.options, count : count } }, function(err, args) {
				if (err) { return cb(err); }
				
				cb(null, args.count);
			});
		});
	});
}

Model.prototype.update = function(filter, delta, options, cb) {
	var self = this;
	
	cb = cb || options;
	options = options === cb ? {} : options;
	options.beforeHooks = self._normalizeHooks(options.beforeHooks || self.defaultHooks.beforeUpdate);
	options.afterHooks = self._normalizeHooks(options.afterHooks || self.defaultHooks.afterUpdate);
	options.options = options.options || {};
	
	self._executeHooks({ type : "beforeUpdate", hooks : options.beforeHooks, args : { filter : filter, delta: delta, options : options } }, function(err, args) {
		if (err) { return cb(err); }
		
		var calls = [];
		
		if (Object.keys(args.delta).filter(function(val, i) { return val.match(/^\$/) !== null }).length === 0) {
			// no $ operators at the root level, validate the whole delta
			calls.push(function(cb) {
				self._validateDocData(args.delta, cb);
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
			
			self.collection.update(args.filter, args.delta, args.options.options, function(err, count, result) {
				if (err) { return cb(err); }
				
				self._executeHooks({ type : "afterUpdate", hooks : options.afterHooks, args : { filter : args.filter, delta : args.delta, options : args.options, count : count, result : result } }, function(err, args) {
					if (err) { return cb(err); }
					
					cb(null, count, result);
				});
			});
		});
	});
}

// Removes from model
// returns err, count
Model.prototype.remove = function(filter, options, cb) {
	var self = this;
	
	cb = cb || options;
	
	if (self.connected === false) {
		return cb(new Error("Model not connected to a MongoDB database"));
	}
	
	options = options === cb ? {} : options;
	options.beforeHooks = self._normalizeHooks(options.beforeHooks || self.defaultHooks.beforeRemove);
	options.afterHooks = self._normalizeHooks(options.afterHooks || self.defaultHooks.afterRemove);
	options.options = options.options || {};
	
	self._executeHooks({ type : "beforeRemove", hooks : options.beforeHooks, args : { filter : filter, options : options } }, function(err, args) {
		if (err) { return cb(err); }
		
		self.collection.remove(args.filter, args.options.options, function(err, count) {
			if (err) { return cb(err); }
			
			self._executeHooks({ type : "afterRemove", hooks : args.options.afterHooks, args : { filter : args.filter, options : args.options, count : count } }, function(err, args) {
				if (err) { return cb(err); }
				
				cb(err, args.count);
			});
		});
	});
}

Model.prototype._normalizeHooks = function(hooks, cb) {
	var self = this;
	
	// args.hooks
	
	var newHooks = [];
	hooks.forEach(function(val, i) {
		newHooks.push(typeof val === "string" ? { name : val } : val);
	});
	
	return newHooks;
}

Model.prototype._executeHooks = function(args, cb) {
	var self = this;
	
	// args.hooks
	// args.type
	// args.args
	
	var hooks = [];
	
	args.hooks.forEach(function(val, i) {
		if (val.name.match(/\./) !== null) {
			// only execute hooks which are part of my namespace
			return false;
		}
		
		if (self._hooks[args.type][val.name] === undefined) {
			throw new Error(util.format("Hook '%s' of type '%s' was requested but does not exist", val.name, args.type));
		}
		
		hooks.push({ hook : self._hooks[args.type][val.name], requestedHook : val });
	});
	
	var hookIndex = arrayLib.index(hooks, ["hook", "name"]);
	
	objectLib.forEach(self._hooks[args.type], function(val, i) {
		if (hookIndex[i] === undefined && val.required === true) {
			hooks.push({ hook : val, requestedHook : { name : i } });
		}
	});
	
	var calls = [];
	var state = args.args;
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
		cb(err, state);
	});
}

Model.prototype._castDocs = function(docs) {
	var self = this;
	
	var castedDocs = [];
	docs.forEach(function(val, i) {
		castedDocs.push(new self.Document(val));
	});
	
	return castedDocs;
}

// Validate and fill defaults into an array of documents. If one document fails it will cb an error
Model.prototype._processDocs = function(args, cb) {
	var self = this;
	
	// args.data
	// args.validate
	// args.checkRequired
	
	var calls = [];
	var noop = function(cb) { cb(null); }
	
	var newData = [];
	args.data.forEach(function(val, i) {
		// convert data to Document and back toPlain to ensure virtual setters are ran and we know "simple" data is being passed to the DB
		if (val instanceof self.Document) {
			newData.push(mongolayer.toPlain(val));
		} else {
			var temp = new self.Document(val);
			newData.push(mongolayer.toPlain(temp));
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
					
					cb(null);
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
		
		if (self._fields[i] !== undefined) {
			if (self._fields[i].persist === false) {
				// value is non-persistent
				delete data[i];
				return;
			}
			
			if (val === null) {
				// allow null to be saved to DB regardless of validation type
				return;
			}
			
			var result = validator.validate(val, self._fields[i].validation);
			
			if (result.success === false) {
				var validationErrors = result.errors.map(function(val) { return val.err.message}).join(",");
				errs.push(util.format("Column '%s' is not of valid type '%s'. Validation Error is: '%s'", i, self._fields[i].validation.type, validationErrors));
			}
			
			return;
		}
		
		// not a virtual, not a field
		errs.push(util.format("Cannot save invalid column '%s'. It is not declared in the Model as a field or a virtual.", i));
	});
	
	if (errs.length > 0) {
		return cb(new Error("Doc failed validation. " + errs.join(" ")));
	}
	
	cb(null);
}

Model.prototype._checkRequired = function(data, cb) {
	var self = this;
	
	var errs = [];
	
	objectLib.forEach(self._fields, function(val, i) {
		if (val.required === true && data[i] === undefined) {
			errs.push(util.format("Column '%s' is required and not provided.", i));
		}
	});
	
	if (errs.length > 0) {
		return cb(new Error("Doc failed validation. " + errs.join(" ")));
	}
	
	cb(null);
}

Model.prototype._fillDocDefaults = function(data) {
	var self = this;
	
	var calls = [];
	
	objectLib.forEach(self._fields, function(val, i) {
		if (val.default !== undefined && data[i] === undefined) {
			if (typeof val.default === "function") {
				data[i] = val.default({ raw : data, column : i });
			} else {
				data[i] = val.default;
			}
		}
	});
}

Model.prototype.addHook = function(args, cb) {
	var self = this;
	
	// args.type
	// args.name
	// args.handler
	// args.required
	
	self._hooks[args.type][args.name] = args;
}

module.exports = Model;