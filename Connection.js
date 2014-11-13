var async = require("async");

var Connection = function(args) {
	var self = this;
	
	args = args || {};
	
	self.db = args.db;
	
	self.models = {}; // store public facing models
	self._models = {}; // store arguments of Connection.add()
}

Connection.prototype.add = function(args, cb) {
	var self = this;
	
	// args.model
	
	args.model._setConnection({ connection : self });
	
	var calls = [];
	
	args.model._indexes.forEach(function(val, i) {
		calls.push(function(cb) {
			args.model.collection.ensureIndex(val.keys, val.options, cb);
		});
	});
	
	async.series(calls, function(err) {
		if (err) { return cb(err); }
		
		self.models[args.model.name] = args.model;
		self._models[args.model.name] = args;
		
		cb(null);
	});
}

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
	
	self.db.dropCollection(args.name, function(err) {
		if (err && err.errmsg.match(/ns not found/) === null) {
			return cb(err);
		}
		
		cb(null);
	});
}

module.exports = Connection;