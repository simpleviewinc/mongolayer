var mongolayer = require("./index.js");
var extend = require("extend");

var modelMap = new WeakMap();

var Document = function(model, data, options) {
	var self = this;
	
	// stash reference to model in WeakMap
	modelMap.set(self, model);
	
	data = data || {};
	options = options || {};
	
	options.fillDefaults = options.fillDefaults === undefined ? true : options.fillDefaults;
	options.cloneData = options.cloneData === undefined ? true : options.cloneData;
	
	// clone the incoming data
	var temp = options.cloneData === true ? extend(true, {}, data) : data;
	
	// fold in the top level keys, we can't just call extend on self because it will execute getters on "self" even though it should only execute setters
	var keys = Object.keys(temp);
	for(var i = 0; i < keys.length; i++) {
		self[keys[i]] = temp[keys[i]];
	}
	
	if (options.fillDefaults) {
		model._fillDocDefaults(self);
	}
	
	model._onInit.call(self);
}

Document.prototype.toJSON = function() {
	var self = this;
	
	// retrieve model for checking toJSON
	var model = modelMap.get(self);
	
	var data = {};
	
	// copy across the normal keys
	var keys = Object.keys(self);
	for(var i = 0; i < keys.length; i++) {
		var field = model.fields[keys[i]];
		if (field !== undefined && field.toJSON === false) { continue; }
		
		data[keys[i]] = self[keys[i]];
	}
	
	// copy across keys declared as enumerable virtual values
	var protoKeys = Object.keys(Object.getPrototypeOf(self));
	for(var i = 0; i < protoKeys.length; i++) {
		if (protoKeys[i] === "toJSON") { continue; }
		
		data[protoKeys[i]] = self[protoKeys[i]];
	}
	
	return data;
}

module.exports = Document;