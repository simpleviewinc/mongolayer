var assert = require("assert");
var mongolayer = require("../index.js");
var config = require("./config.js");
var async = require("async");

describe(__filename, function() {
	it("should add", function(done) {
		var connection = new mongolayer.Connection({
			db : {
				collection : function() {}
			}
		});
		var model1 = new mongolayer.Model({ collection : "foo" });
		var model2 = new mongolayer.Model({ name : "foo_bar", collection : "foo" });
		
		async.parallel([
			function(cb) {
				connection.add({ model : model1 }, cb);
			},
			function(cb) {
				connection.add({ model : model2 }, cb);
			}
		], function(err) {
			assert.ifError(err);
			
			assert.equal(connection.models.foo.model._collectionName, "foo");
			assert.equal(connection.models.foo.model, model1);
			assert.equal(connection.models.foo.model.connected, true);
			assert.equal(connection.models.foo_bar.model._collectionName, "foo");
			assert.equal(connection.models.foo_bar.model, model2);
			assert.equal(connection.models.foo_bar.model.connected, true);
			
			done();
		});
	});
	
	it("should remove", function(done) {
		var connection = new mongolayer.Connection({
			db : {
				collection : function() {}
			}
		});
		
		var model1 = new mongolayer.Model({ collection : "foo" });
		var model2 = new mongolayer.Model({ collection : "foo_bar" });
		
		async.parallel([
			function(cb) {
				connection.add({ model : model1 }, cb);
			},
			function(cb) {
				connection.add({ model : model2 }, cb);
			}
		], function(err) {
			assert.ifError(err);
			
			connection.remove({ model : model2 }, function(err) {
				assert.equal(model1.connected, true);
				assert.equal(model2.connected, false);
				assert.equal(connection.models["foo_bar"], undefined);
				
				done();
			});
		});
	});
	
	it("should removeAll", function(done) {
		var connection = new mongolayer.Connection({
			db : {
				collection : function() {}
			}
		});
		
		var model1 = new mongolayer.Model({ collection : "foo" });
		var model2 = new mongolayer.Model({ collection : "foo_bar" });
		
		async.parallel([
			function(cb) {
				connection.add({ model : model1 }, cb);
			},
			function(cb) {
				connection.add({ model : model2 }, cb);
			}
		], function(err) {
			assert.ifError(err);
			
			connection.removeAll(function(err) {
				assert.equal(model1.connected, false);
				assert.equal(model2.connected, false);
				assert.equal(connection.models["foo"], undefined);
				assert.equal(connection.models["foo_bar"], undefined);
				
				done();
			});
		});
	});
	
	it("should dropCollection that doesn't exist", function(done) {
		mongolayer.connect(config, function(err, conn) {
			assert.ifError(err);
			
			conn.dropCollection({ name : "fakeCollection" }, function(err) {
				assert.ifError(err);
				
				done();
			});
		});
	});
	
	it("should dropCollection that does exist", function(done) {
		mongolayer.connect(config, function(err, conn) {
			assert.ifError(err);
			
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
	});
	
	it("should ensureIndexes on add", function(done) {
		mongolayer.connect(config, function(err, conn) {
			assert.ifError(err);
			
			conn._db.dropCollection("foo", function(err) {
				if (err && err.message.match(/ns not found/) === null) {
					// node mongoDB native returns an error if a collection doesn't exist, but we don't consider that an error
					throw err;
				}
				
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
});