// umd boilerplate for CommonJS and AMD
if (typeof exports === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var async = require("async");
	var validator = require("jsvalidator");

	var Runner = function(args) {
		var self = this;
		
		self._it = args.it;
	}

	Runner.prototype.it = function(name) {
		var self = this;
		
		return new Chain({ it : self._it, name : name });
	}

	var Chain = function(args) {
		var self = this;
		
		self._it = args.it;
		self._name = args.name;
		self._before = [];
		self._after = [];
		self._only = false;
	}

	Chain.prototype.run = function(test) {
		var self = this;
		
		(self._only === true ? self._it.only : self._it)(self._name, function(done) {
			var calls = [];
			
			calls.push.apply(calls, self._before);
			calls.push(test.bind(this));
			calls.push.apply(calls, self._after);
			
			async.series(calls, done);
		});
	}

	Chain.prototype.only = function() {
		var self = this;
		
		self._only = true;
		
		return self;
	}

	Chain.prototype.before = function(calls) {
		var self = this;
		
		self._before.push.apply(self._before, calls instanceof Array ? calls : [calls]);
		
		return self;
	}

	Chain.prototype.after = function(calls) {
		var self = this;
		
		self._after.push.apply(self._after, calls instanceof Array ? calls : [calls]);
		
		return self;
	}

	// makes consistent the process of executing testArrays, allow possibility of easily adding before/after arrays at a later date
	var testArray = function(tests, cb) {
		tests.forEach(function(val, i) {
			validator.validate(val, {
				type : "object",
				schema : [
					{ name : "name", type : "string", required : true },
					{ name : "before", type : "array", schema : { type : "function" }, },
					{ name : "only", type : "boolean", default : false },
					{ name : "defer", type : "function", required : true }
				],
				throwOnInvalid : true
			});
			
			(val.only ? it.only : it)(val.name, function(done) {
				var test = val.defer();
				
				var calls = val.before || [];
				
				async.series(calls, function(err, result) {
					if (err) { return done(err); }
					
					return cb(test, done);
				});
			});
		});
	}

	module.exports = {
		Runner : Runner,
		testArray : testArray
	}
});