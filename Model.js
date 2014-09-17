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
	self.collection = null; // stores reference to MongoClient.Db.collection()
	self.ObjectId = mongolayer.ObjectId;
	
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
		afterCount : {},
		beforePut : {},
		afterPut : {},
		beforeFilter : {}
	};
	self.defaultHooks = extend({
		find : [],
		count : [],
		insert : [],
		update : [],
		save : [],
		remove : []
	}, args.defaultHooks);
	self._connection = null; // stores Connection ref
	self._collectionName = args.collection;
	
	self._Document = function(model, args) {
		mongolayer.Document.apply(this, arguments); // call constructor of parent but pass this as context
	};
	
	// ensures that all documents we create are instanceof mongolayer.Document and instanceof self.Document
	self._Document.prototype = Object.create(mongolayer.Document.prototype);
	
	// binds the model into the document so that the core document is aware of the model, but not required when instantiating a new one
	self.Document = self._Document.bind(self._Document, self);
	
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
	// args.hookRequired
	
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
				
				// ensure we only pass hooks if we have them allowing defaultHooks on related models to execute
				var tempHooks = self._getMyHooks(objectKey, args.options.hooks);
				if (tempHooks.length === 0) {
					tempHooks = undefined;
				}
				
				self._connection.models[modelName].find({ _id : { "$in" : ids } }, { hooks : tempHooks }, function(err, docs) {
					if (err) { return cb(err); }
					
					var index = arrayLib.index(docs, "id");
					
					args.docs.forEach(function(val, i) {
						if (val[idKey] instanceof mongolayer.ObjectId && index[val[idKey].toString()] !== undefined) {
							val[objectKey] = index[val[idKey].toString()];
						}
					});
					
					cb(null, args);
				});
			},
			required : args.hookRequired === true
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
				
				// ensure we only pass hooks if we have them allowing defaultHooks on related models to execute
				var tempHooks = self._getMyHooks(objectKey, args.options.hooks);
				if (tempHooks.length === 0) {
					tempHooks = undefined;
				}
				
				self._connection.models[modelName].find({ _id : { "$in" : ids } }, { hooks : tempHooks }, function(err, docs) {
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
			},
			required : args.hookRequired === true
		});
	}
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
	
	self._Document.prototype[args.name] = args.handler;
	self._documentMethods[args.name] = args;
}

Model.prototype.addHook = function(args, cb) {
	var self = this;
	
	// args.type
	// args.name
	// args.handler
	// args.required
	
	self._hooks[args.type][args.name] = args;
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
		
		var calls = [];
		var newDocs = [];
		args.docs.forEach(function(val, i) {
			calls.push(function(cb) {
				self._executeHooks({ type : args.type, hooks : args.hooks, args : { doc : val } }, function(err, temp) {
					if (err) { return cb(err); }
					
					newDocs[i] = temp.doc;
					
					cb(null);
				});
			});
		});
		
		async.parallel(calls, function(err) {
			if (err) { return cb(err); }
			
			cb(null, newDocs);
		});
	}
	
	self._executeHooks({ type : "beforeInsert", hooks : self._getHooksByType("beforeInsert", options.hooks), args : { docs : docs, options : options } }, function(err, args) {
		if (err) { return cb(err); }
		
		callPutHook({ type : "beforePut", hooks : self._getHooksByType("beforePut", args.options.hooks), docs : args.docs }, function(err, newDocs) {
			if (err) { return cb(err); }
			
			// validate/add defaults
			self._processDocs({ data : newDocs, validate : true, checkRequired : true }, function(err, cleanDocs) {
				if (err) { return cb(err); }
				
				// insert the data into mongo
				self.collection.insert(cleanDocs, args.options.options, function(err, result) {
					if (err) { return cb(err); }
					
					var castedDocs = self._castDocs(cleanDocs);
					
					callPutHook({ type : "afterPut", hooks : self._getHooksByType("afterPut", args.options.hooks), docs : castedDocs }, function(err, castedDocs) {
						if (err) { return cb(err); }
						
						self._executeHooks({ type : "afterInsert", hooks : self._getHooksByType("afterInsert", args.options.hooks), args : { result : result, docs : castedDocs, options : args.options } }, function(err, args) {
							if (err) { return cb(err); }
							
							cb(null, isArray ? args.docs : args.docs[0], result);
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
	
	self._executeHooks({ type : "beforeSave", hooks : self._getHooksByType("beforeSave", options.hooks), args : { doc : doc, options : options } }, function(err, args) {
		if (err) { return cb(err); }
		
		self._executeHooks({ type : "beforePut", hooks : self._getHooksByType("beforePut", args.options.hooks), args : { doc : args.doc } }, function(err, tempArgs) {
			if (err) { return cb(err); }
			
			// validate/add defaults
			self._processDocs({ data : [tempArgs.doc], validate : true, checkRequired : true }, function(err, cleanDocs) {
				if (err) { return cb(err); }
				
				self.collection.save(cleanDocs[0], args.options.options, function(err, number, result) {
					if (err) { return cb(err); }
					
					var castedDoc = self._castDocs(cleanDocs)[0];
					
					self._executeHooks({ type : "afterPut", hooks : self._getHooksByType("afterPut", args.options.hooks), args : { doc : castedDoc } }, function(err, tempArgs) {
						if (err) { return cb(err); }
						
						self._executeHooks({ type : "afterSave", hooks : self._getHooksByType("afterSave", args.options.hooks), args : { result : result, doc : tempArgs.doc, options : args.options } }, function(err, args) {
							if (err) { return cb(err); }
							
							cb(null, castedDoc, args.result);
						});
					});
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
	options.hooks = self._normalizeHooks(options.hooks || self.defaultHooks.find);
	options.fields = options.fields || null;
	options.options = options.options || {};
	
	self._executeHooks({ type : "beforeFind", hooks : self._getHooksByType("beforeFind", options.hooks), args : { filter : filter, options : options } }, function(err, args) {
		if (err) { return cb(err); }
		
		self._executeHooks({ type : "beforeFilter", hooks : self._getHooksByType("beforeFilter", args.options.hooks), args : { filter : filter, options : options } }, function(err, args) {
			if (err) { return cb(err); }
			
			var cursor = self.collection.find(args.filter, args.options.fields, args.options.options);
			if (args.options.sort) { cursor = cursor.sort(args.options.sort) }
			if (args.options.limit) { cursor = cursor.limit(args.options.limit) }
			if (args.options.skip) { cursor = cursor.skip(args.options.skip) }
			
			cursor.toArray(function(err, docs) {
				if (err) { return cb(err); }
				
				var castedDocs = self._castDocs(docs);
				
				self._executeHooks({ type : "afterFind", hooks : self._getHooksByType("afterFind", args.options.hooks), args : { filter : args.filter, options : args.options, docs : castedDocs } }, function(err, args) {
					if (err) { return cb(err); }
					
					cb(null, args.docs);
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
	options.hooks = self._normalizeHooks(options.beforeHooks || self.defaultHooks.update);
	options.options = options.options || {};
	
	self._executeHooks({ type : "beforeUpdate", hooks : self._getHooksByType("beforeUpdate", options.hooks), args : { filter : filter, delta: delta, options : options } }, function(err, args) {
		if (err) { return cb(err); }
		
		self._executeHooks({ type : "beforeFilter", hooks : self._getHooksByType("beforeFind", options.hooks), args : { filter : filter, options : options } }, function(err, tempArgs) {
			if (err) { return cb(err); }
			
			var calls = [];
			
			if (Object.keys(args.delta).filter(function(val, i) { return val.match(/^\$/) !== null }).length === 0) {
				// no $ operators at the root level, validate the whole delta
				calls.push(function(cb) {
					self._processDocs({ data : [args.delta], validate : true, checkRequired : true }, function(err, cleanDocs) {
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
				
				self.collection.update(tempArgs.filter, args.delta, tempArgs.options.options, function(err, count, result) {
					if (err) { return cb(err); }
					
					self._executeHooks({ type : "afterUpdate", hooks : self._getHooksByType("afterUpdate", args.options.hooks), args : { filter : tempArgs.filter, delta : args.delta, options : tempArgs.options, count : count, result : result } }, function(err, args) {
						if (err) { return cb(err); }
						
						cb(null, count, result);
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
	
	self._executeHooks({ type : "beforeRemove", hooks : self._getHooksByType("beforeRemove", options.hooks), args : { filter : filter, options : options } }, function(err, args) {
		if (err) { return cb(err); }
		
		self._executeHooks({ type : "beforeFilter", hooks : self._getHooksByType("beforeFilter", args.options.hooks), args : { filter : filter, options : options } }, function(err, args) {
			if (err) { return cb(err); }
			
			self.collection.remove(args.filter, args.options.options, function(err, count) {
				if (err) { return cb(err); }
				
				self._executeHooks({ type : "afterRemove", hooks : self._getHooksByType("afterRemove", args.options.hooks), args : { filter : args.filter, options : args.options, count : count } }, function(err, args) {
					if (err) { return cb(err); }
					
					cb(err, args.count);
				});
			});
		});
	});
}

// Converts structured data of arrays, objects of strings into meaningful primitives
// This is required because HTTP transmits as strings, while server-side code needs primitives such as boolean, number, date and mongoid.
// EXPERIMENTAL!
Model.prototype.stringConvert = function(data) {
	var self = this;
	
	var schema = self.getConvertSchema();
	
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
					returnValue[i] = self._convertValue(val, "boolean");
				} else if (i === "$in" || i === "$nin") {
					returnValue[i] = [];
					val.forEach(function(val2, i2) {
						returnValue[i].push(self._convertValue(val2, type));
					});
				} else if (["$ne", "$gt", "$lt", "$gte", "$lte", "$not"].indexOf(i) !== -1) {
					// fields to convert in-place;
					returnValue[i] = self._convertValue(val, type);
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
							returnValue[i].push(self._convertValue(val2, type));
						}
					});
				} else {
					throw new Error("Unsupported query operator '" + i + "'");
				}
			});
		} else {
			// standard value
			returnValue = self._convertValue(data, type);
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

Model.prototype._convertValue = function(data, type) {
	var self = this;
	
	if (type === "boolean") {
		return data === "true" ? true : false;
	} else if (type === "date") {
		return new Date(data);
	} else if (type === "number") {
		return Number(data);
	} else if (type === "string") {
		return data;
	} else if (type === "objectid") {
		return new self.ObjectId(data);
	} else {
		throw new Error("Cannot convert unknown type '" + type + "'");
	}
}

Model.prototype.getConvertSchema = function() {
	var self = this;
	
	var schema = {};
	
	var walkField = function(field, chain) {
		if (field.type === "array") {
			walkField(field.schema, chain);
		} else if (field.type === "object") {
			if (field.schema === undefined) {
				return;
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
		} else {
			schema[chain.join(".")] = field.type;
		}
	}
	
	objectLib.forEach(self._fields, function(val, i) {
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
	
	return schema;
}

Model.prototype._getHooksByType = function(type, hooks) {
	var self = this;
	
	var matcher = new RegExp("^" + type + "_");
	
	return hooks.filter(function(val) {
		return val.name.match(matcher)
	}).map(function(val) {
		var temp = {
			name : val.name.replace(matcher, "")
		}
		
		if (val.args !== undefined) {
			temp.args = val.args;
		}
		
		return temp;
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

// gets only hooks which apply to my namespace and de-namespaces them
Model.prototype._getMyHooks = function(myKey, hooks) {
	var self = this;
	

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
		castedDocs.push(new self.Document(val, { fillDefaults : false }));
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

module.exports = Model;