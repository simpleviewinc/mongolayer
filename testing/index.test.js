var assert = require("assert");
var mongoLayer = require("../index.js");
var config = require("./config.js");

describe(__filename, function() {
	it("should connect", function(done) {
		mongoLayer.connect(config, function(err, conn) {
			assert.ifError(err);
			assert.equal(conn instanceof mongoLayer.Connection, true);
			
			done();
		});
	});
});