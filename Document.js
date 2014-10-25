var mongolayer = require("./index.js");
var extend = require("extend");

var Document = function(model, data, options) {
	var self = this;
	
	data = data || {};
	options = options || {};
	
	options.fillDefaults = options.fillDefaults === undefined ? true : false;
	
	// clone the incoming data
	var temp = extend(true, {}, data);
	
	// fold in the top level keys, we can't just call extend on self because it will execute getters on "self" even though it should only execute setters
	Object.keys(temp).forEach(function(i) {
		self[i] = temp[i];
	});
	
	if (options.fillDefaults) {
		model._fillDocDefaults(self);
	}
	
	model._onInit.call(self);
}

Document.prototype.toJSON = function() {
	var self = this;
	
	return mongolayer.toPlain(self);
}

module.exports = Document;