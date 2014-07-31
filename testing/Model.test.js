var assert = require("assert");
var domain = require("domain");
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
	
	it("should create", function(done) {
		var model = new mongolayer.Model({ collection : "foo" });
		
		done();
	});
	
	it("should _setConnection and _disconnect", function(done) {
		var model = new mongolayer.Model({ collection : "some_table" });
		
		var collection = function() { return "collectionReturn" }
		
		model._setConnection({
			connection : { db : { collection : collection }, foo : "bar" }
		});
		
		assert.equal(model.connected, true);
		assert.equal(model._connection.foo, "bar");
		assert.equal(model.collection, "collectionReturn");
		
		model._disconnect();
		
		assert.equal(model.connected, false);
		assert.equal(model._connection, null);
		assert.equal(model.collection, null);
		
		done();
	});
	
	it("should get id and _id fields by default", function(done) {
		var model = new mongolayer.Model({ collection : "foo" });
		
		assert.notEqual(model._fields["_id"], undefined);
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
		
		assert.equal(model._fields["foo"].validation.type, "string");
		assert.equal(model._fields["bar"].validation.type, "number");
		
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
				beforeFind : ["foo"]
			}
		});
		
		// hook registered exists
		assert.equal(model.defaultHooks.beforeFind[0], "foo");
		// non-declared hooks still have default empty array
		assert.equal(model.defaultHooks.afterFind.length, 0);
		
		done();
	});
	
	it("should have working idToString virtual", function(done) {
		var model = new mongolayer.Model({
			collection : "foo",
			virtuals : [
				{ name : "string", type : "idToString", options : { key : "raw" } }
			]
		});
		
		var id = mongolayer.ObjectId();
		var doc = new model.Document({ raw : id });
		
		// check if getter with value works
		assert.equal(doc.string, id.toString());
		
		// check if setter with value works
		var newid = mongolayer.ObjectId();
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
		
		var id = mongolayer.ObjectId()
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
	
	it("should _validateDocData and fail on invalid type", function(done) {
		var model = new mongolayer.Model({
			collection : "foo",
			fields : [
				{ name : "foo", validation : { type : "string" } }
			]
		});
		
		model._validateDocData({ foo : 5 }, function(err) {
			assert.equal(err instanceof Error, true);
			
			done();
		});
	});
	
	it("should _validateDocData and fail on invalid column", function(done) {
		var model = new mongolayer.Model({
			collection : "foo",
			fields : [
				{ name : "foo", validation : { type : "string" } }
			]
		});
		
		model._validateDocData({ bar : "test" }, function(err) {
			assert.equal(err instanceof Error, true);
			
			done();
		});
	});
	
	it("should _validateDocData and succeed on valid type", function(done) {
		var model = new mongolayer.Model({
			collection : "foo",
			fields : [
				{ name : "foo", validation : { type : "string" } }
			]
		});
		
		model._validateDocData({ foo : "something" }, function(err) {
			assert.equal(err, null);
			
			done();
		});
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
		
		model._checkRequired({ foo : "fooValue" }, function(err) {
			assert.equal(err instanceof Error, true);
			
			done();
		});
	});
	
	it("should _processDocs and run validation and defaults and required", function(done) {
		var model = new mongolayer.Model({
			collection : "foo",
			fields : [
				{ name : "foo", validation : { type : "string" } },
				{ name : "bar", validation : { type : "boolean" }, required : true },
				{ name : "baz", default : 5, validation : { type : "number" } }
			]
		});
		
		var args = { validate : true, defaults : true, checkRequired : true };
		
		async.series([
			function(cb) {
				// should fail required
				args.data = [{ foo : "something" }];
				
				model._processDocs(args, function(err, cleanDocs) {
					assert.equal(err instanceof Error, true);
					assert.equal(cleanDocs, undefined);
					
					cb(null);
				});
			},
			function(cb) {
				// should have default rolled in
				args.data = [{ foo : "something", bar : true }];
				
				model._processDocs(args, function(err, cleanDocs) {
					assert.ifError(err);
					
					assert.equal(cleanDocs[0].baz, 5);
					
					cb(null);
				});
			},
			function(cb) {
				// should fail validation
				args.data = [{ foo : "something", bar : "false" }];
				
				model._processDocs(args, function(err, cleanDocs) {
					assert.equal(err instanceof Error, true);
					assert.equal(cleanDocs, undefined);
					
					cb(null);
				});
			}
		], function(err) {
			assert.ifError(err);
			
			done();
		});
	});
	
	it("should _processDocs and fail if document errors", function(done) {
		var model = new mongolayer.Model({
			collection : "foo",
			fields : [
				{ name : "foo", validation : { type : "string" } },
				{ name : "bar", default : 5, validation : { type : "number" } }
			]
		});
		
		var test = { foo : 5 };
		var test2 = { foo : "something" };
		
		model._processDocs({ data : [test, test2], validate : true, defaults : true }, function(err, cleanDocs) {
			assert.equal(err instanceof Error, true);
			assert.equal(cleanDocs, undefined);
			
			done();
		});
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
		
		it("should _getMyHooks", function(done) {
			var test = model._getMyHooks("foo", [{ name : "nuts" }, { name : "foo" }, { name : "foo.bar" }, { name : "foo.bar.baz" }]);
			
			assert.equal(test.length, 2);
			assert.equal(test[0].name, "bar");
			assert.equal(test[1].name, "bar.baz");
			
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
				assert.equal(args.data.length, 0);
				
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
			var d = domain.create();
			
			d.on("error", function(err) {
				done();
				
				d.dispose();
			});
			
			d.run(function() {
				process.nextTick(function() {
					model._executeHooks({ type : "beforeFind", hooks : [{ name : "bogus" }], args : { data : [] } }, function(err, args) {
						throw new Error("Should never get here");
					});
				});
			});
		});
	});
	
	describe("CRUD", function(done) {
		var model;
		var modelRelated;
		var modelRelated2;
		
		beforeEach(function(done) {
			model = new mongolayer.Model({
				collection : "mongolayer_test",
				fields : [
					{ name : "foo", validation : { type : "string" } },
					{ name : "bar", validation : { type : "string" } },
					{ name : "baz", default : false, validation : { type : "boolean" } }
				],
				relationships : [
					{ name : "single", type : "single", modelName : "mongolayer_testRelated" },
					{ name : "multiple", type : "multiple", modelName : "mongolayer_testRelated" }
				],
				documentMethods : [
					{ name : "testMethod", handler : function() { return "testMethodReturn" } }
				]
			});
			
			modelRelated = new mongolayer.Model({
				collection : "mongolayer_testRelated",
				fields : [
					{ name : "title", validation : { type : "string" } }
				],
				relationships : [
					{ name : "singleSecond", type : "single", modelName : "mongolayer_testRelated2" }
				]
			});
			
			modelRelated2 = new mongolayer.Model({
				collection : "mongolayer_testRelated2",
				fields : [
					{ name : "title", validation : { type : "string" } }
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
				done();
			});
		});
		
		describe("insert", function(done) {
			it("should insert single", function(done) {
				model.insert({
					foo : "fooValue",
					bar : "barValue"
				}, function(err, doc) {
					assert.ifError(err);
					
					assert.equal(doc.foo, "fooValue");
					
					done();
				});
			});
			
			it("should run virtuals on insert", function(done) {
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
						bar : "barValue1"
					},
					{
						foo : "fooValue2",
						bar : "barValue2"
					}
				], function(err, docs) {
					assert.ifError(err);
					
					assert.equal(docs[0].foo, "fooValue1");
					assert.equal(docs[0].bar, "barValue1");
					assert.equal(docs[1].foo, "fooValue2");
					assert.equal(docs[1].bar, "barValue2");
					
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
			
			it("should insert empty string", function(done) {
				model.insert({
					foo : ""
				}, function(err, doc) {
					assert.ifError(err);
					
					assert.equal(doc.foo, "");
					
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
				
				async.series([
					function(cb) {
						// no hooks specified, no hooks ran
						beforeCalled = false;
						afterCalled = false;
						
						model.insert(data, function(err, docs) {
							assert.ifError(err);
							
							assert.equal(beforeCalled, false);
							assert.equal(afterCalled, false);
							
							model.remove({}, function(err) {
								cb(null);
							});
						});
					},
					function(cb) {
						// hooks specified, hooks ran
						beforeCalled = false;
						afterCalled = false;
						
						model.insert(data, { beforeHooks : ["process"], afterHooks : ["process"] }, function(err, docs) {
							assert.ifError(err);
							
							assert.equal(beforeCalled, true);
							assert.equal(afterCalled, true);
							
							model.remove({}, function(err) {
								cb(null);
							});
						});
					},
					function(cb) {
						// using default hooks
						beforeCalled = false;
						afterCalled = false;
						
						model.defaultHooks.beforeInsert = ["process"];
						model.defaultHooks.afterInsert = ["process"];
						
						model.insert(data, function(err, docs) {
							assert.ifError(err);
							
							assert.equal(beforeCalled, true);
							assert.equal(afterCalled, true);
							
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
		
		describe("remove", function(done) {
			it("should remove", function(done) {
				model.remove({}, function(err, foo) {
					assert.ifError(err);
					
					done();
				});
			});
			
			it("should run hooks properly", function(done) {
				var beforeCalled;
				var afterCalled;
				
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
						assert.notEqual(args.count, undefined);
						
						afterCalled = true;
						
						cb(null, args);
					},
					required : false
				});
				
				async.series([
					function(cb) {
						// no hooks specified, no hooks ran
						beforeCalled = false;
						afterCalled = false;
						
						model.remove({}, function(err, docs) {
							assert.ifError(err);
							
							assert.equal(beforeCalled, false);
							assert.equal(afterCalled, false);
							
							cb(null);
						});
					},
					function(cb) {
						// hooks specified, hooks ran
						beforeCalled = false;
						afterCalled = false;
						
						model.remove({}, { beforeHooks : ["process"], afterHooks : ["process"] }, function(err, docs) {
							assert.ifError(err);
							
							assert.equal(beforeCalled, true);
							assert.equal(afterCalled, true);
							
							cb(null);
						});
					},
					function(cb) {
						// using default hooks
						beforeCalled = false;
						afterCalled = false;
						
						model.defaultHooks.beforeRemove = ["process"];
						model.defaultHooks.afterRemove = ["process"];
						
						model.remove({}, function(err, docs) {
							assert.ifError(err);
							
							assert.equal(beforeCalled, true);
							assert.equal(afterCalled, true);
							
							cb(null);
						});
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
					assert.equal(result.n, 1);
					
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
			
			it("should run hooks properly", function(done) {
				var beforeCalled;
				var afterCalled;
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
				
				async.series([
					function(cb) {
						// no hooks specified, no hooks ran
						beforeCalled = false;
						afterCalled = false;
						
						model.save(data, function(err, docs) {
							assert.ifError(err);
							
							assert.equal(beforeCalled, false);
							assert.equal(afterCalled, false);
							
							model.remove({}, function(err) {
								cb(null);
							});
						});
					},
					function(cb) {
						// hooks specified, hooks ran
						beforeCalled = false;
						afterCalled = false;
						
						model.save(data, { beforeHooks : ["process"], afterHooks : ["process"] }, function(err, docs) {
							assert.ifError(err);
							
							assert.equal(beforeCalled, true);
							assert.equal(afterCalled, true);
							
							model.remove({}, function(err) {
								cb(null);
							});
						});
					},
					function(cb) {
						// using default hooks
						beforeCalled = false;
						afterCalled = false;
						
						model.defaultHooks.beforeSave = ["process"];
						model.defaultHooks.afterSave = ["process"];
						
						model.save(data, function(err, docs) {
							assert.ifError(err);
							
							assert.equal(beforeCalled, true);
							assert.equal(afterCalled, true);
							
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
			var id1 = mongolayer.ObjectId();
			var id2 = mongolayer.ObjectId();
			
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
				model.update({ _id : id1 }, { "$set" : { foo : "1_updated" } }, function(err, count, result) {
					assert.ifError(err);
					
					// validate count
					assert.equal(count, 1);
					
					// ensure parameters exist in writeResult
					assert.equal(result.n, 1);
					assert.equal(result.updatedExisting, true);
					assert.equal(result.ok, true);
					
					done();
				});
			});
			
			it("should update whole", function(done) {
				model.update({ _id : id1 }, { foo : "1_updated" }, function(err, count, result) {
					assert.ifError(err);
					
					// validate count
					assert.equal(count, 1);
					
					// ensure parameters exist in writeResult
					assert.equal(result.n, 1);
					assert.equal(result.updatedExisting, true);
					assert.equal(result.ok, true);
					
					done();
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
			
			it("should run beforeUpdate and afterUpdate hooks on update", function(done) {
				var beforeCalled = false;
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
						assert.notEqual(args.count, undefined);
						assert.notEqual(args.result, undefined);
						
						afterCalled = true;
						
						cb(null, args);
					},
					required : true
				});
				
				model.update({ _id : id1 }, { "$set" : { foo : "change" } }, function(err, count, result) {
					assert.ifError(err);
					
					assert.equal(beforeCalled, true);
					assert.equal(afterCalled, true);
					
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
		
		describe("find", function() {
			describe("basic", function(done) {
				beforeEach(function(done) {
					model.insert([
						{
							foo : "1"
						},
						{
							foo : "2"
						},
						{
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
			});
			
			describe("relationships", function(done) {
				var root1 = new mongolayer.ObjectId();
				var root2 = new mongolayer.ObjectId();
				var root3 = new mongolayer.ObjectId();
				var root4 = new mongolayer.ObjectId();
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
									single_id : related1_1
								},
								{
									_id : root3,
									foo : "foo3",
									multiple_ids : [related1_4, related1_1]
								},
								{
									_id : root4,
									foo : "foo4",
									single_id : related1_2,
									multiple_ids : [related1_1]
								}
							], cb);
						},
						function(cb) {
							modelRelated.insert([
								{
									_id : related1_1,
									title : "title1_1"
								},
								{
									_id : related1_2,
									title : "title1_2",
									singleSecond_id : related2_1
								},
								{
									_id : related1_3,
									title : "title1_3",
									singleSecond_id : related2_2
								},
								{
									_id : related1_4,
									title : "title1_4"
								}
							], cb);
						},
						function(cb) {
							modelRelated2.insert([
								{
									_id : related2_1,
									title : "title2_1"
								},
								{
									_id : related2_2,
									title : "title2_2"
								}
							], cb);
						}
					], function(err) {
						done();
					});
				});
				
				it("should populate single", function(done) {
					model.find({}, { afterHooks : ["single"] }, function(err, docs) {
						assert.ifError(err);
						
						assert.equal(docs[0].foo, "foo1");
						assert.equal(docs[0].single_id, undefined);
						assert.equal(docs[1].foo, "foo2");
						assert.equal(docs[1].single.title, "title1_1");
						
						done();
					});
				});
				
				it("should populate multiple", function(done) {
					model.find({}, { afterHooks : ["multiple"] }, function(err, docs) {
						assert.ifError(err);
						
						assert.equal(docs[0].foo, "foo1");
						assert.equal(docs[0].multiple, undefined);
						assert.equal(docs[2].multiple[0].title, "title1_4");
						assert.equal(docs[2].multiple[1].title, "title1_1");
						assert.equal(docs[3].multiple[0].title, "title1_1");
						
						done();
					});
				});
				
				it("should populate with recursive hooks", function(done) {
					model.find({ _id : root4 }, { afterHooks : ["single", "single.singleSecond"] }, function(err, docs) {
						assert.ifError(err);
						
						assert.equal(docs.length, 1);
						assert.equal(docs[0].single.singleSecond.title, "title2_1");
						
						done();
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
	});
});