var mongolayer = require("./index.js");
var extend = require("extend");

var Document = function(model, args) {
	var self = this;
	
	args = args || {};
	
	extend(self, args);
	
	model._fillDocDefaults(self);
}

module.exports = Document;