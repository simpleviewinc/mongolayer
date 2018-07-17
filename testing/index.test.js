var assert = require("assert");
var mongolayer = require("../index.js");
var config = require("./config.js");
var mongodb = require("mongodb");
var async = require("async");

describe(__filename, function() {
	after(function(done) {
		mongolayer._clearConnectCache();
		return done();
	});
	
	it("should connect", function(done) {
		mongolayer.connect(config(), function(err, conn) {
			assert.ifError(err);
			assert.equal(conn instanceof mongolayer.Connection, true);
			
			conn.close(done);
		});
	});
	
	it("should connectCached", function(done) {
		var conn1;
		var conn2;
		var conn3;
		var conn4;
		
		async.series([
			function(cb) {
				mongolayer.connect(config(), function(err, conn) {
					assert.ifError(err);
					
					conn1 = conn;
					
					cb(null);
				});
			},
			function(cb) {
				mongolayer.connect(config(), function(err, conn) {
					assert.ifError(err);
					
					conn2 = conn;
					
					cb(null);
				});
			},
			function(cb) {
				mongolayer.connectCached(config(), function(err, conn) {
					assert.ifError(err);
					
					conn3 = conn;
					
					cb(null);
				});
			},
			function(cb) {
				mongolayer.connectCached(config(), function(err, conn) {
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
			
			async.series([
				(cb) => conn1.close(cb),
				(cb) => conn2.close(cb),
				(cb) => conn3.close(cb),
				(cb) => conn4.close(cb)
			], done);
		});
	});
	
	it("should _newErrorType", function(done) {
		var NewErrorType = mongolayer._newErrorType("MyName");
		
		var err = new NewErrorType();
		assert.ok(err instanceof Error);
		assert.ok(err instanceof NewErrorType);
		assert.equal(err.name, "MyName");
		assert.equal(err.toString(), "MyName");
		
		// ensure custom message are propagating
		var err = new NewErrorType("CustomMessage");
		assert.equal(err.message, "CustomMessage");
		assert.equal(err.toString(), "MyName: CustomMessage");
		
		done();
	});
	
	it("should have errors.ValidationError", function(done) {
		var err = new mongolayer.errors.ValidationError();
		assert.ok(err instanceof Error);
		assert.ok(err instanceof mongolayer.errors.ValidationError);
		done();
	});
	
	describe("_prepareInsert", function() {
		it("should pass through simple", function() {
			assert.strictEqual(mongolayer._prepareInsert("foo"), "foo");
			assert.strictEqual(mongolayer._prepareInsert(5), 5);
			assert.strictEqual(mongolayer._prepareInsert(null), null);
			assert.strictEqual(mongolayer._prepareInsert(true), true);
			assert.strictEqual(mongolayer._prepareInsert(new Date(2001, 9, 11)).getTime(), (new Date(2001, 9, 11)).getTime());
			var id = new mongolayer.ObjectId();
			assert.strictEqual(mongolayer._prepareInsert(id).toString(), id.toString());
			
			// ensure that arrays stay as arrays and objects as objects, deepEqual cannot be relied on for this check
			var temp = mongolayer._prepareInsert({ foo : { something : "yes" }, baz : [1,2,3] });
			assert.equal(temp.baz instanceof Array, true);
			assert.equal(temp.foo.constructor === ({}).constructor, true);
		});
		
		it("should walk objects", function() {
			assert.deepEqual(mongolayer._prepareInsert({ foo : "something", bar : "another" }), { foo : "something", bar : "another" })
			assert.deepEqual(mongolayer._prepareInsert({ foo : "something", bar : { inner : true } }), { foo : "something", bar : { inner : true } });
		});
		
		it("should clone objects", function() {
			var temp = {};
			assert.notEqual(mongolayer._prepareInsert(temp), temp);
			
			var full = { foo : { more : true } };
			var temp = mongolayer._prepareInsert(full);
			assert.notEqual(temp, full);
			assert.notEqual(temp.foo, full.foo);
			// proof of concept
			assert.equal(full.foo, full.foo);
		});
		
		it("should clone arrays", function() {
			var temp = [];
			assert.notEqual(mongolayer._prepareInsert(temp), temp);
			
			var full = [1,2,3];
			var temp = mongolayer._prepareInsert(full);
			assert.notEqual(temp, full);
		});
		
		it("should 'empty' data such as empty array/object/string", function() {
			assert.strictEqual(mongolayer._prepareInsert({}), undefined);
			assert.strictEqual(mongolayer._prepareInsert(""), undefined);
			assert.strictEqual(mongolayer._prepareInsert([]), undefined);
			assert.strictEqual(mongolayer._prepareInsert({ foo : "" }), undefined);
			// test a deeply nested structure which should be entirely trimmed
			assert.strictEqual(mongolayer._prepareInsert({ foo : { bar : [{ baz : [undefined] }] }, undef : undefined }), undefined);
			// test removal of array elements based on same "non-existent" idea
			assert.deepEqual(mongolayer._prepareInsert({ foo : [1,""] }), { foo : [1] });
		});
		
		it("should not 'empty' data such as empty array/object/string", function() {
			assert.deepEqual(mongolayer._prepareInsert({}, false), {});
			assert.deepEqual(mongolayer._prepareInsert([], false), []);
			assert.strictEqual(mongolayer._prepareInsert("", false), "");
			
			assert.deepEqual(mongolayer._prepareInsert({ foo : "" }, false), { foo : "" });
			// test a deeply nested structure
			assert.deepEqual(mongolayer._prepareInsert({ foo : { bar : [{ baz : [undefined] }] }, undef : undefined }, false), { foo : { bar : [{ baz : [] }] } });
			// test array elements
			assert.deepEqual(mongolayer._prepareInsert({ foo : [1,""] }, false), { foo : [1,""] });
		});
		
		it("should not run getters or functions", function() {
			var temp = {
				valid : true,
				func : function() { return "fail" }
			};
			Object.defineProperty(temp, "foo", {
				get : function() {
					return "fail";
				},
				enumerable : true
			});
			
			var result = mongolayer._prepareInsert(temp);
			assert.equal(result.valid, true);
			assert.equal(result.foo, undefined);
			assert.equal(result.func, undefined);
		});
		
		it("should simplify Function", function() {
			var Test = function() {
				this.foo = "something";
			};
			
			Object.defineProperty(Test, "fail", {
				get : function() {
					return "getFail"
				},
				enumerable : true
			});
			
			Object.defineProperty(Test.prototype, "failProto", {
				get : function() {
					return "protoFail"
				},
				enumerable : true
			});
			
			var test = new Test();
			var result = mongolayer._prepareInsert(test);
			assert.equal(result.foo, "something");
			assert.equal(result instanceof Test, false);
			assert.equal(result instanceof Object, true);
			assert.equal(result.fail, undefined);
			assert.equal(result.failProto, undefined);
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
			
			var temp = mongolayer.convertValue("1", "boolean");
			assert.equal(temp, true);
			
			var temp = mongolayer.convertValue(1, "boolean");
			assert.equal(temp, true);
			
			var temp = mongolayer.convertValue("0", "boolean");
			assert.equal(temp, false);
			
			var temp = mongolayer.convertValue(0, "boolean");
			assert.equal(temp, false);
			
			var temp = mongolayer.convertValue("yes", "boolean");
			assert.equal(temp, true);
			
			var temp = mongolayer.convertValue("no", "boolean");
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
			
			var temp = mongolayer.convertValue(date.getTime().toString(), "date");
			assert.equal(temp.getTime(), date.getTime());
			
			var id = mongolayer.ObjectId();
			
			var temp = mongolayer.convertValue(id.toString(), "objectid");
			assert.equal(temp.toString(), id.toString());
			
			var temp = mongolayer.convertValue("foo", "string");
			assert.equal(temp, "foo");
			
			var temp = mongolayer.convertValue("foo", "any");
			assert.strictEqual(temp, "foo");
			
			var temp = mongolayer.convertValue(5, "any");
			assert.strictEqual(temp, 5);
			
			// ensure items which are already converted work
			var temp = mongolayer.convertValue(5, "number");
			assert.equal(temp, 5);
			
			var tempVal = new Date();
			var temp = mongolayer.convertValue(tempVal, "date");
			assert.equal(temp, tempVal);
			
			var tempVal = new mongolayer.ObjectId();
			var temp = mongolayer.convertValue(tempVal, "objectid");
			assert.equal(temp, tempVal);
			
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
				var temp = mongolayer.convertValue("notBool", "boolean");
			}, Error);
			
			assert.throws(function() {
				var temp = mongolayer.convertValue("foo", "objectid");
			}, Error);
			
			done();
		});
	});
	
	it("should _getMyHooks", function(done) {
		var test = mongolayer._getMyHooks("foo", [{ name : "nuts" }, { name : "foo" }, { name : "foo.bar" }, { name : "foo.bar.baz" }]);
		assert.deepStrictEqual(test, [
			{ name : "bar" },
			{ name : "bar.baz" }
		]);

		var test = mongolayer._getMyHooks("foo", []);
		assert.deepStrictEqual(test, []);
		
		done();
	});

	it("should _getMyFields", function(done) {
		var test = mongolayer._getMyFields("foo", { "nuts" : 1, "foo" : 1, "foo.bar" : 1, "foo.bar.baz" : 1 });
		assert.deepStrictEqual(test, { "bar" : 1, "bar.baz" : 1 });

		var test = mongolayer._getMyFields("foo", {});
		assert.deepStrictEqual(test, {});
		
		done();
	});
	
	it("should testId", function(done) {
		assert.equal(mongolayer.testId("test"), "746573740000000000000000");
		assert.equal(mongolayer.testId("ZZ"), "5a5a00000000000000000000");
		
		assert.throws(function() {
			mongolayer.testId("toolongstring");
		}, /String must be 12 or less characters long/);
		
		done();
	});
});