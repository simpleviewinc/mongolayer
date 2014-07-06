var extend = require("extend");

var Document = function(args) {
	var self = this;
	
	args = args || {};
	
	extend(self, args);
}

module.exports = Document;