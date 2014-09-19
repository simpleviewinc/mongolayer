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
	
	describe("toPlain", function() {
		var model;
		
		beforeEach(function(done) {
			model = new mongolayer.Model({
				collection : "foo",
				onInit : function() {
					if (this.arrayData !== undefined) {
						this.arrayData.forEach(function(val, i) {
							Object.defineProperty(val, "nuts", {
								get : function() {
									return this.foo + "-nuts";
								}
							});
						});
					}
				},
				fields : [
					{ name : "foo", validation : { type : "string" } },
					{ name : "arrayData", validation : { type : "array", schema : { type : "object" } } }
				]
			});
			
			done();
		});
		
		it("should work on single documents", function(done) {
			var doc = new model.Document({ foo : "bar", arrayData : [{ foo : "bar" }, { foo : "bar2" }] });
			
			assert.equal(doc instanceof model.Document, true);
			
			var temp = mongolayer.toPlain(doc);
			
			assert.equal(temp instanceof model.Document, false);
			
			assert.equal(temp.foo, "bar");
			assert.equal(temp.arrayData[0].foo, "bar");
			assert.equal(temp.arrayData[1].foo, "bar2");
			assert.equal(temp.arrayData[0].nuts, undefined);
			assert.equal(temp.arrayData[1].nuts, undefined);
			
			done();
		});
		
		it("should work on arrays", function(done) {
			var doc = new model.Document({ foo : "bar" });
			var doc2 = new model.Document({ foo : "bar2" });
			
			var temp = mongolayer.toPlain([doc,doc2]);
			
			assert.equal(temp[0] instanceof model.Document, false);
			assert.equal(temp[1] instanceof model.Document, false);
			assert.equal(temp[0].foo, "bar");
			assert.equal(temp[1].foo, "bar2");
			
			done();
		});
	});
	
	describe("conversion", function() {
		it("should convertValue", function(done) {
			var temp = mongolayer.convertValue("true", "boolean");
			assert.equal(temp, true);
			
			var temp = mongolayer.convertValue("false", "boolean");
			assert.equal(temp, false);
			
			var temp = mongolayer.convertValue("10", "number");
			assert.equal(temp, 10);
			
			var temp = mongolayer.convertValue("10.5", "number");
			assert.equal(temp, 10.5);
			
			var temp = mongolayer.convertValue("-100", "number");
			assert.equal(temp, -100);
			
			var date = new Date();
			var temp = mongolayer.convertValue(date.getTime(), "date");
			assert.equal(temp.getTime(), date.getTime());
			
			var id = mongolayer.ObjectId();
			
			var temp = mongolayer.convertValue(id.toString(), "objectid");
			assert.equal(temp.toString(), id.toString());
			
			var temp = mongolayer.convertValue("foo", "string");
			assert.equal(temp, "foo");
			
			// ensure various conditions throw errors
			assert.throws(function() {
				var temp = mongolayer.convertValue("foo", "fakeType");
			}, Error);
			
			assert.throws(function() {
				var temp = mongolayer.convertValue("foo", "number");
			}, Error);
			
			assert.throws(function() {
				var temp = mongolayer.convertValue("foo", "date");
			}, Error);
			
			assert.throws(function() {
				var temp = mongolayer.convertValue("0", "boolean");
			}, Error);
			
			assert.throws(function() {
				var temp = mongolayer.convertValue("foo", "objectid");
			}, Error);
			
			done();
		});
	});
});