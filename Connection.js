var async = require("async");

var Connection = function(args) {
	var self = this;
	
	args = args || {};
	
	self._db = args.db;
	
	self.models = {};
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
		
		self.models[args.model.name] = args;
		
		cb(null);
	});
}

module.exports = Connection;