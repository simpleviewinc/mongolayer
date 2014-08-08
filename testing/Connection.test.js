var assert = require("assert");
var mongolayer = require("../index.js");
var config = require("./config.js");
var async = require("async");

describe(__filename, function() {
	var conn;
	
	beforeEach(function(done) {
		mongolayer.connectCached(config, function(err, temp) {
			conn = temp;
			
			done();
		});
	});
	
	it("should add", function(done) {
		var model1 = new mongolayer.Model({ collection : "foo" });
		var model2 = new mongolayer.Model({ name : "foo_bar", collection : "foo" });
		
		async.parallel([
			function(cb) {
				conn.add({ model : model1 }, cb);
			},
			function(cb) {
				conn.add({ model : model2 }, cb);
			}
		], function(err) {
			assert.ifError(err);
			
			assert.equal(conn.models.foo._collectionName, "foo");
			assert.equal(conn.models.foo, model1);
			assert.equal(conn.models.foo.connected, true);
			assert.equal(conn._models.foo.model, model1);
			assert.equal(conn.models.foo_bar._collectionName, "foo");
			assert.equal(conn.models.foo_bar, model2);
			assert.equal(conn.models.foo_bar.connected, true);
			assert.equal(conn._models.foo_bar.model, model2);
			
			done();
		});
	});
	
	it("should remove", function(done) {
		var model1 = new mongolayer.Model({ collection : "foo" });
		var model2 = new mongolayer.Model({ collection : "foo_bar" });
		
		async.parallel([
			function(cb) {
				conn.add({ model : model1 }, cb);
			},
			function(cb) {
				conn.add({ model : model2 }, cb);
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
			function(cb) {
				conn.add({ model : model1 }, cb);
			},
			function(cb) {
				conn.add({ model : model2 }, cb);
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
	
	it("should dropCollection that doesn't exist", function(done) {
		conn.dropCollection({ name : "fakeCollection" }, function(err) {
			assert.ifError(err);
			
			done();
		});
	});
	
	it("should dropCollection that does exist", function(done) {
		var model = new mongolayer.Model({
			collection : "testDrop",
			fields : [{ name : "foo", validation : { type : "string" } }]
		});
		
		conn.add({ model : model }, function(err) {
			assert.ifError(err);
			
			model.insert({ foo : "something" }, function(err) {
				conn.dropCollection({ name : "testDrop" }, function(err) {
					assert.ifError(err);
					
					done();
				});
			});
		});
	});
	
	it("should ensureIndexes on add", function(done) {
		conn.dropCollection("foo", function(err) {
			assert.ifError(err);
			
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
			
			conn.add({ model : model1 }, function(err) {
				model1.collection.indexes(function(err, indexes) {
					assert.equal(indexes[1].key.foo, 1);
					assert.equal(indexes[1].name, "foo_1");
					assert.equal(indexes[2].name, "bar_1");
					assert.equal(indexes[2].unique, true);
					
					done();
				});
			});
		});
	});
});