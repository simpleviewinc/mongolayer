var assert = require("assert");
var mongoLayer = require("../index.js");
var config = require("./config.js");
var async = require("async");

describe(__filename, function() {
	it("should add", function(done) {
		var connection = new mongoLayer.Connection({
			db : {
				collection : function() {}
			}
		});
		var model1 = new mongoLayer.Model({ collection : "foo" });
		var model2 = new mongoLayer.Model({ name : "foo_bar", collection : "foo" });
		
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
	
	it("should ensureIndexes on add", function(done) {
		mongoLayer.connect(config, function(err, conn) {
			assert.ifError(err);
			
			conn._db.dropCollection("foo", function(err) {
				assert.ifError(err);
				
				var model1 = new mongoLayer.Model({
					collection : "foo",
					fields : [
						{ name : "foo", validation : { type : "string" }, index : true }
					]
				});
				
				conn.add({ model : model1 }, function(err) {
					model1.collection.indexes(function(err, indexes) {
						assert.equal(indexes[1].key.foo, 1);
						assert.equal(indexes[1].name, "foo_1");
						
						done();
					});
				});
			});
		});
	});
});