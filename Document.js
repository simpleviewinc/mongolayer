var mongolayer = require("./index.js");
var extend = require("extend");

var Document = function(model, data, options) {
	var self = this;
	
	data = data || {};
	options = options || {};
	
	options.fillDefaults = options.fillDefaults === undefined ? true : false;
	
	extend(true, self, data);
	
	if (options.fillDefaults) {
		model._fillDocDefaults(self);
	}
	
	model._onInit.call(self);
}

module.exports = Document;