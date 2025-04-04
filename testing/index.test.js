var assert = require("assert");
var mongolayer = require("../src/index.js");
var config = require("./config.js");
var mongodb = require("mongodb");
var async = require("async");
const { testArray } = require("@simpleview/mochalib");
const ObjectId = require("../src/ObjectId");

const {
	_newErrorType,
	convertValue,
	errors,
	getMyHooks,
	getMyFields,
	prepareInsert
} = require("../src/utils");

describe(__filename, function() {
	after(function(done) {
		mongolayer._clearConnectCache();
		return done();
	});
	
	describe("connect", function() {
		var tests = [
			{
				name : "connect without a db without trailing slash",
				args : () => ({
					args : {
						connectionString : "mongodb://db:27017"
					},
					error : /You must specify a database in your connectionString\./
				})
			},
			{
				name : "connect without a db, trailing slash",
				args : () => ({
					args : {
						connectionString : "mongodb://db:27017/"
					},
					error : /You must specify a database in your connectionString\./
				})
			},
			{
				name : "connect with a db",
				args : () => ({
					args : {
						connectionString : "mongodb://db:27017/mongolayer"
					},
					dbName : "mongolayer"
				})
			}
		]
		
		testArray(tests, function(test) {
			return new Promise(function(resolve) {
				mongolayer.connect(test.args, function(err, conn) {
					if (test.error) {
						assert.ok(err.message.match(test.error));
						return resolve();
					}
					
					assert.ifError(err);
					
					if (test.dbName) {
						assert.strictEqual(conn.db.databaseName, test.dbName);
					} else {
						assert.strictEqual(conn.db, undefined);
					}
					
					assert.strictEqual(conn.client instanceof mongodb.MongoClient, true);

					return conn.close(resolve);
				});
			});
		});
	});
	
	it("should connectCached", async function() {
		const conn1 = await mongolayer.promises.connect(config());
		const conn2 = await mongolayer.promises.connect(config());
		const conn3 = await mongolayer.promises.connectCached(config());
		const conn4 = await mongolayer.promises.connectCached(config());
		
		assert.notEqual(conn1.db, conn2.db);
		assert.notEqual(conn1, conn2);
		assert.strictEqual(conn3.client, conn4.client);
		assert.notEqual(conn3, conn4);
		
		await conn1.promises.close();
		await conn2.promises.close();
		await conn3.promises.close();
		await conn4.promises.close();
	});
	
	it("should _newErrorType", function(done) {
		var NewErrorType = _newErrorType("MyName");
		
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
		var err = new errors.ValidationError();
		assert.ok(err instanceof Error);
		assert.ok(err instanceof errors.ValidationError);
		done();
	});
	
	describe("prepareInsert", function() {
		it("should pass through simple", function() {
			assert.strictEqual(prepareInsert("foo"), "foo");
			assert.strictEqual(prepareInsert(5), 5);
			assert.strictEqual(prepareInsert(null), null);
			assert.strictEqual(prepareInsert(true), true);
			assert.strictEqual(prepareInsert(new Date(2001, 9, 11)).getTime(), (new Date(2001, 9, 11)).getTime());
			var id = new mongolayer.ObjectId();
			assert.strictEqual(prepareInsert(id).toString(), id.toString());
			
			// ensure that arrays stay as arrays and objects as objects, deepEqual cannot be relied on for this check
			var temp = prepareInsert({ foo : { something : "yes" }, baz : [1,2,3] });
			assert.equal(temp.baz instanceof Array, true);
			assert.equal(temp.foo.constructor === ({}).constructor, true);
		});
		
		it("should walk objects", function() {
			assert.deepEqual(prepareInsert({ foo : "something", bar : "another" }), { foo : "something", bar : "another" })
			assert.deepEqual(prepareInsert({ foo : "something", bar : { inner : true } }), { foo : "something", bar : { inner : true } });
		});
		
		it("should clone objects", function() {
			var temp = {};
			assert.notEqual(prepareInsert(temp), temp);
			
			var full = { foo : { more : true } };
			var temp = prepareInsert(full);
			assert.notEqual(temp, full);
			assert.notEqual(temp.foo, full.foo);
			// proof of concept
			assert.equal(full.foo, full.foo);
		});
		
		it("should clone arrays", function() {
			var temp = [];
			assert.notEqual(prepareInsert(temp), temp);
			
			var full = [1,2,3];
			var temp = prepareInsert(full);
			assert.notEqual(temp, full);
		});
		
		it("should 'empty' data such as empty array/object/string", function() {
			assert.strictEqual(prepareInsert({}), undefined);
			assert.strictEqual(prepareInsert(""), undefined);
			assert.strictEqual(prepareInsert([]), undefined);
			assert.strictEqual(prepareInsert({ foo : "" }), undefined);
			// test a deeply nested structure which should be entirely trimmed
			assert.strictEqual(prepareInsert({ foo : { bar : [{ baz : [undefined] }] }, undef : undefined }), undefined);
			// test removal of array elements based on same "non-existent" idea
			assert.deepEqual(prepareInsert({ foo : [1,""] }), { foo : [1] });
		});
		
		it("should not 'empty' data such as empty array/object/string", function() {
			assert.deepEqual(prepareInsert({}, false), {});
			assert.deepEqual(prepareInsert([], false), []);
			assert.strictEqual(prepareInsert("", false), "");
			
			assert.deepEqual(prepareInsert({ foo : "" }, false), { foo : "" });
			// test a deeply nested structure
			assert.deepEqual(prepareInsert({ foo : { bar : [{ baz : [undefined] }] }, undef : undefined }, false), { foo : { bar : [{ baz : [] }] } });
			// test array elements
			assert.deepEqual(prepareInsert({ foo : [1,""] }, false), { foo : [1,""] });
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
			
			var result = prepareInsert(temp);
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
			var result = prepareInsert(test);
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
			var temp = convertValue("true", "boolean");
			assert.equal(temp, true);
			
			var temp = convertValue("false", "boolean");
			assert.equal(temp, false);
			
			var temp = convertValue("1", "boolean");
			assert.equal(temp, true);
			
			var temp = convertValue(1, "boolean");
			assert.equal(temp, true);
			
			var temp = convertValue("0", "boolean");
			assert.equal(temp, false);
			
			var temp = convertValue(0, "boolean");
			assert.equal(temp, false);
			
			var temp = convertValue("yes", "boolean");
			assert.equal(temp, true);
			
			var temp = convertValue("no", "boolean");
			assert.equal(temp, false);
			
			var temp = convertValue("10", "number");
			assert.equal(temp, 10);
			
			var temp = convertValue("10.5", "number");
			assert.equal(temp, 10.5);
			
			var temp = convertValue("-100", "number");
			assert.equal(temp, -100);
			
			var date = new Date();
			var temp = convertValue(date.getTime(), "date");
			assert.equal(temp.getTime(), date.getTime());
			
			var temp = convertValue(date.getTime().toString(), "date");
			assert.equal(temp.getTime(), date.getTime());
			
			var id = new mongolayer.ObjectId();
			
			var temp = convertValue(id.toString(), "objectid");
			assert.equal(temp.toString(), id.toString());
			
			var temp = convertValue("foo", "string");
			assert.equal(temp, "foo");
			
			var temp = convertValue("foo", "any");
			assert.strictEqual(temp, "foo");
			
			var temp = convertValue(5, "any");
			assert.strictEqual(temp, 5);
			
			// ensure items which are already converted work
			var temp = convertValue(5, "number");
			assert.equal(temp, 5);
			
			var tempVal = new Date();
			var temp = convertValue(tempVal, "date");
			assert.equal(temp, tempVal);
			
			var tempVal = new mongolayer.ObjectId();
			var temp = convertValue(tempVal, "objectid");
			assert.equal(temp, tempVal);
			
			// ensure various conditions throw errors
			assert.throws(function() {
				var temp = convertValue("foo", "fakeType");
			}, Error);
			
			assert.throws(function() {
				var temp = convertValue("foo", "number");
			}, Error);
			
			assert.throws(function() {
				var temp = convertValue("foo", "date");
			}, Error);
			
			assert.throws(function() {
				var temp = convertValue("notBool", "boolean");
			}, Error);
			
			assert.throws(function() {
				var temp = convertValue("foo", "objectid");
			}, Error);
			
			done();
		});
	});
	
	it("should getMyHooks", function(done) {
		var test = getMyHooks("foo", [{ name : "nuts" }, { name : "foo" }, { name : "foo.bar" }, { name : "foo.bar.baz" }]);
		assert.deepStrictEqual(test, [
			{ name : "bar" },
			{ name : "bar.baz" }
		]);

		var test = getMyHooks("foo", []);
		assert.deepStrictEqual(test, []);
		
		done();
	});

	it("should getMyFields", function(done) {
		var test = getMyFields("foo", { "nuts" : 1, "foo" : 1, "foo.bar" : 1, "foo.bar.baz" : 1 });
		assert.deepStrictEqual(test, { "bar" : 1, "bar.baz" : 1 });

		var test = getMyFields("foo", {});
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

	it("should wrap ObjectId", function(done) {
		const withNew = new ObjectId();
		const withNewArgs = new ObjectId("5a5a00000000000000000000");
		const withoutNew = ObjectId();
		const withoutNewArgs = ObjectId("5a5a00000000000000000000");

		assert(withNew instanceof ObjectId);
		assert(withNewArgs instanceof ObjectId);
		assert(withoutNew instanceof ObjectId);
		assert(withoutNewArgs instanceof ObjectId);
		assert(withNew instanceof mongodb.ObjectId);
		assert(withNewArgs instanceof mongodb.ObjectId);
		assert(withoutNew instanceof mongodb.ObjectId);
		assert(withoutNewArgs instanceof mongodb.ObjectId);

		done();
	});
});

