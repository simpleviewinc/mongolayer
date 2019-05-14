var objectLib = require("./lib/objectLib.js");

var QueryLog = function(args) {
	var self = this;
	
	self._type = args.type;
	self._collection = args.collection;
	self._connection = args.connection;
	self._timers = {};
	self._timersComplete = {};
	self._start = Date.now();
}

QueryLog.prototype.startTimer = function(event) {
	var self = this;
	
	self._timers[event] = process.hrtime();
}

QueryLog.prototype.stopTimer = function(event) {
	var self = this;
	
	self._timersComplete[event] = process.hrtime(self._timers[event])[1] / 1000000;
}

QueryLog.prototype.get = function() {
	var self = this;
	
	var result = {
		type : self._type,
		collection : self._collection,
		args : self._args,
		timers : self._timersComplete,
		start : self._start,
		end : Date.now()
	}
	
	return result;
}

QueryLog.prototype.set = function(args) {
	var self = this;
	
	self._args = args;
}

QueryLog.prototype.send = function() {
	var self = this;
	
	self._connection.logger(self.get());
}

module.exports = QueryLog;