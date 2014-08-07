var mongolayer = require("./index.js");
var extend = require("extend");

var Document = function(model, args) {
	var self = this;
	
	args = args || {};
	
	extend(true, self, args);
	
	model._fillDocDefaults(self);
	model._onInit.call(self);
}

module.exports = Document;