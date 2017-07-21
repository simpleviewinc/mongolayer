// umd boilerplate for CommonJS and AMD
if (typeof exports === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var assert = require("assert");
	var validator = require("jsvalidator");
	
	var isDeepStrictEqual = function(a, b) {
		return JSON.stringify(a) === JSON.stringify(b);
	}
	
	var deepStrictEqual = function(a, b) {
		var temp = isDeepStrictEqual(a, b);
		if (temp === false) {
			throw new Error(JSON.stringify(a) + " !== " + JSON.stringify(b));
		}
	}

	var xor = function(a, b) {
		var temp = (a === true && b === false) || (a === false && b === true);
		if (temp === false ) {
			throw new Error(a + " === " + b);
		}
	}

	// ensure that a function throws, second arg can be string, regex or function
	var throws = function(fn, checker) {
		try {
			fn()
		} catch (e) {
			if (typeof checker === "string") {
				assert.strictEqual(e.message, checker, e.message + " !== " + checker);
			} else if (checker instanceof RegExp) {
				assert.ok(e.message.match(checker), "'" + e.message + "'.match(" + checker + ") === null");
			} else if (typeof checker === "function") {
				checker(e);
			}
			
			return;
		}
		
		throw new Error("Was supposed to throw but didn't");
	}
	
	// remove whitespace from err message and str allowing devs to cleanly format both for readability in test files
	var trimErr = function(err, str) {
		var cleanErr = function(str) {
			return str.replace(/\s+/g, " ").trim();
		}
		
		assert.strictEqual(cleanErr(err.message), cleanErr(str));
	}
	
	// check a deeply nested object based on specific rules
	// this is a more robust version of deepStrictEqual enforcing not only equality of valid, but also type of data for cases when strict equality doesn't work
	// such as when deeling with rich Objects and types like Date, mongolayer.Document, and functions (and their returns)
	var deepCheck = function(data, schema) {
		_deepCheck(data, schema, ["root"]);
	}
	
	// recursive call used by _deepCheck
	var _deepCheck = function(data, schema, chain, prevContext) {
		var schemaType = typeof schema;
		var simpleKeys = ["boolean", "string", "number", "undefined"];
		var schemaKeys = ["type", "data", "class", "calls", "allowExtraKeys"];
		
		var isDate = schema instanceof Date;
		var isArray = schema instanceof Array;
		var isNull = schema === null;
		var isFunction = schemaType === "function";
		var isObject = isDate === false && isArray === false && isNull === false && schemaType === "object";
		var isSimpleKey = simpleKeys.indexOf(schemaType) > -1;
		var isShortHandObject = isObject ? Object.keys(schema).filter(val => schemaKeys.indexOf(val) === -1).length > 0 || Object.keys(schema).length === 0 : false;
		var isShorthand = isSimpleKey || isDate || isNull || isArray || isFunction || isShortHandObject;
		
		var schemaItem = isShorthand ? { type : isFunction ? "function" : isDate ? "date" : isObject ? "object" : isArray ? "array" : isNull ? "null" : schemaType, data : schema } : schema;
		
		// ensure that the derived schemaItem matches expected validation keys
		var valid = validator.validate(schemaItem, {
			type : "object",
			schema : [
				{ name : "type", type : "string", enum : ["boolean", "string", "array", "number", "undefined", "function", "object", "date", "null"], required : true },
				{ name : "data", type : "any" },
				{ name : "class", type : "function" },
				{
					name : "calls",
					type : "array",
					schema : {
						type : "object",
						schema : [
							{ name : "args", type : "array", default : function() { return [] } },
							{ name : "result", type : "any" }
						],
						allowExtraKeys : false
					}
				},
				{ name : "allowExtraKeys", type : "boolean" }
			],
			throwOnInvalid : true,
			allowExtraKeys : false
		});
		
		if (simpleKeys.indexOf(schemaItem.type) > -1) {
			assert.strictEqual(typeof data, schemaItem.type, "data at " + chain.join(".") + " was not a " + schemaItem.type + ", but it should be");
			
			if (schemaItem.data !== undefined) {
				assert.strictEqual(data, schemaItem.data, "data '" + data + "' did not equal '" + schemaItem.data + "' at " + chain.join("."));
			}
		} else if (schemaItem.type === "object") {
			assert.strictEqual(typeof data, "object", "data at " + chain.join(".") + " was not an object, but it should be");
			
			if (schemaItem.class !== undefined) {
				assert.strictEqual(data instanceof schemaItem.class, true, "data at " + chain.join(".") + " was not instanceof the proper class");
			}
			
			if (schemaItem.allowExtraKeys === false) {
				var leftKeys = Object.keys(data);
				var rightKeys = Object.keys(schemaItem.data);
				
				leftKeys.forEach(val => assert.strictEqual(rightKeys.indexOf(val) > -1, true, "extra key '" + val + "' at " + chain.join(".")));
			}
			
			if (schemaItem.data !== undefined) {
				Object.keys(schemaItem.data).forEach(function(key, i) {
					var newChain = chain.slice(0);
					newChain.push(key);
					
					_deepCheck(data[key], schemaItem.data[key], newChain, data);
				});
			}
		} else if (schemaItem.type === "array") {
			assert.strictEqual(data instanceof Array, true, "data at " + chain.join(".") + " was not an array, but it should be");
			
			if (schemaItem.data !== undefined) {
				assert.strictEqual(data.length, schemaItem.data.length, "data at " + chain.join(".") + " was length " + data.length + ", should have been length " + schemaItem.data.length);
				schemaItem.data.forEach(function(val, i) {
					var newChain = chain.slice(0);
					newChain.push(i);
					
					_deepCheck(data[i], schemaItem.data[i], newChain);
				});
			}
		} else if (schemaItem.type === "date") {
			assert.strictEqual(data instanceof Date, true, "data at " + chain.join(".") + " was not of type date");
			
			if (schemaItem.data !== undefined) {
				var expected = schemaItem.data instanceof Date ? schemaItem.data.toISOString() : schemaItem.data;
				assert.strictEqual(data.toISOString(), expected, "date data '" + data.toISOString() + "' did not equal '" + expected + "' at " + chain.join("."));
			}
		} else if (schemaItem.type === "function") {
			assert.strictEqual(typeof data, "function", "data at " + chain.join(".") + " was not of type function");
			
			if (schemaItem.data !== undefined) {
				assert.strictEqual(data, schemaItem.data, "data at " + chain.join(".") + " was not the correct function reference");
			}
			
			if (schemaItem.calls !== undefined) {
				schemaItem.calls.forEach(function(val, i) {
					var fnReturn = data.apply(prevContext, val.args);
					
					// in the event the deepCheck fails on the returned content we need to catch it so we can output the position in the chain we are erroring
					try {
						deepCheck(fnReturn, val.result);
					} catch(err) {
						assert(false, "data '" + fnReturn + "' did not match '" + val.result + "' returned by the function at " + chain.join(".") + " on call index " + i);
					}
				});
			}
		} else if (schemaItem.type === "null") {
			assert.strictEqual(data, null, "data at " + chain.join(".") + " was not null, but it should be");
		}
	}
	
	module.exports = {
		isDeepStrictEqual : isDeepStrictEqual,
		deepCheck : deepCheck,
		deepStrictEqual : deepStrictEqual,
		throws : throws,
		trimErr : trimErr,
		xor : xor
	}
});