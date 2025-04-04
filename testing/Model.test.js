var assert = require("assert");
var mongolayer = require("../src/index.js");
var config = require("./config.js");
var assertLib = require("@simpleview/assertlib");
const { testArray } = require("@simpleview/mochalib");
const { Collection } = require("mongodb");

var async = require("async");

var mongoId = { type : "object", class : mongolayer.ObjectId };

const {
	errors,
	prepareInsert
} = require("../src/utils.js");

describe(__filename, function() {
	var conn;
	
	beforeEach(function(done) {
		mongolayer.connectCached(config(), function(err, temp) {
			assert.ifError(err);
			
			conn = temp;
			
			done();
		});
	});
	
	after(function(done) {
		mongolayer._clearConnectCache();
		conn.close(done);
	});
	
	it("should create", function(done) {
		new mongolayer.Model({ collection : "foo" });
		
		done();
	});
	
	it("should setConnection and disconnect", async function() {
		var model = new mongolayer.Model({ collection : "some_table" });
		const conn = await mongolayer.promises.connectCached(config());

		model.setConnection({
			connection: conn
		});
		
		assert.strictEqual(model.connected, true);
		assert.strictEqual(model.collection instanceof Collection, true);
		
		model.disconnect();
		
		assert.strictEqual(model.connected, false);
		assert.strictEqual(model.connection, null);
		assert.strictEqual(model.collection, null);
	});
	
	it("should get id and _id fields by default", function(done) {
		var model = new mongolayer.Model({ collection : "foo" });
		
		assert.notEqual(model.fields["_id"], undefined);
		assert.notEqual(model._virtuals["id"], undefined);
		
		done();
	});
	
	it("should addFields in constructor", function(done) {
		var model = new mongolayer.Model({
			collection : "foo",
			fields : [
				{ name : "foo", validation : { type : "string" } },
				{ name : "bar", validation : { type : "number" } },
				{ name : "baz", validation : { type : "string" } }
			]
		});
		
		assert.equal(model.fields["foo"].validation.type, "string");
		assert.equal(model.fields["bar"].validation.type, "number");
		
		done();
	});
	
	it("should addVirtuals in constructor", function(done) {
		var model = new mongolayer.Model({
			collection : "foo",
			virtuals : [
				{ name : "bar", get : function() { return "barValue" } },
				{ name : "baz", get : function() { return "bazValue" }, enumerable : false },
				{ name : "alterFoo", set : function(data) { this.foo = data }, enumerable : false }
			]
		});
		
		var doc = new model.Document({ foo : "fooValue" });
		
		assert.equal(doc.foo, "fooValue");
		assert.equal(doc.bar, "barValue");
		assert.equal(doc.baz, "bazValue");
		
		doc.alterFoo = "fooValue2";
		
		assert.equal(doc.foo, "fooValue2");
		
		done();
	});
	
	it("should addMethods in constructor", function(done) {
		var model = new mongolayer.Model({
			collection : "foo",
			fields : [
				{ name : "foo", validation : { type : "string" } }
			],
			modelMethods : [
				{
					name : "foo",
					handler : function(args) {
						assert.equal(this, model);
						
						return args;
					}
				}
			],
			documentMethods : [
				{
					name : "foo2",
					handler : function(args) {
						assert.equal(this, doc);
						
						return this.foo + " " + args;
					}
				}
			]
		});
		
		var doc = new model.Document({ foo : "fooValue" });
		
		assert.equal(model.methods.foo("modelMethod"), "modelMethod");
		assert.equal(doc.foo2("documentMethod"), "fooValue documentMethod");
		
		done();
	});
	
	it("should addIndexes in constructor", function(done) {
		var model = new mongolayer.Model({
			collection : "foo",
			indexes : [
				{ keys : { foo : 1 } }
			]
		});
		
		assert.equal(model._indexes[0].keys.foo, 1);
		
		done();
	});
	
	it("should defaultHooks in constructor", function(done) {
		var model = new mongolayer.Model({
			collection : "foo",
			defaultHooks : {
				find : ["foo"]
			}
		});
		
		// hook registered exists
		assert.equal(model.defaultHooks.find[0], "foo");
		// non-declared hooks still have default empty array
		assert.equal(model.defaultHooks.insert.length, 0);
		
		done();
	});
	
	it("should have working idToString virtual", function(done) {
		var model = new mongolayer.Model({
			collection : "foo",
			virtuals : [
				{ name : "string", type : "idToString", options : { key : "raw" } }
			]
		});
		
		var id = new mongolayer.ObjectId();
		var doc = new model.Document({ raw : id });
		
		// check if getter with value works
		assert.equal(doc.string, id.toString());
		
		// check if setter with value works
		var newid = new mongolayer.ObjectId();
		doc.string = newid.toString();
		assert.equal(doc.raw.toString(), newid.toString());
		
		// check that undefined semantics work
		doc.string = undefined;
		assert.equal(doc.raw, undefined);
		assert.equal(doc.string, undefined);
		
		doc.string = null;
		assert.equal(doc.raw, null);
		assert.equal(doc.string, null);
		
		done();
	});
	
	it("should have working jsonToObject virtual", function(done) {
		var model = new mongolayer.Model({
			collection : "foo",
			virtuals : [
				{ name : "foo", type : "jsonToObject", options : { key : "obj" } }
			]
		});
		
		var id = new mongolayer.ObjectId()
		var data = { foo : "fooValue", bar : [1,2] };
		var temp = new model.Document({ _id : id, obj : data });
		
		assert.equal(temp.foo, JSON.stringify(data));
		
		data = { foo : "overWritten", is : { a : { deep : { obj : [1] } } } };
		
		temp.foo = JSON.stringify(data);
		
		assert.equal(temp.obj.is.a.deep.obj[0], 1);
		
		// check that undefined semantics work
		temp.foo = undefined;
		assert.equal(temp.foo, undefined);
		assert.equal(temp.obj, undefined);
		
		// check that null semantics work
		temp.foo = null;
		assert.equal(temp.foo, null);
		assert.equal(temp.obj, null);
		
		done();
	});
	
	it("should support cached virtuals", function(done) {
		var called = 0;
		
		var model = new mongolayer.Model({
			collection : "foo",
			fields : [
				{ name : "num", validation : { type : "number" } }
			],
			virtuals : [
				{
					name : "foo",
					get : function() {
						called++;
						return this.num;
					},
					cache : true
				},
				{
					name : "nonenum",
					get : function() {
						called++;
						return this.num;
					},
					cache : true,
					enumerable : false
				}
			]
		});
		
		var doc0 = new model.Document({ num : 0 });
		var doc1 = new model.Document({ num : 1 });
		
		assert.deepStrictEqual(Object.keys(doc0), ["num", "_id"]);
		assert.strictEqual(called, 0);
		assert.strictEqual(doc0.foo, 0);
		assert.strictEqual(doc0.foo, 0);
		assert.strictEqual(doc0.nonenum, 0);
		assert.strictEqual(doc1.foo, 1);
		assert.strictEqual(called, 3);
		
		assert.deepStrictEqual(Object.keys(doc0), ["num", "_id", "foo"]);
		var temp = prepareInsert(doc0);
		assert.deepStrictEqual(Object.keys(temp), ["num", "_id", "foo"]);
		
		done();
	});
	
	it("should _validateDocData and fail on invalid type", function(done) {
		var model = new mongolayer.Model({
			collection : "foo",
			fields : [
				{ name : "foo", validation : { type : "string" } }
			]
		});
		
		assert.throws(function() {
			model._validateDocData({ foo : 5 });
		}, errors.ValidationError);
		
		return done();
	});
	
	it("should _validateDocData and fail on invalid column", function(done) {
		var model = new mongolayer.Model({
			collection : "foo",
			fields : [
				{ name : "foo", validation : { type : "string" } }
			]
		});
		
		assert.throws(function() {
			model._validateDocData({ bar : "test" });
		}, errors.ValidationError);
		
		return done();
	});
	
	it("should _validateDocData and succeed on valid type", function(done) {
		var model = new mongolayer.Model({
			collection : "foo",
			fields : [
				{ name : "foo", validation : { type : "string" } }
			]
		});
		
		model._validateDocData({ foo : "something" });
		return done();
	});
	
	it("should _validateDocData and allowExtraKeys", function(done) {
		var model = new mongolayer.Model({
			collection : "foo",
			allowExtraKeys : true
		});
		
		var data = { fake : "something" };
		model._validateDocData({ fake : "something" });
		assert.strictEqual(data.fake, "something");
		
		return done();
	});
	
	it("should _validateDocData and deleteExtraKeys", function(done) {
		var model = new mongolayer.Model({
			collection : "foo",
			fields : [
				{ name : "foo", validation : { type : "string" } }
			],
			deleteExtraKeys : true
		});
		
		var data = { foo : "something", fake : "somethingElse" };
		model._validateDocData(data);
		
		assert.strictEqual(data.foo, "something");
		assert.strictEqual(data.fake, undefined);
		
		return done();
	});
	
	it("should _fillDocDefaults", function(done) {
		var model = new mongolayer.Model({
			collection : "foo",
			fields : [
				{ name : "foo", validation : { type : "string" } },
				{ name : "bar", default : "my new value", validation : { type : "string" } },
				{
					name : "baz",
					default : function(args) {
						assert.equal(args.column, "baz");
						assert.equal(args.raw.foo, "fooValue");
						assert.equal(args.raw.bar, "my new value");
						
						return "somethingawesome";
					},
					validation : {
						type : "string"
					}
				}
			]
		});
		
		var test = { foo : "fooValue" };
		model._fillDocDefaults(test)
		assert.equal(test.bar, "my new value");
		assert.equal(test.foo, "fooValue");
		assert.equal(test.baz, "somethingawesome");
		
		done();
	});
	
	it("should _checkRequired and fail on required column", function(done) {
		var model = new mongolayer.Model({
			collection : "foo",
			fields : [
				{ name : "foo", validation : { type : "string" } },
				{ name : "bar", validation : { type : "number" }, required : true }
			]
		});
		
		assert.throws(function() {
			model._checkRequired({ foo : "fooValue" });
		}, /ValidationError: Doc failed validation. Column 'bar' is required and not provided./);
		
		return done();
	});
	
	it("should processDocs and run validation and defaults and required", function(done) {
		var model = new mongolayer.Model({
			collection : "foo",
			fields : [
				{ name : "foo", validation : { type : "string" } },
				{ name : "bar", validation : { type : "boolean" }, required : true },
				{ name : "baz", default : 5, validation : { type : "number" } }
			]
		});
		
		var args = { validate : true, checkRequired : true };
		
		// should fail required
		args.data = [{ foo : "something" }];
		
		assert.throws(function() {
			model.processDocs(args);
		}, /Doc failed validation. Column 'bar' is required and not provided./);

		// should have default rolled in
		args.data = [{ foo : "something", bar : true }];
		
		var cleanDocs = model.processDocs(args);
		assert.equal(cleanDocs[0].baz, 5);
		
		// should fail validation
		args.data = [{ foo : "something", bar : "false" }];
		
		assert.throws(function() {
			model.processDocs(args);
		}, /ValidationError: Doc failed validation. Column 'bar' is not of valid type 'boolean'. Validation Error is: 'Field should be type 'boolean' but is type 'string'. Value is "false".'/);
		
		return done();
	});
	
	it("should processDocs and fail if document errors", function(done) {
		var model = new mongolayer.Model({
			collection : "foo",
			fields : [
				{ name : "foo", validation : { type : "string" } },
				{ name : "bar", default : 5, validation : { type : "number" } }
			]
		});
		
		var test = { foo : 5 };
		var test2 = { foo : "something" };
		
		assert.throws(function() {
			model.processDocs({ data : [test, test2], validate : true });
		}, /ValidationError: Doc failed validation. Column 'foo' is not of valid type 'string'. Validation Error is: 'Field should be type 'string' but is type 'number'. Value is 5.'/);
		
		return done();
	});
	
	it("should addHook", function(done) {
		var model = new mongolayer.Model({ collection : "foo" });
		model.addHook({
			name : "foo",
			type : "beforeFind",
			handler : function() {},
			required : false
		});
		
		done();
	});
	
	it("should have valid Document", function(done) {
		var model = new mongolayer.Model({ collection : "foo" });
		var doc = new model.Document({ foo : "fooValue" });
		
		assert.equal(doc.foo, "fooValue");
		assert.equal(doc instanceof model.Document, true);
		assert.equal(doc instanceof mongolayer.Document, true);
		
		done();
	});
	
	it("should have Document which fills defaults", function(done) {
		var model = new mongolayer.Model({
			collection : "foo",
			fields : [
				{ name : "foo", validation : { type : "string" } },
				{ name : "bar", default : "awesome!", validation : { type : "string" } }
			]
		});
		var doc = new model.Document({ foo : "fooValue" });
		
		assert.notEqual(doc.id, undefined);
		assert.equal(doc.foo, "fooValue");
		assert.equal(doc.bar, "awesome!");
		
		done();
	});
	
	it("should have Document which does not fill defaults", function(done) {
		var model = new mongolayer.Model({
			collection : "foo",
			fields : [
				{ name : "foo", validation : { type : "string" } },
				{ name : "bar", default : "awesome!", validation : { type : "string" } }
			]
		});
		var doc = new model.Document({ foo : "fooValue" }, { fillDefaults : false });
		
		assert.equal(doc._id, undefined);
		assert.equal(doc.id, undefined);
		assert.equal(doc.foo, "fooValue");
		assert.equal(doc.bar, undefined);
		
		done();
	});
	
	it("should call onInit on document", function(done) {
		var model = new mongolayer.Model({
			collection : "foo",
			onInit : function() {
				this.bar = "barValue_" + this.foo;
			},
			fields : [
				{ name : "foo", validation : { type : "string" } },
				{ name : "bar", persist : false }
			]
		});
		
		var doc = new model.Document({ foo : "fooValue" });
		assert.equal(doc.bar, "barValue_fooValue");
		
		done();
	});
	
	it("should _prepareInsert on Document", function(done) {
		var model = new mongolayer.Model({
			collection : "foo",
			fields : [
				{ name : "foo", validation : { type : "string" } }
			],
			virtuals : [
				{ name : "virtual", get : function() { throw new Error("Should not get here") }, set : function(val) { this.foo = val }, enumerable : true }
			]
		});
		
		var doc = new model.Document({ virtual : "virtualValue" });
		var temp = prepareInsert(doc);
		assert.equal(temp instanceof model.Document, false);
		// ensure the setter fired
		assert.equal(temp.foo, "virtualValue");
		// ensure the getter did not fire
		assert.equal(temp.virtual, undefined);
		
		done();
	});
	
	it("should toJSON on Document", function(done) {
		var model = new mongolayer.Model({
			collection : "foo",
			fields : [
				{ name : "foo", validation : { type : "string" } },
				{ name : "array", validation : { type : "array", schema : { type : "object", schema : [{ name : "first", type : "boolean" }] } } },
				{ name : "toJSONFalse", validation : { type : "string" }, toJSON : false }
			],
			virtuals : [
				{ name : "virtualEnum", get : function() { return "virtualEnumValue" }, enumerable : true },
				{ name : "virtualNotEnum", get : function() { return "virtualNotEnumValue" }, enumerable : false },
				{ name : "virtual", get : function() { return "virtualValue" } }
			]
		});
		
		var doc2 = new model.Document({ foo : "subStringValue", toJSONFalse : "bogusDoc2" });
		var doc = new model.Document({ foo : "stringValue", array : [{ first : true }], toJSONFalse : "bogusDoc", obj : { subdoc : doc2 } });
		
		var temp = JSON.parse(JSON.stringify(doc));
		
		// check the state of the primary doc
		assert.equal(temp.foo, "stringValue");
		assert.deepEqual(temp.array, [{ first : true }]);
		assert.strictEqual(temp.toJSONFalse, undefined);
		assert.equal(temp.virtualEnum, "virtualEnumValue");
		assert.equal(temp.virtualNotEnum, undefined);
		assert.equal(temp.virtual, "virtualValue");
		
		// ensure the sub document serialized as well
		assert.equal(temp.obj.subdoc.foo, "subStringValue");
		assert.strictEqual(temp.obj.toJSONFalse, undefined);
		assert.equal(temp.obj.subdoc.virtualEnum, "virtualEnumValue");
		assert.equal(temp.obj.subdoc.virtualNotEnum, undefined);
		assert.equal(temp.obj.subdoc.virtual, "virtualValue");
		
		done();
	});
	
	it("should createIndexes", function(done) {
		var model = new mongolayer.Model({
			collection : "foo",
			fields : [
				{ name : "title", validation : { type : "string" } }
			],
			indexes : [
				{ keys : { title : "text" } }
			]
		});
		
		async.series([
			function(cb) {
				conn.dropCollection({ name : "foo" }, cb);
			},
			function(cb) {
				conn.add({ model : model }, cb);
			},
			async function() {
				await model.collection.dropIndexes();
			},
			function(cb) {
				model.createIndexes(cb);
			},
			async function() {
				let indexes = await model.collection.indexes();
				assert.equal(indexes.length, 2);
				assert.equal(indexes[1].name, "title_text");
			}
		], function(err) {
			assert.ifError(err);
			
			done();
		});
	});
	
	it("should provide model name on createIndexes error", function(done) {
		var model = new mongolayer.Model({
			collection : "foo",
			fields : [
				{ name : "title", validation : { type : "string" } }
			],
			indexes : [
				{ keys : { title : "text" } }
			]
		});
		
		var model2 = new mongolayer.Model({
			collection : "foo",
			fields : [
				{ name : "title", validation : { type : "string" } }
			],
			indexes : [
				{ keys : { title : "text", description : "text" } }
			]
		});
		
		conn.dropCollection({ name : "foo" }, function(err) {
			assert.ifError(err);
			
			conn.add({ model : model }, function(err) {
				assert.ifError(err);
				
				conn.add({ model : model2 }, function(err) {
					assert.ok(err instanceof Error);
					assert.equal(err.code, 85);
					assert.ok(err.message.match(/An equivalent index already exists with a different name and options./)); // note: name is no longer returned

					done();
				});
			});
		});
	});
	
	it("should have valid callbackified functions", function() {
		var model = new mongolayer.Model({
			collection : "foo"
		});
		
		var functions = ["find", "findById", "insert", "update", "save", "aggregate", "remove"];
		
		functions.forEach(function(val, i) {
			assert.strictEqual(model[val].constructor.name, "Function");
			assert.notStrictEqual(model[val][Symbol.toStringTag], "AsyncFunction");
		});
	});
	
	describe("conversion", function() {
		var model;
		
		beforeEach(function(done) {
			model = new mongolayer.Model({
				collection : "foo",
				fields : [
					// test a ton of permutations with walking arrays and objects
					{ name : "walk1", validation : { type : "number" } },
					{ name : "walk2", validation : { type : "array", schema : { type : "number" } } },
					{ name : "walk3", validation : { type : "array", schema : { type : "object", schema : [{ name : "foo", type : "number" }] } } },
					{ name : "walk4", validation : { type : "object", schema : [{ name : "foo", type : "number" }] } },
					{ name : "walk5", validation : { type : "object", schema : [{ name : "foo", type : "array", schema : { type : "number" } }] } },
					{ name : "walk6", validation : { type : "object", schema : [{ name : "foo", type : "array", schema : { type : "object", schema : [{ name : "foo", type : "number" }] } }] } },
					{ name : "walk7", validation : { type : "object", schema : [{ name : "foo", type : "object", schema : [{ name : "foo", type : "number" }] }] } },
					{ name : "walk8", validation : { type : "object", schema : [{ name : "foo", type : "object", schema : [{ name : "foo", type : "array", schema : { type : "number" } }] }] } },
					{ name : "walk9", validation : { type : "object", schema : [{ name : "foo", type : "object", schema : [{ name : "foo", type : "array", schema : { type : "object", schema : [{ name : "foo", type : "number" }] } }] }] } },
					{ name : "walk10", validation : { type : "indexObject", schema : [{ name : "foo", type : "number" }, { name : "bar", type : "boolean" }] } },
					{ name : "walk11", validation : { type : "array", schema : { type : "object", schema : [{ name : "foo", type : "number" }, { name : "obj", type : "object", schema : [{ name : "foo", type : "number" }] }] } } },
					// test the various primitive types
					{ name : "boolean", validation : { type : "boolean" } },
					{ name : "date", validation : { type : "date" } },
					{ name : "objectid", validation : { type : "class", class : mongolayer.ObjectId } },
					{ name : "number", validation : { type : "number" } },
					{ name : "string", validation : { type : "string" } },
					{ name : "multiKey", validation : { type : "object", schema : [{ name : "foo", type : "number" }, { name : "bar", type : "boolean" }, { name : "baz", type : "any" }] } },
					{ name : "any", validation : { type : "any" } },
					{ name : "any_objectid", validation : { type : "any" } },
					{ name : "any_date", validation : { type : "any" } },
					{ name : "any_nested", validation : { type : "object", schema : [{ name : "any_date", type : "any" }] } },
					{ name : "object_noschema", validation : { type : "object" } }
				]
			});
			
			done();
		});
		
		it("should getConvertSchema", function(done) {
			var test = model.getConvertSchema();
			
			assert.strictEqual(test["walk1"], "number");
			assert.strictEqual(test["walk2"], "number");
			assert.strictEqual(test["walk3.foo"], "number");
			assert.strictEqual(test["walk4.foo"], "number");
			assert.strictEqual(test["walk5.foo"], "number");
			assert.strictEqual(test["walk6.foo.foo"], "number");
			assert.strictEqual(test["walk7.foo.foo"], "number");
			assert.strictEqual(test["walk8.foo.foo"], "number");
			assert.strictEqual(test["walk9.foo.foo.foo"], "number");
			assert.strictEqual(test["walk10.~.foo"], "number");
			assert.strictEqual(test["walk11.foo"], "number");
			assert.strictEqual(test["walk11.obj.foo"], "number");
			assert.strictEqual(test.boolean, "boolean");
			assert.strictEqual(test.date, "date");
			assert.strictEqual(test.objectid, "objectid");
			assert.strictEqual(test.number, "number");
			assert.strictEqual(test.string, "string");
			assert.strictEqual(test["multiKey.foo"], "number");
			assert.strictEqual(test["multiKey.bar"], "boolean");
			assert.strictEqual(test["multiKey.baz"], undefined);
			assert.strictEqual(test.any, undefined);
			assert.strictEqual(test.any_objectid, undefined);
			assert.strictEqual(test.any_date, undefined);
			assert.strictEqual(test.any_nested, undefined);
			assert.strictEqual(test.object_noschema, undefined);
			
			done();
		});
		
		it("should getConvertSchemaV2", function(done) {
			var test = model.getConvertSchemaV2();
			
			assert.strictEqual(JSON.stringify(test), JSON.stringify({
				_id : "objectid",
				walk1 : "number",
				walk2 : "number",
				walk3 : {
					foo : "number"
				},
				walk4 : {
					foo : "number"
				},
				walk5 : {
					foo : "number"
				},
				walk6 : {
					foo : {
						foo : "number"
					}
				},
				walk7 : {
					foo : {
						foo : "number"
					}
				},
				walk8 : {
					foo : {
						foo : "number"
					}
				},
				walk9 : { foo : { foo : { foo : "number" } } },
				walk10 : { "~" : { foo : "number", bar : "boolean" } },
				walk11 : { foo : "number", obj : { foo : "number" } },
				boolean : "boolean",
				date : "date",
				objectid : "objectid",
				number : "number",
				string : "string",
				multiKey : { foo : "number", bar : "boolean" }
			}));
			
			done();
		});
		
		it("should stringConvert data", function(done) {
			["stringConvert", "stringConvertV2"].forEach(function(val, i) {
				var id = new model.ObjectId();
				var date1 = new Date();
				
				var data = {
					walk1 : "3",
					walk2 : ["3", "4"],
					walk3 : [{ foo : "3" }, { foo : "5" }],
					walk4 : { foo : "5" },
					walk5 : { foo : ["3", "4"] },
					walk6 : { foo : [{ foo : "3" }, { foo : "4" }] },
					walk7 : { foo : { foo : "3" } },
					walk8 : { foo : { foo : ["3", "4"] } },
					walk9 : { foo : { foo : [{ foo : "3" }, { foo : "4" }] } },
					// the barefoo test is required for an edge situation that was caught due to poorly written regex
					walk10 : { "key" : { foo : "5", bar : "true" }, "foo" : { foo : "7", bar : "false" }, "5" : { foo : "9", bar : true }, "barefoo" : { foo : "7", bar : "true" } },
					walk10akeybfoo : "5", // edge case that shouldn't be converted by the walk10 indexObject
					walk11 : [{ foo : "5" }, { foo : "6", obj : {} }, { foo : "7", obj : { foo : "10" } }],
					multiKey : { foo : "5", bar : "true", any : { nested : "something" } },
					boolean : "false",
					date : date1.getTime(),
					objectid : id.toString(),
					number : "3",
					string : "foo",
					any : "anyData",
					undeclared : "10",
					object_noschema : { string : "stringValue", nullValue : null }
				}
				
				var temp = model[val](data);
				
				// ensure conversion of the deeply nested walk data works
				assert.strictEqual(temp.walk1, 3);
				assert.strictEqual(temp.walk2[0], 3);
				assert.strictEqual(temp.walk2[1], 4);
				assert.strictEqual(temp.walk3[0].foo, 3);
				assert.strictEqual(temp.walk3[1].foo, 5);
				assert.strictEqual(temp.walk4.foo, 5);
				assert.strictEqual(temp.walk5.foo[0], 3);
				assert.strictEqual(temp.walk5.foo[1], 4);
				assert.strictEqual(temp.walk6.foo[0].foo, 3);
				assert.strictEqual(temp.walk6.foo[1].foo, 4);
				assert.strictEqual(temp.walk7.foo.foo, 3);
				assert.strictEqual(temp.walk8.foo.foo[0], 3);
				assert.strictEqual(temp.walk8.foo.foo[1], 4);
				assert.strictEqual(temp.walk9.foo.foo[0].foo, 3);
				assert.strictEqual(temp.walk9.foo.foo[1].foo, 4);
				assert.strictEqual(temp.walk10.key.foo, 5);
				assert.strictEqual(temp.walk10.key.bar, true);
				assert.strictEqual(temp.walk10["5"].foo, 9);
				assert.strictEqual(temp.walk10["5"].bar, true);
				assert.strictEqual(temp.walk10.foo.foo, 7);
				assert.strictEqual(temp.walk10.foo.bar, false);
				assert.strictEqual(temp.walk10akeybfoo, "5");
				assert.strictEqual(temp.walk10.barefoo.foo, 7);
				assert.strictEqual(temp.walk10.barefoo.bar, true);
				assert.strictEqual(temp.walk11[0].foo, 5);
				assert.strictEqual(temp.walk11[0].obj, undefined);
				assert.strictEqual(temp.walk11[1].foo, 6);
				assert.strictEqual(Object.keys(temp.walk11[1].obj).length, 0);
				assert.strictEqual(temp.walk11[2].foo, 7);
				assert.strictEqual(temp.walk11[2].obj.foo, 10);
				assert.strictEqual(temp.any, "anyData");
				assert.strictEqual(temp.undeclared, "10");
				
				// check primitive types
				assert.strictEqual(temp.boolean, false);
				assert.strictEqual(temp.date.getTime(), date1.getTime());
				assert.strictEqual(temp.objectid.toString(), id.toString());
				assert.strictEqual(temp.number, 3);
				assert.strictEqual(temp.string, "foo");
				assert.strictEqual(temp.multiKey.foo, 5);
				assert.strictEqual(temp.multiKey.bar, true);
				assert.strictEqual(temp.multiKey.any.nested, "something");
				assert.strictEqual(temp.object_noschema.string, "stringValue");
				assert.strictEqual(temp.object_noschema.nullValue, null);
				
				// ensure original data was not changed
				if (val === "stringConvert") {
					// stringConvertV2 alters the original data to improve performance
					assert.strictEqual(data.walk1, "3");
					assert.strictEqual(data.walk2[0], "3");
					assert.strictEqual(data.walk2[1], "4");
					assert.strictEqual(data.walk3[0].foo, "3");
					assert.strictEqual(data.walk3[1].foo, "5");
					assert.strictEqual(data.walk4.foo, "5");
					assert.strictEqual(data.walk5.foo[0], "3");
					assert.strictEqual(data.walk5.foo[1], "4");
					assert.strictEqual(data.walk6.foo[0].foo, "3");
					assert.strictEqual(data.walk6.foo[1].foo, "4");
					assert.strictEqual(data.walk7.foo.foo, "3");
					assert.strictEqual(data.walk8.foo.foo[0], "3");
					assert.strictEqual(data.walk8.foo.foo[1], "4");
					assert.strictEqual(data.walk9.foo.foo[0].foo, "3");
					assert.strictEqual(data.walk9.foo.foo[1].foo, "4");
				}
			});
			
			done();
		});
		
		it("should stringConvert data that is already casted", function(done) {
			var id = new model.ObjectId();
			var date = new Date(2013, 0, 1);
			
			var data = {
				objectid : id,
				boolean : true,
				number : 3,
				date : date,
				any_objectid : id,
				any_date : new Date(2012, 1, 1),
				any_nested : { any_date : new Date(2011, 1, 1) },
				walk10 : { "key" : { foo : 5, bar : true }, "foo" : { foo : 7, bar : false }, "5" : { foo : 9, bar : true } }
			}
			
			var temp = model.stringConvert(data);
			
			assert.strictEqual(temp.objectid instanceof mongolayer.ObjectId, true);
			assert.strictEqual(temp.objectid.toString(), id.toString());
			assert.strictEqual(temp.boolean, true);
			assert.strictEqual(temp.number, 3);
			assert.strictEqual(temp.date.getTime(), 1356998400000);
			assert.strictEqual(temp.any_objectid instanceof mongolayer.ObjectId, true);
			assert.strictEqual(temp.any_objectid.toString(), id.toString());
			assert.strictEqual(temp.any_date.getTime(), 1328054400000);
			assert.strictEqual(temp.any_nested.any_date.getTime(), 1296518400000);
			assert.strictEqual(temp.walk10.key.foo, 5);
			
			done();
		});
		
		it("should stringConvert filter", function(done) {
			// test simple conversion
			var temp = model.stringConvert({ walk1 : "1" });
			assert.strictEqual(temp.walk1, 1);
			
			// test all the supported query operators
			var temp = model.stringConvert({
				walk1 : {
					$in : ["1"],
					$nin : ["3", "4"],
					$exists : "true",
					$ne : "12",
					$gt : "5",
					$lt : "3",
					$gte : "10",
					$lte : "11"
				}
			});
			
			assert.strictEqual(temp.walk1.$in[0], 1);
			assert.strictEqual(temp.walk1.$nin[0], 3);
			assert.strictEqual(temp.walk1.$nin[1], 4);
			assert.strictEqual(temp.walk1.$exists, true);
			assert.strictEqual(temp.walk1.$ne, 12);
			assert.strictEqual(temp.walk1.$gt, 5);
			assert.strictEqual(temp.walk1.$lt, 3);
			assert.strictEqual(temp.walk1.$gte, 10);
			assert.strictEqual(temp.walk1.$lte, 11);
			
			// test a nested dot key syntax
			var temp = model.stringConvert({ "walk9.foo.foo.foo" : "4" });
			assert.strictEqual(temp["walk9.foo.foo.foo"], 4);
			
			// test a nested obj key syntax
			var temp = model.stringConvert({ walk9 : { foo : { foo : { foo : "4" } } } });
			assert.strictEqual(temp.walk9.foo.foo.foo, 4);
			
			// test $and, $or, $nor
			var temp = model.stringConvert({
				$and : [{ walk1 : "3" }, { walk1 : { $ne : "5" } }, { $and : [{ walk1 : "10" }] }],
				$or : [{ walk1 : { $in : ["3", "4"] } }],
				$nor : [{ "walk9.foo.foo.foo" : { $gt : "12" } }]
			});
			assert.strictEqual(temp.$and[0].walk1, 3);
			assert.strictEqual(temp.$and[1].walk1.$ne, 5);
			assert.strictEqual(temp.$and[2].$and[0].walk1, 10);
			assert.strictEqual(temp.$or[0].walk1.$in[0], 3);
			assert.strictEqual(temp.$or[0].walk1.$in[1], 4);
			assert.strictEqual(temp.$nor[0]["walk9.foo.foo.foo"].$gt, 12);
			
			// test $elemMatch with sub-document and array of simple
			var temp = model.stringConvert({
				$and : [
					{ walk2 : { $elemMatch : { $gt : "5", $lt : "10" } } },
					{ walk3 : { $elemMatch : { foo : "10" } } },
					{ walk3 : { $elemMatch : { foo : { $lt : "5" } } } }
				]
			});
			assert.strictEqual(temp.$and[0].walk2.$elemMatch.$gt, 5);
			assert.strictEqual(temp.$and[0].walk2.$elemMatch.$lt, 10);
			assert.strictEqual(temp.$and[1].walk3.$elemMatch.foo, 10);
			assert.strictEqual(temp.$and[2].walk3.$elemMatch.foo.$lt, 5);
			
			// test $all
			var temp = model.stringConvert({
				$and : [
					{ walk2 : { $all : ["3", "5"] } },
					{ walk3 : { $all : [{ foo : "10" }, { foo : "5" }] } },
					{ walk3 : { $all : [{ $elemMatch : { foo : "10" } }, { $elemMatch : { foo : { $gt : "2" } } }] } }
				]
			});
			assert.strictEqual(temp.$and[0].walk2.$all[0], 3);
			assert.strictEqual(temp.$and[0].walk2.$all[1], 5);
			assert.strictEqual(temp.$and[1].walk3.$all[0].foo, 10);
			assert.strictEqual(temp.$and[1].walk3.$all[1].foo, 5);
			assert.strictEqual(temp.$and[2].walk3.$all[0].$elemMatch.foo, 10);
			assert.strictEqual(temp.$and[2].walk3.$all[1].$elemMatch.foo.$gt, 2);
			
			done();
		});
	});
	
	describe("hooks", function(done) {
		var model;
		
		before(function(done) {
			model = new mongolayer.Model({ collection : "foo" });
			model.addHook({
				name : "foo",
				type : "beforeFind",
				handler : function(args, cb) {
					args.data.push("foo");
					
					cb(null, args);
				},
				required : false
			});
			
			model.addHook({
				name : "bar",
				type : "beforeFind",
				handler : function(args, cb) {
					args.data.push("bar");
					
					cb(null, args);
				},
				required : false
			});
			
			model.addHook({
				name : "baz",
				type : "beforeFind",
				handler : function(args, cb) {
					args.data.push("baz");
					
					cb(null, args);
				},
				required : true
			});
			
			model.addHook({
				name : "errors",
				type : "beforeFind",
				handler : function(args, cb) {
					cb(new Error("failure"), args);
				},
				required : false
			});
			
			model.addHook({
				name : "withArgs",
				type : "beforeFind",
				handler : function(args, cb) {
					args.data.push("withArgs_" + args.hookArgs.foo);
					
					cb(null, args);
				}
			});
			
			done();
		});
		
		it("should _normalizeHooks", function(done) {
			var test = model._normalizeHooks(["foo", { name : "bar" }, "baz"]);
			
			assert.equal(test[0].name, "foo");
			assert.equal(test[1].name, "bar");
			assert.equal(test[2].name, "baz");
			
			done();
		});
		
		it("should _getHooksByType", function(done) {
			var hooks = [{ name : "beforeFind_foo" }, { name : "afterFind_bar" }, { name : "beforeFilter_baz" }];
			
			var test = model._getHooksByType("beforeFind", hooks);
			
			// should have the proper hooks
			assert.equal(test.length, 1);
			assert.equal(test[0].name, "foo");
			
			// should not alter original hooks
			assert.equal(hooks[0].name, "beforeFind_foo");
			assert.equal(hooks[1].name, "afterFind_bar");
			assert.equal(hooks[2].name, "beforeFilter_baz");
			
			done();
		});
		
		it("should _executeHooks by name and include required hooks", function(done) {
			model._executeHooks({ type : "beforeFind", hooks : [{ name : "bar" }, { name : "foo" }], args : { filter : {}, data : [] } }, function(err, args) {
				assert.ifError(err);
				
				assert.equal(args.data[0], "bar");
				assert.equal(args.data[1], "foo");
				assert.equal(args.data[2], "baz");
				
				done();
			});
		});
		
		it("should _executeHooks and not execute after an error", function(done) {
			model._executeHooks({ type : "beforeFind", hooks : [{ name : "errors" }, { name : "foo" }], args : { filter : {}, data : [] } }, function(err, args) {
				assert.equal(err instanceof Error, true);
				assert.equal(args, undefined);
				
				done();
			});
		});
		
		it("should _executeHooks with args", function(done) {
			model._executeHooks({ type : "beforeFind", hooks : [{ name : "withArgs", args : { foo : "fooValue" } }], args : { filter : {}, data : [] } }, function(err, args) {
				assert.ifError(err);
				
				assert.equal(args.data[0], "withArgs_fooValue");
				assert.equal(args.data[1], "baz");
				
				done();
			});
		});
		
		it("should not _executeHooks twice on required", function(done) {
			model._executeHooks({ type : "beforeFind", hooks : [{ name : "baz" }], args : { filter : {}, data : [] } }, function(err, args) {
				assert.ifError(err);
				
				assert.equal(args.data[0], "baz");
				assert.equal(args.data.length, 1);
				
				done();
			});
		});
		
		it("should _executeHooks and throw if hook doesn't exist", function(done) {
			model._executeHooks({ type : "beforeFind", hooks : [{ name : "bogus" }], args : { data : [] } }, function(err, args) {
				assert.ok(err.message.match(/Hook 'bogus' of type 'beforeFind' was requested but does not exist/));
				return done();
			});
		});
	});
	
	describe("CRUD", function(done) {
		var model;
		var modelRelated;
		var modelRelated2;
		var modelView;
		
		const contextHook = {
			name : "verifyContext",
			type : "afterFind",
			required : true,
			handler : function(args, cb) {
				if (args.options.context.verifyContext !== undefined) {
					args.docs.forEach(function(val, i) {
						val._context = args.options.context.verifyContext;
					});
				}
				
				return cb(null, args);
			}
		};
		
		beforeEach(function(done) {
			model = new mongolayer.Model({
				collection : "mongolayer_test",
				fields : [
					{ name : "foo", validation : { type : "string" } },
					{ name : "bar", validation : { type : "string" } },
					{ name : "baz", default : false, validation : { type : "boolean" } },
					{ name : "any", validation : { type : "any" } },
					{ name : "viewOn", validation : { type : "boolean" } }
				],
				relationships : [
					{ name : "single", type : "single", modelName : "mongolayer_testRelated" },
					{ name : "single_multipleTypes", type : "single", multipleTypes : true },
					{ name : "multiple", type : "multiple", modelName : "mongolayer_testRelated" },
					{ name : "multiple_multipleTypes", type : "multiple", multipleTypes : true },
					{ name : "single_rightKey", type : "single", modelName : "mongolayer_testRelated", rightKey : "title", rightKeyValidation : { type : "string" } },
					{ name : "multiple_rightKey", type : "multiple", modelName : "mongolayer_testRelated", rightKey : "title", rightKeyValidation : { type : "string" } }
				],
				hooks : [
					{
						name : "testRequired",
						type : "beforeFind",
						handler : function(args, cb) {
							// allows testing for hook duplication
							args.options._beforeFind_testRequired = args.options._beforeFind_testRequired || 0;
							args.options._beforeFind_testRequired++;
							return cb(null, args);
						}
					},
					{
						name : "testRequired",
						type : "afterFind",
						handler : function(args, cb) {
							// allows testing for hook duplication
							args.docs[0].afterFind_testRequired = args.docs[0].afterFind_testRequired || 0;
							args.docs[0].afterFind_testRequired++;
							return cb(null, args);
						}
					},
					{
						name : "testAggregate",
						type : "beforeAggregate",
						handler : function(args, cb) {
							assert.notStrictEqual(args.pipeline, undefined);
							args.options._beforeAggregate_testAggregate = true;
							return cb(null, args);
						}
					},
					{
						name : "testAggregate",
						type : "afterAggregate",
						handler : function(args, cb) {
							args.docs.forEach(function(val, i) {
								val._afterAggregate_testAggregate = true;
							});
							return cb(null, args);
						}
					},
					contextHook
				],
				virtuals : [
					{
						name : "requiresBar",
						get : function() {
							return "requiresBar_" + this.bar;
						},
						requiredFields : ["bar"]
					},
					{
						name : "requiresHooks",
						get : function() {
							return true;
						},
						requiredHooks : ["beforeFind_testRequired", "afterFind_testRequired"]
					},
					{
						name : "requiresChained",
						get : function() {
							return "requiresChained_" + this.requiresBar;
						},
						requiredFields : ["requiresBar", "requiresHooks"]
					},
					{
						name : "requiresBoth",
						get : function() {
							return "requiresBoth_" + this.bar;
						},
						requiredFields : ["bar"],
						requiredHooks : ["beforeFind_testRequired", "afterFind_testRequired"]
					},
					{
						name : "counter",
						get : function() {
							this._count = this._count || 0;
							return ++this._count;
						}
					},
					{
						name : "requiresCount0",
						get : function() {
							return this.counter;
						},
						requiredFields : ["counter"]
					},
					{
						name : "requiresCount1",
						get : function() {
							return this.counter;
						},
						requiredFields : ["counter"]
					},
					{ name : "v_1", get : function() { return `v_1_${this.foo}` }, requiredFields : ["foo"] },
					{ name : "v_2", get : function() { return `v_2_${this.bar}` }, requiredFields : ["bar"] },
					{ name : "v_3", get : function() { return `v_3_${this.v_1}` }, requiredFields : ["v_1"] },
					{ name : "v_4", get : function() { return `v_4_${this.v_2}` }, requiredFields : ["v_2"] },
					{ name : "v_5", get : function() { return `v_5_${this.v_3}_${this.v_4}` }, requiredFields : ["any", "v_3", "v_4"] }
				],
				documentMethods : [
					{ name : "testMethod", handler : function() { return "testMethodReturn" } }
				],
				indexes : [
					{ keys : { foo : 1 } }
				]
			});
			
			modelRelated = new mongolayer.Model({
				collection : "mongolayer_testRelated",
				fields : [
					{ name : "title", validation : { type : "string" } },
					{ name : "extra", validation : { type : "string" } }
				],
				relationships : [
					{ name : "singleSecond", type : "single", modelName : "mongolayer_testRelated2" },
					{ name : "singleRequired", type : "single", modelName : "mongolayer_testRelated2", required : true }
				],
				hooks : [
					contextHook
				]
			});
			
			modelRelated2 = new mongolayer.Model({
				collection : "mongolayer_testRelated2",
				fields : [
					{ name : "title", validation : { type : "string" } },
					{ name : "extra", validation : { type : "string" } }
				],
				virtuals : [
					{ name : "virtual", writable : true, requiredFields : ["extra"], requiredHooks : ["afterFind_virtualOverwrite"] }
				],
				hooks : [
					// for preventing resolveRelationship -> find regression
					{
						name : "default",
						type : "afterFind",
						required : false,
						handler : function(args, cb) {
							args.docs.forEach(function(doc, i) {
								doc.defaultHook = `default_hook_${doc.extra}`;
							});
							
							return cb(null, args);
						}
					},
					{
						name : "virtualOverwrite",
						type : "afterFind",
						required : false,
						handler : function(args, cb) {
							args.docs.forEach(function(doc, i) {
								doc.virtual = `overwrite_${doc.extra}`;
							});
							
							return cb(null, args);
						}
					}
				],
				defaultHooks : {
					// for preventing resolveRelationship -> find regression
					find : ["afterFind_default"]
				}
			});

			modelView = new mongolayer.Model({
				collection : "mongolayer_testView",
				viewOn : "mongolayer_test",
				pipeline : [
					{
						$match : {
							viewOn : true
						}
					}
				]
			});
			
			async.series([
				function(cb) {
					async.parallel([
						function(cb) {
							conn.add({ model : model }, cb);
						},
						function(cb) {
							conn.add({ model : modelRelated }, cb);
						},
						function(cb) {
							conn.add({ model : modelRelated2 }, cb);
						},
						function(cb) {
							conn.add({ model : modelView }, cb);
						}
					], cb);
				},
				function(cb) {
					async.parallel([
						function(cb) {
							model.remove({}, cb);
						},
						function(cb) {
							modelRelated.remove({}, cb);
						},
						function(cb) {
							modelRelated2.remove({}, cb);
						}
					], cb);
				}
			], function(err) {
				assert.ifError(err);
				
				done();
			});
		});
		
		describe("should _getMyFindFields", function() {
			var tests = [
				{
					name : "null",
					args : () => ({
						args : null,
						result : null
					})
				},
				{
					name : "single relationship",
					args : () => ({
						args : { "single.foo" : 1 },
						result : null
					})
				},
				{
					name : "relationship and key",
					args : () => ({
						args : { "single.foo" : 1, "bar" : 0 },
						result : { "bar" : 0 }
					})
				},
				{
					name : "two relationship and key",
					args : () => ({
						args : { "single.foo" : 1, "single.bogus.foo" : 1, "bar" : true },
						result : { "bar" : true }
					})
				},
				{
					name : "virtual",
					args : () => ({
						args : { "v_1" : 1 },
						result : null
					})
				},
				{
					name : "virtual and key",
					args : () => ({
						args : { "v_1" : 1, foo : 1 },
						result : { foo : 1 }
					})
				}
			]
			
			testArray(tests, function(test) {
				var result = model._getMyFindFields(test.args);
				assert.deepStrictEqual(result, test.result);
			});
		});
		
		describe("insert", function(done) {
			it("should insert single", function(done) {
				model.insert({
					foo : "fooValue",
					bar : "barValue"
				}, function(err, doc, result) {
					assert.ifError(err);
					
					assert.strictEqual(result.acknowledged, true);
					assert.strictEqual(result.insertedCount, 1);
					assert.equal(doc.foo, "fooValue");
					
					done();
				});
			});
			
			it("should run virtual setters on insert", function(done) {
				var _id = new mongolayer.ObjectId();
				
				model.insert({
					id : _id.toString(),
					foo : "fooValue"
				}, function(err, doc) {
					assert.ifError(err);
					
					assert.equal(doc.id, _id.toString());
					
					done();
				});
			});
			
			it("should fail validation on single", function(done) {
				model.insert({
					foo : 5
				}, function(err, doc) {
					assert.equal(err instanceof Error, true);
					
					done();
				});
			});
			
			it("should default values on single", function(done) {
				model.insert({
					foo : "something"
				}, function(err, doc) {
					assert.equal(doc.baz, false);
					assert.equal(doc.foo, "something");
					assert.equal(doc.bar, undefined);
					
					done();
				});
			});
			
			it("should insert multiple", function(done) {
				model.insert([
					{
						foo : "fooValue1",
						bar : "barValue1",
						any : "anyValue"
					},
					{
						foo : "fooValue2",
						bar : "barValue2",
						any : 5
					}
				], function(err, docs, result) {
					assert.ifError(err);
					
					assert.strictEqual(result.acknowledged, true);
					assert.strictEqual(result.insertedCount, 2);
					assert.equal(docs[0].foo, "fooValue1");
					assert.equal(docs[0].bar, "barValue1");
					assert.strictEqual(docs[0].any, "anyValue");
					assert.equal(docs[1].foo, "fooValue2");
					assert.equal(docs[1].bar, "barValue2");
					assert.strictEqual(docs[1].any, 5);
					
					done();
				});
			});
			
			it("should fail validation on multiple and insert nothing", function(done) {
				model.insert([
					{
						foo : "valid"
					},
					{
						foo : 5
					},
					{
						foo : "valid2"
					}
				], function(err, docs) {
					assert.equal(err instanceof Error, true);
					
					model.find({}, function(err, docs) {
						assert.ifError(err);
						
						assert.equal(docs.length, 0);
						
						done();
					});
				});
			});
			
			it("should not insert empty string", function(done) {
				model.insert({
					foo : ""
				}, function(err, doc) {
					assert.ifError(err);
					
					assert.strictEqual(doc.foo, undefined);
					
					done();
				});
			});
			
			it("should insert empty string", function(done) {
				model.insert({ foo : ""}, { stripEmpty : false }, function(err, doc) {
					assert.ifError(err);
					
					assert.strictEqual(doc.foo, "");
					
					done();
				});
			});
			
			it("should allow insert null on other types", function(done) {
				model.insert({
					foo : null
				}, function(err, doc) {
					assert.ifError(err);
					
					assert.equal(doc.foo, null);
					
					done();
				});
			});
			
			it("should allow insert of Document type", function(done) {
				var doc = new model.Document({ foo : "fooValue" });
				
				model.insert(doc, function(err, doc) {
					assert.ifError(err);
					
					assert.equal(doc.id, doc.id);
					assert.equal(doc.foo, doc.foo);
					
					done();
				});
			});
			
			it("should run hooks properly", function(done) {
				var beforeCalled;
				var afterCalled;
				var beforePutCalled;
				var afterPutCalled;
				var data = [{ foo : "fooValue1", bar : "barValue1"}];
				
				model.addHook({
					name : "process",
					type : "beforeInsert",
					handler : function(args, cb) {
						assert.equal(args.docs, data);
						assert.notEqual(args.options, undefined);
						
						beforeCalled = true;
						
						cb(null, args);
					},
					required : false
				});
				
				model.addHook({
					name : "process",
					type : "afterInsert",
					handler : function(args, cb) {
						assert.equal(args.docs.length, 1);
						assert.equal(args.docs[0] instanceof model.Document, true);
						assert.equal(args.docs[0].foo, "fooValue1");
						assert.equal(args.docs[0].bar, "barValue1");
						assert.notEqual(args.options, undefined);
						
						afterCalled = true;
						
						cb(null, args);
					},
					required : false
				});
				
				model.addHook({
					name : "beforePut",
					type : "beforePut",
					handler : function(args, cb) {
						assert.equal(args.doc, data[0]);
						assert.deepStrictEqual(args.options, {
							options : {},
							hooks : [{ name : "beforeInsert_process" }, { name : "afterInsert_process" }, { name : "beforePut_beforePut" }, { name : "afterPut_afterPut" }]
						});
						
						args.options.custom = { beforePutCalled : true };
						
						beforePutCalled = true;
						
						cb(null, args);
					},
					required : false
				});
				
				model.addHook({
					name : "afterPut",
					type : "afterPut",
					handler : function(args, cb) {
						assert.ok(args.doc instanceof model.Document);
						assert.deepStrictEqual(args.options, {
							options : {},
							custom : { beforePutCalled : true },
							hooks : [{ name : "beforeInsert_process" }, { name : "afterInsert_process" }, { name : "beforePut_beforePut" }, { name : "afterPut_afterPut" }]
						});
						
						afterPutCalled = true;
						
						cb(null, args);
					},
					required : false
				});
				
				async.series([
					function(cb) {
						// no hooks specified, no hooks ran
						beforeCalled = false;
						afterCalled = false;
						beforePutCalled = false;
						afterPutCalled = false;
						
						model.insert(data, function(err, docs) {
							assert.ifError(err);
							
							assert.equal(beforeCalled, false);
							assert.equal(afterCalled, false);
							assert.equal(beforePutCalled, false);
							assert.equal(afterPutCalled, false);
							
							model.remove({}, function(err) {
								cb(null);
							});
						});
					},
					function(cb) {
						// hooks specified, hooks ran
						beforeCalled = false;
						afterCalled = false;
						beforePutCalled = false;
						afterPutCalled = false;
						
						model.insert(data, { hooks : ["beforeInsert_process", "afterInsert_process", "beforePut_beforePut", "afterPut_afterPut"] }, function(err, docs) {
							assert.ifError(err);
							
							assert.equal(beforeCalled, true);
							assert.equal(afterCalled, true);
							assert.equal(beforePutCalled, true);
							assert.equal(afterPutCalled, true);
							
							model.remove({}, function(err) {
								cb(null);
							});
						});
					},
					function(cb) {
						// using default hooks
						beforeCalled = false;
						afterCalled = false;
						beforePutCalled = false;
						afterPutCalled = false;
						
						model.defaultHooks.insert = ["beforeInsert_process", "afterInsert_process", "beforePut_beforePut", "afterPut_afterPut"];
						
						model.insert(data, function(err, docs) {
							assert.ifError(err);
							
							assert.equal(beforeCalled, true);
							assert.equal(afterCalled, true);
							assert.equal(beforePutCalled, true);
							assert.equal(afterPutCalled, true);
							
							model.remove({}, function(err) {
								cb(null);
							});
						});
					}
				], function(err) {
					assert.ifError(err);
					
					done();
				});
			});
		});
		
		describe("remove", function() {
			it("should remove", function(done) {
				model.insert([{ foo : "one" }, { foo : "two" }], function(err) {
					assert.ifError(err);
					
					model.remove({ foo : "one" }, function(err, result) {
						assert.ifError(err);
						
						assert.strictEqual(result.acknowledged, true);
						assert.strictEqual(result.deletedCount, 1);
						
						done();
					});
				});
			});
			
			it("should run hooks properly", function(done) {
				var beforeCalled;
				var afterCalled;
				var beforeFilterCalled;
				
				model.addHook({
					name : "process",
					type : "beforeRemove",
					handler : function(args, cb) {
						assert.notEqual(args.filter, undefined);
						assert.notEqual(args.options, undefined);
						
						beforeCalled = true;
						
						cb(null, args);
					},
					required : false
				});
				
				model.addHook({
					name : "process",
					type : "afterRemove",
					handler : function(args, cb) {
						assert.notEqual(args.filter, undefined);
						assert.notEqual(args.options, undefined);
						assert.notEqual(args.result, undefined);
						
						afterCalled = true;
						
						cb(null, args);
					},
					required : false
				});
				
				model.addHook({
					name : "beforeFilter",
					type : "beforeFilter",
					handler : function(args, cb) {
						assert.notEqual(args.filter, undefined);
						assert.notEqual(args.options, undefined);
						
						beforeFilterCalled = true;
						
						cb(null, args);
					}
				});
				
				async.series([
					function(cb) {
						// no hooks specified, no hooks ran
						beforeCalled = false;
						afterCalled = false;
						beforeFilterCalled = false;
						
						model.remove({}, function(err, docs) {
							assert.ifError(err);
							
							assert.equal(beforeCalled, false);
							assert.equal(afterCalled, false);
							assert.equal(beforeFilterCalled, false);
							
							cb(null);
						});
					},
					function(cb) {
						// hooks specified, hooks ran
						beforeCalled = false;
						afterCalled = false;
						beforeFilterCalled = false;
						
						model.remove({}, { hooks : ["beforeRemove_process", "afterRemove_process", "beforeFilter_beforeFilter"] }, function(err, docs) {
							assert.ifError(err);
							
							assert.equal(beforeCalled, true);
							assert.equal(afterCalled, true);
							assert.equal(beforeFilterCalled, true);
							
							cb(null);
						});
					},
					function(cb) {
						// using default hooks
						beforeCalled = false;
						afterCalled = false;
						beforeFilterCalled = false;
						
						model.defaultHooks.remove = ["beforeRemove_process", "afterRemove_process", "beforeFilter_beforeFilter"];
						
						model.remove({}, function(err, docs) {
							assert.ifError(err);
							
							assert.equal(beforeCalled, true);
							assert.equal(afterCalled, true);
							assert.equal(beforeFilterCalled, true);
							
							cb(null);
						});
					}
				], function(err) {
					assert.ifError(err);
					
					done();
				});
			});
		});
		
		describe("removeAll", function() {
			it("should removeAll even if collection doesn't exist", function(done) {
				async.series([
					// model with extra indexes
					model.removeAll.bind(model),
					model.removeAll.bind(model),
					// model with no extra indexes
					modelRelated.removeAll.bind(modelRelated),
					modelRelated.removeAll.bind(modelRelated)
				], function(err) {
					assert.ifError(err);
					
					done();
				});
			});
			
			it("should removeAll", function(done) {
				async.series([
					model.insert.bind(model, { foo : "one" }),
					model.removeAll.bind(model),
					function(cb) {
						// ensure all items removed
						model.count({}, function(err, count) {
							assert.ifError(err);
							
							assert.strictEqual(count, 0);
							
							cb(null);
						});
					},
					async function() {
						// ensure that we still have our indexes
						let indexes = await model.collection.indexes();
						assert.equal(indexes.length, 2);
						assert.equal(indexes[1].name, "foo_1");
					}
				], function(err) {
					assert.ifError(err);
					
					done();
				});
			});
		});
		
		describe("save", function() {
			it("should save", function(done) {
				model.save({
					foo : "fooValue1",
					bar : "barValue1"
				}, function(err, doc, result) {
					assert.ifError(err);
					
					assert.equal(doc instanceof model.Document, true);
					assert.equal(doc.foo, "fooValue1");
					assert.equal(doc.bar, "barValue1");
					assert.equal(result.upsertedCount, 1);
					
					done();
				});
			});
			
			it("should prevent bulk save", function(done) {
				model.save([{ foo : "fooValue1", bar : "barValue1" }, { foo : "fooValue2", bar : "barValue2" }], function(err, doc, result) {
					assert.equal(err instanceof Error, true);
					assert.notEqual(err.message.match(/bulk operations/), null);
					
					done();
				});
			});
			
			it("should allow save of Document type", function(done) {
				var doc = new model.Document({ foo : "fooValue1", bar : "barValue1" });
				var _id = doc._id;
				
				model.save(doc, function(err, doc) {
					assert.ifError(err);
					
					assert.equal(doc.id, _id.toString());
					
					done();
				});
			});
			
			it("should not save empty string", function(done) {
				model.save({
					foo : ""
				}, function(err, doc) {
					assert.ifError(err);
					
					assert.strictEqual(doc.foo, undefined);
					
					done();
				});
			});
			
			it("should save empty string", function(done) {
				model.save({ foo : ""}, { stripEmpty : false }, function(err, doc) {
					assert.ifError(err);
					
					assert.strictEqual(doc.foo, "");
					
					done();
				});
			});
			
			it("should run hooks properly", function(done) {
				var beforeCalled;
				var afterCalled;
				var beforePutCalled;
				var afterPutCalled;
				var data = { foo : "fooValue1", bar : "barValue1"};
				
				model.addHook({
					name : "process",
					type : "beforeSave",
					handler : function(args, cb) {
						assert.equal(args.doc, data);
						assert.notEqual(args.options, undefined);
						
						beforeCalled = true;
						
						cb(null, args);
					},
					required : false
				});
				
				model.addHook({
					name : "process",
					type : "afterSave",
					handler : function(args, cb) {
						assert.equal(args.doc instanceof model.Document, true);
						assert.notEqual(args.options, undefined);
						assert.notEqual(args.result, undefined);
						
						afterCalled = true;
						
						cb(null, args);
					},
					required : false
				});
				
				model.addHook({
					name : "beforePut",
					type : "beforePut",
					handler : function(args, cb) {
						assert.equal(args.doc, data);
						assert.deepStrictEqual(args.options, {
							options : { upsert : true },
							hooks : [{ name : "beforeSave_process" }, { name : "afterSave_process" }, { name : "beforePut_beforePut" }, { name : "afterPut_afterPut" }]
						});
						
						args.options.custom = { beforePutCalled : true }
						
						beforePutCalled = true;
						
						cb(null, args);
					},
					required : false
				});
				
				model.addHook({
					name : "afterPut",
					type : "afterPut",
					handler : function(args, cb) {
						assert.ok(args.doc instanceof model.Document);
						assert.deepStrictEqual(args.options, {
							options : { upsert : true },
							custom : { beforePutCalled : true },
							hooks : [{ name : "beforeSave_process" }, { name : "afterSave_process" }, { name : "beforePut_beforePut" }, { name : "afterPut_afterPut" }]
						});
						
						afterPutCalled = true;
						
						cb(null, args);
					},
					required : false
				});
				
				async.series([
					function(cb) {
						// no hooks specified, no hooks ran
						beforeCalled = false;
						afterCalled = false;
						beforePutCalled = false;
						afterPutCalled = false;
						
						model.save(data, function(err, docs) {
							assert.ifError(err);
							
							assert.equal(beforeCalled, false);
							assert.equal(afterCalled, false);
							assert.equal(beforePutCalled, false);
							assert.equal(afterPutCalled, false);
							
							model.remove({}, function(err) {
								cb(null);
							});
						});
					},
					function(cb) {
						// hooks specified, hooks ran
						beforeCalled = false;
						afterCalled = false;
						beforePutCalled = false;
						afterPutCalled = false;
						
						model.save(data, { hooks : ["beforeSave_process", "afterSave_process", "beforePut_beforePut", "afterPut_afterPut"] }, function(err, docs) {
							assert.ifError(err);
							
							assert.equal(beforeCalled, true);
							assert.equal(afterCalled, true);
							assert.equal(beforePutCalled, true);
							assert.equal(afterPutCalled, true);
							
							model.remove({}, function(err) {
								cb(null);
							});
						});
					},
					function(cb) {
						// using default hooks
						beforeCalled = false;
						afterCalled = false;
						beforePutCalled = false;
						afterPutCalled = false;
						
						model.defaultHooks.save = ["beforeSave_process", "afterSave_process", "beforePut_beforePut", "afterPut_afterPut"];
						
						model.save(data, function(err, docs) {
							assert.ifError(err);
							
							assert.equal(beforeCalled, true);
							assert.equal(afterCalled, true);
							assert.equal(beforePutCalled, true);
							assert.equal(afterPutCalled, true);
							
							model.remove({}, function(err) {
								cb(null);
							});
						});
					}
				], function(err) {
					assert.ifError(err);
					
					done();
				});
			});
		});
		
		describe("update", function() {
			var id1 = new mongolayer.ObjectId();
			var id2 = new mongolayer.ObjectId();
			
			beforeEach(function(done) {
				model.remove({}, function(err) {
					model.insert([
						{
							_id : id1,
							foo : "1"
						},
						{
							_id : id2,
							foo : "2"
						}
					], function(err) {
						done();
					});
				});
			});
			
			it("should update", function(done) {
				model.update({ _id : id1 }, { "$set" : { foo : "1_updated" } }, function(err, result) {
					assert.ifError(err);

					assert.strictEqual(result.matchedCount, 1);
					assert.strictEqual(result.modifiedCount, 1);
					assert.strictEqual(result.acknowledged, true);
					
					done();
				});
			});
			
			it("should update whole and set defaults", function(done) {
				model.update({ _id : id1 }, { foo : "1_updated" }, function(err, result) {
					assert.ifError(err);
					
					// ensure parameters exist in writeResult
					assert.strictEqual(result.matchedCount, 1);
					assert.strictEqual(result.modifiedCount, 1);
					assert.strictEqual(result.acknowledged, true);
					
					model.find({ foo : "1_updated" }, function(err, docs) {
						assert.ifError(err);
						
						assert.equal(docs[0].baz, false);
						
						done();
					});
				});
			});
			
			it("should not update empty string", function(done) {
				model.update({ _id : id1 }, { foo : "" }, function(err) {
					assert.ifError(err);
					
					model.find({ _id : id1 }, function(err, docs){
						assert.ifError(err);
						assert.strictEqual(docs.length, 1);
						assert.strictEqual(docs[0].foo, undefined);
						done();
					});
				});
			});
			
			it("should update empty string", function(done) {
				model.update({ _id : id1 }, { foo : ""}, { stripEmpty : false }, function(err) {
					assert.ifError(err);
					
					model.find({ _id : id1 }, function(err, docs){
						assert.ifError(err);
						assert.strictEqual(docs.length, 1);
						assert.strictEqual(docs[0].foo, "");
						done();
					});
				});
			});
			
			it("should validate whole", function(done) {
				model.update({ _id : id1 }, { foo : 5 }, function(err) {
					assert.equal(err instanceof Error, true);
					
					done();
				});
			});
			
			it("should validate $set", function(done) {
				model.update({ _id : id1 }, { "$set" : { foo : 5 } }, function(err) {
					assert.equal(err instanceof Error, true);
					
					done();
				});
			});
			
			it("should validate $setOnInsert", function(done) {
				model.update({ _id : id1 }, { "$setOnInsert" : { foo : 5 } }, function(err) {
					assert.equal(err instanceof Error, true);
					
					done();
				});
			});
			
			it("should run beforeUpdate, afterUpdate, beforeFilter hooks on update", function(done) {
				var beforeCalled = false;
				var beforeFilterCalled = false;
				var afterCalled = false;
				
				model.addHook({
					name : "before",
					type : "beforeUpdate",
					handler : function(args, cb) {
						assert.notEqual(args.filter, undefined);
						assert.notEqual(args.delta, undefined);
						assert.notEqual(args.options, undefined);
						
						beforeCalled = true;
						
						cb(null, args);
					},
					required : true
				});
				
				model.addHook({
					name : "after",
					type : "afterUpdate",
					handler : function(args, cb) {
						assert.notEqual(args.filter, undefined);
						assert.notEqual(args.delta, undefined);
						assert.notEqual(args.options, undefined);
						assert.notEqual(args.result, undefined);
						
						afterCalled = true;
						
						cb(null, args);
					},
					required : true
				});
				
				model.addHook({
					name : "nonRequired",
					type : "beforeFilter",
					handler : function(args, cb) {
						assert.deepStrictEqual(Object.keys(args), ["filter", "options", "hookArgs"]);
						
						beforeFilterCalled = true;
						
						cb(null, args);
					}
				});
				
				model.update({ _id : id1 }, { "$set" : { foo : "change" } }, { hooks : ["beforeFilter_nonRequired"] }, function(err, count, result) {
					assert.ifError(err);
					
					assert.strictEqual(beforeCalled, true);
					assert.strictEqual(beforeFilterCalled, true);
					assert.strictEqual(afterCalled, true);
					
					done();
				});
			});
		});
		
		describe("count", function() {
			it("should count", function(done) {
				model.insert([{ foo : "1" }, { foo : "2" }, { foo : "1" }], function(err) {
					model.count({ foo : "1" }, function(err, count) {
						assert.equal(count, 2);
						
						done();
					});
				});
			});
		});
		
		describe("aggregate", function(done) {
			beforeEach(function(done) {
				model.insert([
					{
						foo : "1",
						bar : "barValue"
					},
					{
						foo : "2"
					},
					{
						foo : "3"
					}
				], function(err) {
					assert.ifError(err);
					
					done();
				});
			});
			
			it("should aggregate", function(done) {
				model.aggregate([{ $match : { foo : "1" } }], function(err, docs) {
					assert.ifError(err);
					
					assert.strictEqual(docs.length, 1);
					assert.strictEqual(docs[0].foo, "1");
					assert.strictEqual(docs[0].bar, "barValue");
					assert.strictEqual(docs[0].requiresBar, undefined);
					
					return done();
				});
			});
			
			it("should run hooks", function(done) {
				var options = { hooks : ["beforeAggregate_testAggregate", "afterAggregate_testAggregate"] };
				model.aggregate([{ $match : { foo : "1" } }], options, function(err, docs) {
					assert.ifError(err);
					
					assert.strictEqual(docs[0]._afterAggregate_testAggregate, true);
					assert.strictEqual(options._beforeAggregate_testAggregate, true);
					
					return done();
				});
			});
			
			it("should allow execution of virtuals", function(done) {
				model.aggregate([{ $match : { foo : "1" } }], { virtuals : ["requiresBar"] }, function(err, docs) {
					assert.ifError(err);
					
					assert.strictEqual(docs[0].requiresBar, "requiresBar_barValue");
					assert.strictEqual(docs[0].bar, "barValue");
					assert.strictEqual(docs[0].requiresChained, undefined);
					
					return done();
				});
			});
			
			it("should allow castDocs", function(done) {
				model.aggregate([{ $match : { foo : "1" } }], { castDocs : true }, function(err, docs) {
					assert.ifError(err);
					
					assert.strictEqual(docs[0] instanceof model.Document, true);
					assert.strictEqual(docs[0].baz, false);
					assert.strictEqual(docs[0].bar, "barValue");
					assert.strictEqual(docs[0].foo, "1");
					assert.strictEqual(docs[0].requiresBar, "requiresBar_barValue");
					assert.strictEqual(docs[0].requiresChained, "requiresChained_requiresBar_barValue");
					
					return done();
				});
			});
			
			it("should enforce maxSize", function(done) {
				model.aggregate([{ $match : { foo : "1" } }], { maxSize : 10 }, function(err, docs) {
					assert.strictEqual(err.message, "Max size of result set '75' exceeds options.maxSize of '10'");
					
					return done();
				});
			});
		});
		
		describe("find", function() {
			describe("basic", function(done) {
				beforeEach(function(done) {
					model.insert([
						{
							_id : mongolayer.testId("basic1"),
							foo : "1",
							bar : "barValue"
						},
						{
							_id : mongolayer.testId("basic2"),
							foo : "2"
						},
						{
							_id : mongolayer.testId("basic3"),
							foo : "3"
						}
					], function(err) {
						done();
					});
				});
				
				it("should find", function(done) {
					model.find({}, function(err, docs) {
						assert.equal(docs[0] instanceof model.Document, true);
						assert.equal(docs[0] instanceof mongolayer.Document, true);
						assert.equal(docs.length, 3);
						
						done();
					});
				});
				
				it("should find with filter", function(done) {
					model.find({ foo : "2" }, function(err, docs) {
						assert.equal(docs[0].foo, "2");
						assert.equal(docs.length, 1);
						
						done();
					});
				});
				
				it("should find with functioning options", function(done) {
					model.find({}, { limit : 1, skip : 1 }, function(err, docs) {
						assert.equal(docs[0].foo, "2");
						assert.equal(docs.length, 1);
						
						done();
					});
				});
				
				it("should enforce maxSize", function(done) {
					model.find({}, { fields : { _id : 1 }, limit : 1, maxSize : 10, castDocs : false }, function(err, docs) {
						assert.strictEqual(err.message, "Max size of result set '36' exceeds options.maxSize of '10'");
						
						done();
					});
				});
				
				it("should enforce castDocs", function(done) {
					model.find({}, { castDocs : false, limit : 1 }, function(err, docs) {
						assert.ifError(err);
						
						assert.strictEqual(docs[0] instanceof model.Document, false);
						assert.strictEqual(docs[0].id, undefined);
						assert.strictEqual(docs[0].foo, "1");
						
						done();
					});
				});
				
				it("should find with count", function(done) {
					model.find({}, { count : true, limit : 1, skip : 1 }, function(err, result) {
						assert.ifError(err);
						
						assert.strictEqual(result.count, 3);
						assert.strictEqual(result.docs.length, 1);
						assert.strictEqual(result.docs[0].foo, "2");
						
						done();
					});
				});
				
				it("should find with count with filter", function(done) {
					model.find({ foo : "2" }, { fields : { _id : 0 }, count : true }, function(err, result) {
						assert.ifError(err);
						
						assertLib.deepCheck(result, {
							count : 1,
							docs : [
								{ baz : false, foo : "2" }
							]
						});
						
						return done();
					});
				});
				
				it("should run beforeFind and afterFind hooks on find", function(done) {
					model.addHook({
						name : "before",
						type : "beforeFind",
						handler : function(args, cb) {
							assert.notEqual(args.filter, undefined);
							assert.notEqual(args.options, undefined);
							
							args.filter.added = "yes";
							
							cb(null, args);
						},
						required : true
					});
					
					model.addHook({
						name : "after",
						type : "afterFind",
						handler : function(args, cb) {
							assert.notEqual(args.filter, undefined);
							assert.notEqual(args.options, undefined);
							assert.notEqual(args.docs, undefined);
							
							args.docs.forEach(function(val, i) {
								val.added = val.foo + "_" + args.filter.added;
							});
							
							cb(null, args);
						},
						required : true
					});
					
					model.insert([
						{
							foo : "fooValue1",
							bar : "barValue1"
						},
						{
							foo : "fooValue2",
							bar : "barValue2"
						}
					], function(err) {
						model.find({}, function(err, docs) {
							docs.forEach(function(val, i) {
								assert.equal(val.added, val.foo + "_yes");
							});
							
							done();
						});
					});
				});
				
				it("should find with count and be hookable", function(done) {
					model.addHook({
						name : "after",
						type : "afterFind",
						handler : function(args, cb) {
							assert.strictEqual(args.docs.length, 1);
							assert.strictEqual(args.count, 3);
							
							args.count = 1000;
							
							cb(null, args);
						}
					});
					
					model.find({}, { count : true, limit : 1, skip : 1, hooks : ["afterFind_after"] }, function(err, result) {
						assert.ifError(err);
						
						assert.equal(result.count, 1000);
						assert.equal(result.docs.length, 1);
						
						done();
					});
				});
				
				it("should have working mongolayer.toPlain() after find on doc and array", function(done) {
					model.find({}, function(err, docs) {
						var temp = docs.map(function(val, i) { return mongolayer.toPlain(val) });
						
						assert.equal(temp[0] instanceof model.Document, false);
						assert.equal(temp[0]._id.toString(), temp[0].id);
						
						var temp = mongolayer.toPlain(docs);
						
						assert.equal(temp[0] instanceof model.Document, false);
						assert.equal(temp[0]._id.toString(), temp[0].id);
						
						done();
					});
				});
				
				it("should have working findById with object and string", function(done) {
					model.find({}, function(err, docs) {
						assert.ifError(err);
						
						var _id = docs[0]._id;
						var id = docs[1].id;
						
						async.parallel([
							function(cb) {
								model.findById(_id, function(err, doc) {
									assert.ifError(err);
									assert.equal(doc.foo, 1);
									
									cb(null);
								});
							},
							function(cb) {
								model.findById(id, function(err, doc) {
									assert.ifError(err);
									assert.equal(doc.foo, 2);
									
									cb(null);
								});
							},
							function(cb) {
								model.findById(new mongolayer.ObjectId(), function(err, doc) {
									assert.ifError(err);
									assert.equal(doc, null);
									
									cb(null);
								});
							}
						], function(err) {
							assert.ifError(err);
							
							done();
						});
					});
				});
				
				it("should find and restrict by fields", function(done) {
					model.find({ foo : "1" }, { fields : { foo : 1 } }, function(err, docs) {
						assert.ifError(err);
						
						// ensure it pulls down only the one data field, but that the virtuals still execute and are often left empty
						assertLib.deepCheck(docs, [
							{
								_id : mongolayer.testId("basic1"),
								foo : "1",
								bar : undefined,
								baz : undefined,
								any : undefined,
								requiresBar : "requiresBar_undefined",
								requiresHooks : true,
								requiresChained : "requiresChained_requiresBar_undefined",
								requiresBoth : "requiresBoth_undefined",
								counter : 1,
								requiresCount0 : 2,
								requiresCount1 : 3,
								v_1 : "v_1_1",
								v_2 : "v_2_undefined",
								v_3 : "v_3_v_1_1",
								v_4 : "v_4_v_2_undefined",
								v_5 : "v_5_v_3_v_1_1_v_4_v_2_undefined"
							}
						]);
						
						done();
					});
				});
				
				it("should querying mutate options but not defaultHooks", function(done) {
					var options = { fields : { foo : 1, requiresHooks : 1, requiresBar : 1 } };
					model.find({ foo : "1" }, options, function(err, docs) {
						assert.ifError(err);
						
						assert.strictEqual(model.defaultHooks.find.length, 0);
						assert.strictEqual(options.hooks.length, 2);
						assert.deepStrictEqual(Object.keys(options.fields), ["foo", "requiresHooks", "requiresBar", "bar"]);
						
						return done();
					});
				});
				
				it("should have working promise", async function() {
					var result = await model.promises.find({ foo : "1" });
					assertLib.deepCheck(result, [
						{
							_id : mongolayer.testId("basic1"),
							foo : "1",
							bar : "barValue",
							baz : false
						}
					]);
					
					result = await model.promises.findById(mongolayer.testId("basic1"));
					assertLib.deepCheck(result, {
						_id : mongolayer.testId("basic1"),
						foo : "1",
						bar : "barValue",
						baz : false
					});
					
					result = await model.promises.aggregate([{ $match : { _id : mongolayer.testId("basic1") } }]);
					assertLib.deepCheck(result, [
						{
							_id : mongolayer.testId("basic1"),
							foo : "1",
							bar : "barValue",
							baz : false
						}
					]);
					
					result = await model.promises.insert({ foo : "fooValue" });
					assert.strictEqual(result.insertedCount, 1);
					
					await assert.rejects(model.promises.insert({ foo : 10 }), /Doc failed validation/);
					
					result = await model.promises.update({ foo : "fooValue" }, { $set : { foo : "fooValueChanged" } });
					assert.strictEqual(result.modifiedCount, 1);
					
					await assert.rejects(model.promises.update({ foo : "fooValue" }, { $set : { foo : 10 } }), /Doc failed validation/);
					
					result = await model.promises.save({ foo : "fooValue", bar : "barValue" });
					assert.strictEqual(result.upsertedCount, 1);
					
					await assert.rejects(model.promises.save({ foo : 10 }), /Doc failed validation/);
				});

				it("should have working collation", async function() {
					await model.promises.remove({});

					await model.promises.insert([
						{
							foo: "gamma"
						},
						{
							foo: "alpha"
						},
						{
							foo: "Test"
						},
						{
							foo: "Alpha"
						}
					]);

					const result = await model.promises.find({}, {
						collation: { locale: "en_US", caseFirst: "upper" },
						castDocs: false,
						fields: { foo: true },
						sort: { foo: 1 }
					});

					assert.deepStrictEqual(result, [
						{ foo: "Alpha" },
						{ foo: "alpha" },
						{ foo: "gamma" },
						{ foo: "Test" }
					]);
				});

				it("should return random", async function() {
					const results = [];
					for (let i = 0; i < 50; i++) {
						const result = await model.promises.find({}, { random: 1, fields: { foo: true } });
						results.push(result[0].foo);
					}

					const counts = {};
					for (const num of results) {
						counts[num] = counts[num] || 0;
						counts[num]++;
					}

					// Assert that we get some random distribution of results
					assert.ok(counts[1] > 3);
					assert.ok(counts[2] > 3);
					assert.ok(counts[3] > 3);
				});

				it("should filter with random", async function() {
					const result = await model.promises.find({ foo: "1" }, {
						random: 1,
						castDocs: false,
						fields: {
							foo: true,
							bar: true
						}
					});
					assert.deepStrictEqual(result, [
						{
							foo: "1",
							bar: "barValue"
						}
					]);
				});

				it("should random sort when specified", async function() {
					const counts = {
						0: 0,
						1: 0,
						2: 0
					};
					for (let i = 0; i < 50; i++) {
						const result = await model.promises.find({}, {
							fields: { foo: true },
							sort: "random"
						});

						for (let j = 0; j < result.length; j++) {
							counts[j] += Number(result[j].foo);
						}
					}

					// Assert that we get some random distribution of results
					assert.ok(counts[0] > 80 && counts[0] < 120);
					assert.ok(counts[1] > 80 && counts[1] < 120);
					assert.ok(counts[2] > 80 && counts[2] < 120);
				});
				
				var tests = [
					{
						name : "should find and process virtual requiredFields",
						filter : { foo : { $in : ["1", "2"] } },
						options : { fields : { foo : 1, requiresBar : 1 } },
						results : [
							{
								type : "object",
								allowExtraKeys : false,
								data : {
									_id : { type : "object", class : mongolayer.ObjectId },
									foo : "1",
									bar : "barValue",
									requiresBar : "requiresBar_barValue"
								}
							},
							{
								type : "object",
								allowExtraKeys : false,
								data : {
									_id : { type : "object", class : mongolayer.ObjectId },
									foo : "2",
									requiresBar : "requiresBar_undefined"
								}
							}
						]
					},
					{
						name : "should find and process virtual requiredHooks",
						filter : { foo : "1" },
						options : { fields : { foo : 1, requiresHooks : 1 } },
						results : [
							{
								afterFind_testRequired : 1
							}
						],
						optionsCheck : {
							_beforeFind_testRequired : 1
						}
					},
					{
						name : "should require both requiredFields",
						filter : { foo : "1" },
						options : { fields : { foo : 1, requiresBoth : 1 } },
						results : [
							{
								requiresBoth : "requiresBoth_barValue",
								afterFind_testRequired : 1
							}
						],
						optionsCheck : {
							_beforeFind_testRequired : 1
						}
					},
					{
						name : "should chain virtuals recursively",
						filter : { foo : "1" },
						options : { fields : { foo : 1, requiresChained : 1 } },
						results : [
							{
								foo : "1",
								requiresChained : "requiresChained_requiresBar_barValue",
								requiresBar : "requiresBar_barValue",
								afterFind_testRequired : 1
							}
						],
						optionsCheck : {
							_beforeFind_testRequired : 1
						}
					},
					{
						name : "castDocs false and not including virtuals",
						filter : { foo : "1" },
						options : { fields : { _id : 0, bar : 1 }, castDocs : false },
						results : [
							{
								type : "object",
								allowExtraKeys : false,
								data : {
									bar : "barValue"
								}
							}
						]
					},
					{
						name : "castDocs false should only return requested fields even when using virtuals",
						filter : { foo : "1" },
						options : { fields : { requiresBar : 1 }, castDocs : false },
						results : [
							{
								type : "object",
								allowExtraKeys : false,
								data : {
									requiresBar : "requiresBar_barValue"
								}
							}
						]
					},
					{
						name : "castDocs false should allow multi-step virtual chaining",
						filter : { foo : "1" },
						options : { fields : { requiresChained : 1 }, castDocs : false },
						results : [
							{
								type : "object",
								allowExtraKeys : false,
								data : {
									requiresChained : "requiresChained_requiresBar_barValue"
								}
							}
						],
						optionsCheck : {
							_beforeFind_testRequired : 1
						}
					},
					{
						name : "castDocs false should only execute each virtual once",
						filter : { foo : "1" },
						options : { fields : { foo : 1, requiresCount0 : 1, requiresCount1 : 1 }, castDocs : false },
						results : [
							{
								type : "object",
								allowExtraKeys : false,
								data : {
									foo : "1",
									requiresCount0 : 1,
									requiresCount1 : 1
								}
							}
						]
					},
					{
						name : "castDocs false should allow querying just id",
						filter : { foo : "1" },
						options : { fields : { id : 1 }, castDocs : false },
						results : [
							{
								type : "object",
								allowExtraKeys : false,
								data : {
									id : mongolayer.testId("basic1").toString()
								}
							}
						]
					},
					{
						name : "should not push the same hook multiple times",
						filter : { foo : "1" },
						options : { fields : { requiresHooks : 1, requiresChained : 1 } },
						results : [
							{
								afterFind_testRequired : 1
							}
						],
						optionsCheck : {
							_beforeFind_testRequired : 1
						}
					},
					{
						name : "should use hook multiple if requested multiple",
						filter : { foo : "1" },
						options : { fields : { foo : 1 }, hooks : ["afterFind_testRequired", "afterFind_testRequired"] },
						results : [
							{
								afterFind_testRequired : 2
							}
						]
					},
					{
						name : "castDocs should ensure that virtuals are executed in the proper order",
						filter : { foo : "1" },
						options : { fields : { v_5 : 1 }, castDocs : false },
						results : [
							{
								v_5 : "v_5_v_3_v_1_1_v_4_v_2_barValue"
							}
						]
					}
				]
				
				tests.forEach(function(test) {
					(test.only ? it.only : it)(test.name, function(done) {
						model.find(test.filter, test.options, function(err, docs) {
							assert.ifError(err);
							
							if (test.results !== undefined) {
								assertLib.deepCheck(docs, test.results);
							}
							
							if (test.optionsCheck !== undefined) {
								assertLib.deepCheck(test.options, test.optionsCheck);
							}
							
							return done();
						});
					});
				});
			});
			
			describe("relationships", function(done) {
				var root1 = new mongolayer.ObjectId();
				var root2 = new mongolayer.ObjectId();
				var root3 = new mongolayer.ObjectId();
				var root4 = new mongolayer.ObjectId();
				var root5 = new mongolayer.ObjectId();
				var root6 = new mongolayer.ObjectId();
				var root7 = new mongolayer.ObjectId();
				var root8 = new mongolayer.ObjectId();
				var related1_1 = new mongolayer.ObjectId();
				var related1_2 = new mongolayer.ObjectId();
				var related1_3 = new mongolayer.ObjectId();
				var related1_4 = new mongolayer.ObjectId();
				var related2_1 = new mongolayer.ObjectId();
				var related2_2 = new mongolayer.ObjectId();
				
				beforeEach(function(done) {
					async.parallel([
						function(cb) {
							model.insert([
								{
									_id : root1,
									foo : "foo1"
								},
								{
									_id : root2,
									foo : "foo2",
									single_id : related1_1,
									single_rightKey_id : "title1_1",
									multiple_rightKey_ids : ["title1_2", "title1_1"]
								},
								{
									_id : root3,
									foo : "foo3",
									multiple_ids : [related1_4, related1_1],
									single_rightKey_id : "title1_2",
									multiple_rightKey_ids : ["title1_3", "title1_1"]
								},
								{
									_id : root4,
									foo : "foo4",
									bar : "bar4",
									single_id : related1_2,
									multiple_ids : [related1_1]
								},
								{
									_id : root5,
									foo : "foo5",
									single_multipleTypes_id : {
										id : related1_1,
										modelName : "mongolayer_testRelated"
									}
								},
								{
									_id : root6,
									foo : "foo6",
									single_multipleTypes_id : {
										id : related2_1,
										modelName : "mongolayer_testRelated2"
									}
								},
								{
									_id : root7,
									foo : "foo7",
									multiple_multipleTypes_ids : [
										{
											id : related1_1,
											modelName : "mongolayer_testRelated"
										},
										{
											id : related2_1,
											modelName : "mongolayer_testRelated2"
										},
										{
											id : related1_4,
											modelName : "mongolayer_testRelated"
										}
									]
								},
								{
									_id : root8,
									foo : "foo8",
									multiple_multipleTypes_ids : [
										{
											id : related2_1, // bogus id doesn't exist in this model
											modelName : "mongolayer_testRelated"
										},
										{
											id : related1_1, // valid id
											modelName : "mongolayer_testRelated"
										},
										{
											id : related1_1, // bogus model
											modelName : "bogus"
										}
									]
								}
							], cb);
						},
						function(cb) {
							modelRelated.insert([
								{
									_id : related1_1,
									title : "title1_1",
									singleRequired_id : related2_2
								},
								{
									_id : related1_2,
									title : "title1_2",
									extra : "extra1_2",
									singleSecond_id : related2_1,
									singleRequired_id : related2_1
								},
								{
									_id : related1_3,
									title : "title1_3",
									singleSecond_id : related2_2,
									singleRequired_id : related2_1
								},
								{
									_id : related1_4,
									title : "title1_4",
									singleRequired_id : related2_1
								}
							], cb);
						},
						function(cb) {
							modelRelated2.insert([
								{
									_id : related2_1,
									title : "title2_1",
									extra : "extra2_1"
								},
								{
									_id : related2_2,
									title : "title2_2"
								}
							], cb);
						}
					], function(err) {
						assert.ifError(err);
						
						done();
					});
				});
				
				it("should populate single", function(done) {
					model.find({}, { hooks : ["afterFind_single"] }, function(err, docs) {
						assert.ifError(err);
						
						assert.equal(docs[0].foo, "foo1");
						assert.equal(docs[0].single_id, undefined);
						assert.equal(docs[1].foo, "foo2");
						assert.equal(docs[1].single.title, "title1_1");
						
						done();
					});
				});
				
				it("should populate single with multipleTypes", function(done) {
					model.find({ _id : { $in : [root1, root5, root6] } }, { hooks : ["afterFind_single_multipleTypes"] }, function(err, docs) {
						assert.ifError(err);
						
						assert.equal(docs[0].single_multipleTypes, undefined);
						assert.equal(docs[1].single_multipleTypes.title, "title1_1");
						assert.equal(docs[2].single_multipleTypes.title, "title2_1");
						
						done();
					});
				});
				
				it("should populate single with rightKey", function(done) {
					model.find({}, { hooks : ["afterFind_single_rightKey"] }, function(err, docs) {
						assert.ifError(err);
						
						assert.equal(docs[0].single_rightKey, undefined);
						assert.equal(docs[1].single_rightKey.title, "title1_1");
						assert.equal(docs[1].single_rightKey_id, docs[1].single_rightKey.title);
						assert.equal(docs[2].single_rightKey.title, "title1_2");
						assert.equal(docs[2].single_rightKey_id, docs[2].single_rightKey.title);
						
						done();
					});
				});
				
				it("should populate multiple", function(done) {
					model.find({}, { hooks : ["afterFind_multiple"] }, function(err, docs) {
						assert.ifError(err);
						
						assert.equal(docs[0].foo, "foo1");
						assert.equal(docs[0].multiple, undefined);
						assert.equal(docs[2].multiple[0].title, "title1_4");
						assert.equal(docs[2].multiple[1].title, "title1_1");
						assert.equal(docs[3].multiple[0].title, "title1_1");
						
						done();
					});
				});
				
				it("should populate multiple with multipleTypes", function(done) {
					model.find({ _id : { $in : [root1, root7, root8] } }, { hooks : ["afterFind_multiple_multipleTypes"] }, function(err, docs) {
						assert.ifError(err);
						
						assert.equal(docs[0].multiple_multipleTypes, undefined);
						assert.equal(docs[1].multiple_multipleTypes[0].title, "title1_1");
						assert.equal(docs[1].multiple_multipleTypes[1].title, "title2_1");
						assert.equal(docs[1].multiple_multipleTypes[2].title, "title1_4");
						assert.equal(docs[2].multiple_multipleTypes[0].title, "title1_1");
						
						done();
					});
				});
				
				it("should populate multiple with rightKey", function(done) {
					model.find({}, { hooks : ["afterFind_multiple_rightKey"] }, function(err, docs) {
						assert.ifError(err);
						
						assert.equal(docs[0].multiple_rightKey, undefined);
						assert.equal(docs[1].multiple_rightKey[0].title, "title1_2");
						assert.equal(docs[1].multiple_rightKey_ids[0], docs[1].multiple_rightKey[0].title);
						assert.equal(docs[1].multiple_rightKey[1].title, "title1_1");
						assert.equal(docs[1].multiple_rightKey_ids[1], docs[1].multiple_rightKey[1].title);
						assert.equal(docs[2].multiple_rightKey[0].title, "title1_3");
						assert.equal(docs[2].multiple_rightKey_ids[0], docs[2].multiple_rightKey[0].title);
						assert.equal(docs[2].multiple_rightKey[1].title, "title1_1");
						assert.equal(docs[2].multiple_rightKey_ids[1], docs[2].multiple_rightKey[1].title);
						
						done();
					});
				});
				
				it("should populate with recursive hooks on single", function(done) {
					model.find({ _id : root4 }, { hooks : ["afterFind_single", "single.afterFind_singleSecond"] }, function(err, docs) {
						assert.ifError(err);
						
						assert.equal(docs.length, 1);
						assert.equal(docs[0].single.singleSecond.title, "title2_1");
						
						done();
					});
				});
				
				it("should populate with fields recursively on single", function(done) {
					async.parallel([
						function(cb) {
							model.findById(root4, {
								hooks : ["afterFind_single", "single.afterFind_singleSecond"]
							}, function(err, doc) {
								assert.ifError(err);
								
								assert.strictEqual(doc.foo, "foo4");
								assert.strictEqual(doc.bar, "bar4");
								assert.strictEqual(doc.single.title, "title1_2");
								assert.strictEqual(doc.single.extra, "extra1_2");
								assert.strictEqual(doc.single.singleSecond.title, "title2_1");
								assert.strictEqual(doc.single.singleSecond.extra, "extra2_1");
								
								cb(null);
							});
						},
						function(cb) {
							model.findById(root4, {
								hooks : ["afterFind_single", "single.afterFind_singleSecond"],
								fields : { bar : 0, "single.extra" : 0, "single.singleSecond.title" : 0 }
							}, function(err, doc) {
								assert.ifError(err);
								
								assert.strictEqual(doc.foo, "foo4");
								assert.strictEqual(doc.bar, undefined);
								assert.strictEqual(doc.single.title, "title1_2");
								assert.strictEqual(doc.single.extra, undefined);
								assert.strictEqual(doc.single.singleSecond.title, undefined);
								assert.strictEqual(doc.single.singleSecond.extra, "extra2_1");
								
								cb(null);
							});
						}
					], function(err) {
						assert.ifError(err);
						
						done();
					});
				});
				
				it("should populate with recursive hooks on multiple", function(done) {
					model.find({ _id : root3 }, { hooks : ["afterFind_multiple", "multiple.afterFind_singleRequired"] }, function(err, docs) {
						assert.ifError(err);
						
						assert.equal(docs.length, 1);
						assert.equal(docs[0].multiple.length, 2);
						assert.equal(docs[0].multiple[0].singleRequired.title, "title2_1");
						assert.equal(docs[0].multiple[1].singleRequired.title, "title2_2");
						
						done();
					});
				});
				
				it("should require related", function(done) {
					modelRelated.insert({
						title : "titleRequire"
					}, function(err) {
						assert.ok(err.message.match(/is required/));
						
						done();
					});
				});
				
				it("should not alter relationship hookArgs fields when calling", function(done) {
					var fields = { title : 1, "singleSecond.title" : 1 };
					var hooks = [];
					model.find({ _id : root4 }, { hooks : [{ name : "afterFind_single", args : { fields : fields, castDocs : false, hooks : [] } }] }, function(err, docs) {
						assert.ifError(err);
						
						assert.deepStrictEqual(hooks, []);
						assert.deepStrictEqual(fields, {
							title : 1,
							"singleSecond.title" : 1
						});
						
						return done();
					});
				});

				it("should operate the random after execution of beforeFind hooks", async function() {
					model.addHook({
						name: "changeFilter",
						type: "beforeFind",
						handler: (args, cb) => {
							args.filter = { _id: root1 };
							return cb(null, args);
						}
					});

					const result = await model.promises.find({}, {
						hooks: ["beforeFind_changeFilter"],
						random: 10,
						castDocs: false,
						fields: {
							foo: true,
							baz: true
						}
					});

					assert.deepStrictEqual(result, [
						{
							foo: "foo1",
							baz: false
						}
					])
				});

				it("should preserve counts with random", async function() {
					const validIds = [root1, root2, root3, root4]
					const validIdStrings = validIds.map(val => val.toString());

					const result = await model.promises.find({
						_id: {
							$in: validIds
						}
					}, { random: 1, count: true });
					assert.strictEqual(result.count, 4);
					assert.strictEqual(result.docs.length, 1);
					assert.strictEqual(validIdStrings.includes(result.docs[0]._id.toString()), true)
				});
				
				var tests = [
					{
						name : "should populate relationship via field key",
						filter : { _id : root3 },
						options : { fields : { foo : 1, single_rightKey : 1 } },
						results : [
							{
								foo : "foo3",
								single_rightKey : {
									type : "object",
									class : mongolayer.Document,
									data : {
										title : "title1_2",
										extra : "extra1_2"
									}
								}
							}
						]
					},
					{
						name : "should populate relationship via field key and pass castDocs",
						filter : { _id : root3 },
						options : { fields : { foo : 1, single_rightKey : 1 }, castDocs : false },
						results : [
							{
								type : "object",
								allowExtraKeys : false,
								data : {
									foo : "foo3",
									single_rightKey : {
										type : "object",
										allowExtraKeys : false,
										data : {
											_id : { type : "object", class : mongolayer.ObjectId },
											title : "title1_2",
											extra : "extra1_2",
											singleSecond_id : { type : "object", class : mongolayer.ObjectId },
											singleRequired_id : { type : "object", class : mongolayer.ObjectId },
										}
									}
								}
							}
						]
					},
					{
						name : "should populate recursively with castDocs true, returning fields required for processing the virtuals",
						filter : { _id : root3 },
						options : { fields : { "single_rightKey.singleSecond.extra" : 1 } },
						results : [
							{
								_id : mongoId,
								single_rightKey_id : "title1_2",
								single_rightKey : {
									_id : mongoId,
									title : "title1_2",
									singleSecond_id : mongoId,
									singleSecond : {
										_id : mongoId,
										extra : "extra2_1",
										title : undefined,
										// "defaultHook" gets added by defaultHooks
										defaultHook : "default_hook_extra2_1"
									}
								},
								requiresBar : "requiresBar_undefined",
								requiresHooks : true
							}
						]
					},
					{
						name : "should populate recursively with castDocs false, only returning required fields",
						filter : { _id : root3 },
						options : { fields : { "single_rightKey.singleSecond.extra" : 1 }, castDocs : false },
						results : [
							{
								type : "object",
								allowExtraKeys : false,
								data : {
									single_rightKey : {
										type : "object",
										allowExtraKeys : false,
										data : {
											singleSecond : {
												type : "object",
												allowExtraKeys : false,
												data : {
													extra : "extra2_1"
												}
											}
										}
									}
								}
							}
						]
					},
					{
						name : "should populate virtual with requiredHook and requiredField recursively",
						filter : { _id : root3 },
						options : {
							fields : {
								"single_rightKey.singleSecond.virtual" : 1
							},
							hooks : [],
							castDocs : false
						},
						results : [
							{
								_deepCheck_allowExtraKeys : false,
								single_rightKey : {
									_deepCheck_allowExtraKeys : false,
									singleSecond : {
										_deepCheck_allowExtraKeys : false,
										virtual : "overwrite_extra2_1"
									}
								}
							}
						]
					},
					{
						name : "should pull down extra key if not overwritten",
						filter : { _id : root4 },
						options : {
							fields : {
								foo : 1,
								"single.extra" : 1
							}
						},
						results : [
							{
								foo : "foo4",
								single : {
									extra : "extra1_2"
								}
							}
						]
					},
					{
						name : "should allow overwrite passed in fields with hookArgs",
						filter : { _id : root4 },
						options : {
							fields : {
								"foo" : 1,
								"single.extra" : 1
							},
							hooks : [
								{ name : "afterFind_single", args : { fields : { title : 1 } } }
							]
						},
						results : [
							{
								foo : "foo4",
								single : {
									_id : related1_2,
									id : related1_2.toString(),
									title : "title1_2",
									extra : undefined
								}
							}
						]
					},
					{
						name : "should allow overwrite of castDocs with hookArgs",
						filter : { _id : root4 },
						options : {
							fields : {
								foo : 1,
								"single.extra" : 1
							},
							hooks : [
								{ name : "afterFind_single", args : { fields : { title : 1, "singleSecond.title" : 1 }, castDocs : false } }
							]
						},
						results : [
							{
								foo : "foo4",
								single : {
									_id : related1_2, // despite not being in fields, this comes back because the parent join requires it
									id : undefined,
									title : "title1_2",
									extra : undefined,
									singleSecond : {
										_id : undefined,
										title : "title2_1"
									}
								}
							}
						]
					},
					{
						name : "should allow overwrite of hooks with hookArgs",
						filter : { _id : root4 },
						options : {
							hooks : [{ name : "afterFind_single", args : { hooks : ["afterFind_singleRequired"] } }, "single.afterFind_singleSecond"]
						},
						results : [
							{
								foo : "foo4",
								single : {
									_id : related1_2,
									title : "title1_2",
									extra : "extra1_2",
									singleSecond : undefined,
									singleRequired : {
										title : "title2_1"
									}
								}
							}
						]
					},
					{
						name : "should pass through context",
						filter : { _id : root4 },
						options : {
							hooks : ["afterFind_single"],
							context : {
								verifyContext : "data"
							}
						},
						results : [
							{
								foo : "foo4",
								_context : "data",
								single : {
									title : "title1_2",
									_context : "data"
								}
							}
						]
					},
					{
						name: "should resolve data with random",
						filter: {
							_id: root2
						},
						options: {
							random: 1,
							castDocs: false,
							fields: {
								foo: true,
								"single.title": true,
								"single.singleRequired.title": true
							}
						},
						results: [
							{
								foo: "foo2",
								single: {
									title: "title1_1",
									singleRequired: {
										title: "title2_2"
									}
								}
							}
						]
					}
				]
				
				tests.forEach(function(test) {
					(test.only ? it.only : it)(test.name, function(done) {
						model.find(test.filter, test.options, function(err, docs) {
							assert.ifError(err);
							
							if (test.results !== undefined) {
								assertLib.deepCheck(docs, test.results);
							}
							
							return done();
						});
					});
				});
			});
		});
		
		describe("_id semantic testing", function(done) {
			it("should insert ObjectId for _id", function(done) {
				var id = new mongolayer.ObjectId();
				
				model.insert({
					_id : id,
					foo : "test"
				}, function(err, doc) {
					assert.ifError(err);
					
					assert.equal(doc._id.toString(), id.toString());
					
					done();
				});
			});
			
			it("should fail insert string for _id", function(done) {
				var id = new mongolayer.ObjectId();
				
				model.insert({
					_id : id.toString(),
					foo : "test"
				}, function(err, doc) {
					assert.equal(err instanceof Error, true);
					
					done();
				});
			});
			
			it("should insert string for id", function(done) {
				var id = new mongolayer.ObjectId();
				
				model.insert({
					id : id.toString(),
					foo : "test"
				}, function(err, doc) {
					assert.ifError(err);
					assert.equal(doc.id, id.toString());
					
					done();
				});
			});
			
			it("should find on _id with object", function(done) {
				var id = new mongolayer.ObjectId();
				
				model.insert({
					_id : id,
					foo : "test"
				}, function(err) {
					assert.ifError(err);
					
					model.find({ _id : id }, function(err, docs) {
						assert.equal(docs[0].foo, "test");
						
						done();
					});
				});
			});
			
			it("should fail on find on _id with string", function(done) {
				var id = new mongolayer.ObjectId();
				
				model.insert({
					_id : id,
					foo : "test"
				}, function(err) {
					assert.ifError(err);
					
					model.find({ id : id }, function(err, docs) {
						assert.ifError(err);
						assert.equal(docs.length, 0);
						
						done();
					});
				});
			});
		});
		
		describe("_processFields", function() {
			var tests = [
				{
					name : "simple",
					args : () => ({
						options : {
							fields : { _id : 1 },
							hooks : []
						},
						result : {
							_deepCheck_allowExtraKeys : false,
							virtuals : [],
							fields : {
								_deepCheck_allowExtraKeys : false,
								_id : 1
							},
							fieldsAdded : false,
							virtualsAdded : false,
							hooks : []
						}
					})
				},
				{
					name : "excludes id",
					args : () => ({
						options : {
							fields : {
								foo : 1
							},
							hooks : [],
							castDocs : false
						},
						result : {
							_deepCheck_allowExtraKeys : false,
							virtuals : [],
							fields : {
								_deepCheck_allowExtraKeys : false,
								foo : 1,
								_id : 0
							},
							fieldsAdded : false,
							virtualsAdded : false,
							hooks : []
						}
					})
				},
				{
					name : "requires hooks",
					args : () => ({
						options : {
							fields : {
								_id : 1,
								requiresHooks : 1
							},
							hooks : []
						},
						result : {
							_deepCheck_allowExtraKeys : false,
							virtuals : ["requiresHooks"],
							fields : {
								_id : 1,
								requiresHooks : 1
							},
							fieldsAdded : false,
							virtualsAdded : true,
							hooks : ["beforeFind_testRequired", "afterFind_testRequired"]
						}
					})
				},
				{
					name : "multiple chained dependencies",
					args : () => ({
						options : {
							fields : {
								v_5 : 1
							},
							hooks : []
						},
						result : {
							_deepCheck_allowExtraKeys : false,
							virtuals : ["v_1", "v_3", "v_2", "v_4", "v_5"],
							fields : {
								_deepCheck_allowExtraKeys : false,
								v_5 : 1,
								any : 1,
								foo : 1,
								bar : 1
							},
							fieldsAdded : true,
							virtualsAdded : true,
							hooks : []
						}
					})
				}
			]
			
			testArray(tests, function(test) {
				var result = model._processFields(test.options);
				assertLib.deepCheck(result, test.result);
			});
		});

		describe("views", function() {
			beforeEach(async function() {
				await model.promises.insert([
					{
						foo : "one",
						viewOn : true
					},
					{
						foo : "two"
					},
					{
						foo : "three",
						viewOn : true
					},
					{
						foo : "four"
					}
				]);
			});

			it("should have a functional find", async function() {
				const content = await modelView.promises.find();
				assertLib.deepCheck(content, [
					{
						foo : "one",
						viewOn : true
					},
					{
						foo : "three",
						viewOn : true
					}
				]);
			});

			it("should have a functional aggregate", async function() {
				const content = await modelView.promises.aggregate([
					{
						$match : {
							foo : "three"
						}
					}
				]);

				assertLib.deepCheck(content, [
					{
						foo : "three",
						viewOn : true
					}
				]);
			});

			it("should update an existing view with a new definition", async function() {
				const name = "mongolayer_testView2";
				try {
					await conn.db.collection(name).drop();
				} catch (e) {
					// ignoring the error thrown if the collection doesn't exist
				}
				
				await conn.db.command({
					create : name,
					viewOn : "mongolayer_test",
					pipeline : []
				});

				const count = await conn.db.collection(name).countDocuments();

				assert.strictEqual(count, 4);

				const viewTwo = new mongolayer.Model({
					collection : "mongolayer_testView2",
					viewOn : "mongolayer_test",
					pipeline : [
						{
							$match : {
								viewOn : true
							}
						}
					]
				});

				await conn.promises.add({ model : viewTwo });

				const count2 = await viewTwo.promises.count({});

				assert.strictEqual(count2, 2);
			});

			it("should createView properly", async function() {
				const name = "mongolayer_testView3";
				try {
					await conn.db.collection(name).drop();
				} catch(e) {

				}

				const m1 = new mongolayer.Model({
					collection : name,
					viewOn : "mongolayer_test",
					pipeline : []
				});

				await conn.promises.add({ model : m1, sync : false });

				const result1 = await m1.createView();
				assert.deepStrictEqual(result1, { created : true, updated : false });

				const result2 = await m1.createView();
				assert.deepStrictEqual(result2, { created : true, updated : false });

				m1.pipeline = [{ $match : { viewOn : true } }];
				const result3 = await m1.createView();
				assert.deepStrictEqual(result3, { created : false, updated : true });
			});
		});
	});
});
