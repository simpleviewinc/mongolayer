var assert = require("assert");
var mongolayer = require("../index.js");
var config = require("./config.js");
var mongodb = require("mongodb");
var async = require("async");

describe(__filename, function() {
	it("should connect", function(done) {
		mongolayer.connect(config, function(err, conn) {
			assert.ifError(err);
			assert.equal(conn instanceof mongolayer.Connection, true);
			
			done();
		});
	});
	
	it("should connectCached", function(done) {
		var conn1;
		var conn2;
		var conn3;
		var conn4;
		
		async.series([
			function(cb) {
				mongolayer.connect(config, function(err, conn) {
					assert.ifError(err);
					
					conn1 = conn;
					
					cb(null);
				});
			},
			function(cb) {
				mongolayer.connect(config, function(err, conn) {
					assert.ifError(err);
					
					conn2 = conn;
					
					cb(null);
				});
			},
			function(cb) {
				mongolayer.connectCached(config, function(err, conn) {
					assert.ifError(err);
					
					conn3 = conn;
					
					cb(null);
				});
			},
			function(cb) {
				mongolayer.connectCached(config, function(err, conn) {
					assert.ifError(err);
					
					conn4 = conn;
					
					cb(null);
				});
			}
		], function(err) {
			assert.notEqual(conn1.db, conn2.db);
			assert.notEqual(conn1, conn2);
			assert.equal(conn3.db, conn4.db);
			assert.notEqual(conn3, conn4);
			
			done();
		});
	});
});