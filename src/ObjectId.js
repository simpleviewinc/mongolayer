const { ObjectId: ObjectIdCore } = require("mongodb");

// wrapper for ObjectId to allow use with or without `new`
function ObjectId(...args) {
	return new ObjectIdCore(...args);
}

ObjectId.prototype = ObjectIdCore.prototype;

module.exports = ObjectId;

