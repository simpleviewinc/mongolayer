var assert = require("assert");
var mongolayer = require("../index.js");
var config = require("./config.js");

describe(__filename, function() {
	it("should connect", function(done) {
		mongolayer.connect(config, function(err, conn) {
			assert.ifError(err);
			assert.equal(conn instanceof mongolayer.Connection, true);
			
			done();
		});
	});
});