[![Build Status](https://travis-ci.org/simpleviewinc/mongolayer.svg?branch=master)](https://travis-ci.org/simpleviewinc/mongolayer)

# mongolayer

Mongolayer is a rich document system similar to Mongoose, but thinner, more type-strict, and with more developer flexibility.

This module is an attempt at providing the vision of `mongoose` (validation, hooks, relationships) but with less eccentricities, less magic under the hood providing developers with more consistent behaviors.

# Features
0. Supports the basic queries: `find`, `findById`, `save`, `update`, `count`, and `remove`.
0. Infinitely recursive field validation on `insert`, `save`, and `update`. Allowing you to validate arrays, objects, and any recursive combination of them.
0. Set required fields and field defaults enforced on `insert`, `save` and `update` with with `$set` and `$setOnInsert` operators.
0. Robust hook system to run async code before and after any query. You can set default hooks, required hooks, and specify which hooks run at query time.
0. Declare relationships between models allowing infinite recursive population of related records. Related records will be pulled with virtuals and methods.
0. Supports getter and setter virtuals on the document level.
0. Supports methods on the document level.
0. Supports methods on the model level.

# Why not just use Mongoose?

`mongoose` is a powerful package to which this module owes great homage, but after using `mongoose` for a while I became frustrated with some of it's eccentricities. In attempting to contribute to the module it became clear that the codebase was quite burdened by legacy.

Here are some examples of frustrations I personally came across using `mongoose`.

0. If a record in the DB does not have a value in a field, it will still fill that field with a default value when you pull it out of the database. This gives the illusion a value exists in the db, when it doesn't.
0. Unable to recursive populate recursive records (populate in a populate). You can only populate one level deep.
0. When records are populated, they are plain objects, lacking virtuals and methods that they would have if acquired with a normal query.
0. Unable to run post-query hooks with async code that gets flow control.
0. Too many differences from the way that node-mongodb-native and mongodb function out of the box. In example, `mongoose` wraps `update` with `$set` causing queries that 'look' correct in mongodb shell and node-mongodb-native to perform entirelly different. Mongoose calls it `create` while node-mongodb-native and mongodb shell call it `insert`.
0. Update method doesn't run hooks, validation.
0. `save` method not implemented with mongoose unless using the new doc() syntax. So `find`, `create`, all use one syntax, but `save` uses an entirely different syntax.
0. Each document in mongoose is an instance of the Schema. That just doesn't make sense to me. The fields on my Document should only be the fields I add, nothing more, nothing less.

# Getting Started
Mongolayer has three basic constructs, **Models**, **Connections** and **Documents**.

* `mongolayer.Connection` - Manage the connection pool and the raw connection to MongoDB. The connection is aware of all of the Models that are attached to it.
* `mongolayer.Model` - The bread-and-butter of mongolayer, your queries are executed on Models and they have fields, methods, and a ton of other features. These are attached to Connections.
* `mongolayer.Document` - After running a query, each row from the database is converted into a Document.

Basic application boot-up

0. Create connection.
0. Create models.
0. Attach models to connection.
0. Run queries, and return documents.

```js
var mongolayer = require("mongolayer");

// create a model
var postModel = new mongolayer.Model({
	collection : "posts",
	fields : [
		{ name : "title", validation : { type : "string" }, required : true },
		{ name : "description", validation : { type : "string" }, required : true }
	]
});

// get a mongolayer connection
mongolayer.connect({ connectionString : "mongodb://127.0.0.1:27017/mongoLayer" }, function(err, conn) {
	// attach a model to a connection
	conn.add({ model : postModel }, function(err) {
		// once a model is attached to a connection, assuming no errors, you can then run queries on the model
		
		// you can run queries by using the model reference
		postModel.find({}, function(err, docs) {
			// do something
		});
		
		// you can run queries by using the connection reference
		conn.models.posts.find({}, function(err, docs) {
			// do something
		});
		
		// whether you pass around the model references or the connection is totally up to your application architecture!
	});
});
```

# API Documentation

## mongolayer

### mongolayer.connect(options, callback)

Connect to a mongolayer database, returns Error and an instance of `mongolayer.Connection`.

* `options`
	* `connectionString` - `string`- `required` - Connection string formatted like `node-mongodb-native` uses. Example: `mongodb://127.0.0.1/mongolayer"`
	* `options` - `object` - `optional` - Connection options used by `node-mongodb-native`. Example: `{ server : { poolSize : 10 } }`
	* `auth` - `object` - `optional` - Object with `username` and `password` key to use when authenticating. Example: `{ username : "foo", password : "bar" }`
* `callback`
	* `Error` or null
	* `mongolayer.Connection`

Example:

```js
mongolayer.connect({ connectionString : "mongodb://127.0.0.1/mongolayer" }, function(err, conn) {
	
});
```

### mongolayer.connectCached(options, cb)

Connect to a mongolayer database. Same argument signature as `mongolayer.connect`. This is primarily used in unit-testing environments. If a call to `mongolayer.connectCached` is made with the same arguments as a previous call, it will re-use the underlying `node-mongodb-native` connection but still give you a clean `Connection` instance.

This is the recommended method for connecting through `mongolayer` especially if you connect in unit tests.

Example:

```js
mongolayer.connectCached({ connectionString : "mongodb://127.0.0.1/mongolayer" }, function(err, conn) {
	
});
```

### mongolayer.toPlain(data)

Converts an instance of a `Document` into a simple JS object without virtuals or methods.

* `data` - `mongolayer.Document` - `required` - Can be a single `Document` or an array of `Document`.

Example:

```js
model.find({}, function(err, docs) {
	var simple = mongolayer.toPlain(docs);
});
```

## Connection

### constructor

It is **not** recommended you initialize your own `mongolayer.Connection` manually, instead use `mongolayer.connect` or `mongolayer.connectCached`. 

### connection.add(args, callback)

Adds a model to a connection, and checks to ensure it has any declared indexes.

* `args`
	* `model` - `mongolayer.Model` - `required` - A mongolayer Model to add to the connection.
* `callback`
	* `Error` or null

Example:

```js
var model = new mongolayer.Model({ collection : "foo" });
conn.add({ model : model }, function(err) {
	
});
```

### connection.remove(args, cb)

Removes a Model from a Connection

* `args`
	* `model` - `mongolayer.Model` - `required` - A mongolayer Model to be removed
* `callback`
	* `Error` or null
	
### connection.removeAll(cb)

Removes all **Models** from a **Connection**. Sometimes used in unit testing if you want to wipe a connection between each test iteration. Can also use `mongolayer.connectCached` to accomplish the same task.

* `callback`
	* `Error` or null
	
### connection.dropCollection(args, cb)

* `args`
	* `name` - `string` - `required` - The name of the collection to remove
* `callback`
	* `Error` or null
	
## Model

### constructor - new mongolayer.Model(args);

Creates an instance of a `mongolayer.Model`.

* `args`
	* `collection` - `string` - `required` - The name of the collection
	* `fields` - `array` - `optional` - Array of fields to add to the Model. See model.addField for syntax.
	* `virtuals` - `array` - `optional` - Array of virtuals to be added to Documents returned from queries. See model.addVirtual for syntax.
	* `relationships` - `array` - `optional` - Array of relationships. See model.addRelationship for syntax.

### model.addField(args)

Adds a field to a model. This is the basic schema that each document in the collection will have.

* `name` - `string` - `required` - Name of the field.
* `validation` - `object` - `required` - Validation schema for the key, using `jsvalidator` syntax.
* `default` - `any` - `optional` - Default value for the field. Can be a function who's return will be the value.
* `required` - `boolean` - `optional` - Whether the field is required before putting into the database.
* `persist` - `boolean` - `optional` - `default true`. If false, then the value of the field is not persisted into the database.

Example:

```js
// add simple string field
model.addField({ name : "foo", validation : { type : "string" } });

// add date field with default filled at runtime
model.addField({ name : "created", validation : { type : "date" }, default : function() { return new Date() } });

// add non-persistent field not-saved to the database but sometimes used to store data during runtime.
model.addField({ name : "_cached", persist : false });
```

### model.addVirtual(args)

Adds a virtual to a model. These are attached with `Object.defineProperty` to each Document that is returned by queries. You can use them for getters, and/or setters.

* `name` - `string` - `required` - Name of the key to access the virtual
* `get` - `function` - `optional` - Function executed when the key is accessed.
* `set` - `function` - `optional` - Function executed when the key is set.
* `enumerable` - `boolean` - `optional` - `default true` - Whether the key is exposed as enumerable with code such as `for in` loops.

Example:

```js
// add a getter to convert a mongolayer ObjectId to a simple string and a setter to convert a string to a mongolayer.ObjectId
// this is used so that in MongoDB you are storing the actual ObjectId, but in your code you can pass strings (which may make things easier)
// this assumes the model has a field called 'user_id' which holds a `mongolayer.ObjectId`
model.addVirtual({
	name : "user_id_string",
	get : function() {
		return this.user_id.toString()
	},
	set : function(val) {
		this.user_id = new mongolayer.ObjectId(val);
	}
});

// add a virtual to convert \r\n in strings into <br/> tags
// this assumes the Model has a field called 'description' which holds a `string`
model.addVirtual({
	name : "description_formatted",
	get : function() {
		return this.description.replace(/(?:\r\n|\r|\n)/g, "<br/>");
	},
	enumerable : false
});

var doc = new mongolayer.Document({ description : "foo\r\nbar" });
console.log(doc.description_formatted);
// "foo<br/>bar"
```

**Note:** you cannot query against fields declared as virtuals, you can only query against fields actually stored in the database.

### model.addRelationship(args)

Adds a relationship to a model. This automatically creates an afterFind hook for you which will populate related records.

* `args`
	* `name` - `string` - `required` - The name of key where the related record will be populated. That id/ids for the related records will be stored in `[name]_id`
	* `type` - `string` - `required` - Possible values are 'single' and 'multiple'. 
	
TODO FINISH

### model.addHook(args)

TODO

### model.addDocumentMethod()

TODO

### model.addModelMethod()

TODO

### model.addIndex()

TODO

## Querying

### model.find()

TODO

### model.insert()

TODO

### model.remove()

TODO

### model.findById

TODO

### model properties

## Hooks

TODO