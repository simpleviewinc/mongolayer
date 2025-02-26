var assert = require("assert");
var mongolayer = require("../src/index.js");
var config = require("./config.js");
var async = require("async");

describe(__filename, function() {
	this.timeout(5000);
	
	var conn;
	
	beforeEach(function(done) {
		mongolayer.connectCached(config(), function(err, temp) {
			assert.ifError(err);
			
			conn = temp;
			
			done();
		});
	});
	
	after(async function() {
		mongolayer._clearConnectCache();
		await conn.close();
	});
	

	it("should add", function(done) {
		let model1 = new mongolayer.Model({ collection : "foo" });
		let model2 = new mongolayer.Model({ name : "foo_bar", collection : "foo" });

		async.parallel([
			async function() {
				await conn.add({ model : model1 });
			},
			async function() {
				await conn.add({ model : model2 });
			}
		], function(err) {
			assert.ifError(err);
			
			assert.equal(conn.models.foo.collectionName, "foo");
			assert.equal(conn.models.foo, model1);
			assert.equal(conn.models.foo.connected, true);
			assert.equal(conn._models.foo.model, model1);
			assert.equal(conn.models.foo_bar.collectionName, "foo");
			assert.equal(conn.models.foo_bar, model2);
			assert.equal(conn.models.foo_bar.connected, true);
			assert.equal(conn._models.foo_bar.model, model2);
			
			done();
		});
	});
	
	it("should remove", function(done) {
		let model1 = new mongolayer.Model({ collection : "foo" });
		let model2 = new mongolayer.Model({ collection : "foo_bar" });
		
		async.parallel([
			async function() {
				await conn.add({ model : model1 });
			},
			async function() {
				await conn.add({ model : model2 });
			}
		], function(err) {
			assert.ifError(err);
			
			conn.remove({ model : model2 }, function(err) {
				assert.equal(model1.connected, true);
				assert.equal(model2.connected, false);
				assert.equal(conn.models["foo_bar"], undefined);
				assert.equal(conn._models["foo_bar"], undefined);
				done();
			});
		});
	});
	
	it("should removeAll", function(done) {
		var model1 = new mongolayer.Model({ collection : "foo" });
		var model2 = new mongolayer.Model({ collection : "foo_bar" });
		
		async.parallel([
			async function(cb) {
				await conn.add({ model : model1 });
			},
			async function(cb) {
				await conn.add({ model : model2 });
			}
		], function(err) {
			assert.ifError(err);
			
			conn.removeAll(function(err) {
				assert.equal(model1.connected, false);
				assert.equal(model2.connected, false);
				assert.equal(conn.models["foo"], undefined);
				assert.equal(conn._models["foo"], undefined);
				assert.equal(conn.models["foo_bar"], undefined);
				assert.equal(conn._models["foo_bar"], undefined);
				done();
			});
		});
	});
	
	it("should dropCollection that doesn't exist", async function() {
		let result = await conn.dropCollection({ name : "fakeCollection" });
		console.log('result', result);
		assert.equal(result, true);
	});
	
	it("should dropCollection that does exist", async function() {
		let model = new mongolayer.Model({
			collection : "testDrop",
			fields : [{ name : "foo", validation : { type : "string" } }]
		});
		
		await conn.add({ model : model });
		let resultInsert = await model.promises.insert({ foo : "something" }, {});
		assert.equal(resultInsert.insertedCount, 1);
		let resultDrop = await conn.dropCollection({ name : "testDrop" });
		assert.equal(resultDrop, true);
	});
	
	it("should createIndexes on add", async function() {
		let result = await conn.dropCollection({ name : "foo" });
		assert.equal(result, true);

		let model1 = new mongolayer.Model({
			collection : "foo",
			fields : [
				{ name : "foo", validation : { type : "string" } },
				{ name : "bar", validation : { type : "string" } }
			],
			indexes : [
				{ keys : { "foo" : 1 } },
				{ keys : { "bar" : 1 }, options : { unique : true } }
			]
		});

		await conn.add({ model : model1 });
		let indexes = await model1.collection.indexes();
		assert.equal(indexes[1].key.foo, 1);
		assert.equal(indexes[1].name, "foo_1");
		assert.equal(indexes[2].name, "bar_1");
		assert.equal(indexes[2].unique, true);
	});
	
	it("should not add if createIndexes === false", async function() {
		let result = await conn.dropCollection({ name : "foo" });
		var model1 = new mongolayer.Model({
			collection : "foo",
			fields : [
				{ name : "foo", validation : { type : "string" } },
				{ name : "bar", validation : { type : "string" } }
			],
			indexes : [
				{ keys : { "foo" : 1 } },
				{ keys : { "bar" : 1 }, options : { unique : true } }
			]
		});
		
		await conn.add({ model : model1, createIndexes : false });
		try {
			await model1.collection.indexes();
			assert.fail("should not have gotten here");
		} catch (err) {
			assert.strictEqual(err.code, 26);
			assert.strictEqual(err.message, "ns does not exist: mongolayer.foo");
		}
	});
});