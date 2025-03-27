const mongodb = require("mongodb");

// wrapper for ObjectId to allow use with or without `new`
function ObjectId(...args) {
    return new mongodb.ObjectId(...args);
}

ObjectId.prototype = mongodb.ObjectId.prototype;

module.exports = { ObjectId };

