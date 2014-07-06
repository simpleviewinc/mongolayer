var extend = require("/sv/node_modules/npm/extend/1/node_modules/extend/");

var forEach = function(obj, callback) {
	for(var i in obj) {
		callback(obj[i], i);
	}
}

var unindex = function(obj) {
	var data = [];
	
	forEach(obj, function(val, i) {
		data.push(val);
	});
	
	return data;
}

var wrapConstructor = function(object, addArgs) {
	return function(args) {
		return new object(extend({}, args, addArgs));
	}
}

module.exports = {
	forEach : forEach,
	unindex : unindex,
	wrapConstructor : wrapConstructor
}