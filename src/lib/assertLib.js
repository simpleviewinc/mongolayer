// umd boilerplate for CommonJS and AMD
if (typeof exports === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var assert = require("assert");
	var cheerio = require("cheerio");
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
		var simpleKeys = ["boolean", "number", "undefined"];
		var schemaKeys = ["type", "data", "class", "calls", "allowExtraKeys"];
		
		var isDate = schema instanceof Date;
		var isArray = schema instanceof Array;
		var isNull = schema === null;
		var isFunction = schemaType === "function";
		var isObject = isDate === false && isArray === false && isNull === false && schemaType === "object";
		var isSimpleKey = simpleKeys.indexOf(schemaType) > -1;
		var isString = schemaType === "string";
		// it's a schema object if all keys are in schemaKeys and it has a 'type' key, otherwise it's a shorthand object
		var isSchemaObject = isObject && Object.keys(schema).filter(val => schemaKeys.indexOf(val) === -1).length === 0 && schema.type !== undefined;
		var isShortHandObject = isObject && isSchemaObject === false;
		var isShorthand = isSimpleKey || isString || isDate || isNull || isArray || isFunction || isShortHandObject;
		
		var schemaItem = isShorthand ? { type : isFunction ? "function" : isDate ? "date" : isObject ? "object" : isArray ? "array" : isNull ? "null" : schemaType, data : schema } : schema;
		
		// if the schema object includes _deepCheck_allowExtraKeys we valid the current object with that assumption in place, prevents unneeded nesting
		if (isShorthand && isObject && schemaItem.data._deepCheck_allowExtraKeys !== undefined) {
			schemaItem.allowExtraKeys = schemaItem.data._deepCheck_allowExtraKeys;
		}
		
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
		} else if (schemaItem.type === "string") {
			assert.strictEqual(typeof data, schemaItem.type, "data at " + chain.join(".") + " was not a " + schemaItem.type + ", but it should be");
			
			if (schemaItem.data !== undefined) {
				var checks = schemaItem.data instanceof Array ? schemaItem.data : [schemaItem.data];
				checks.forEach(function(check) {
					if (check instanceof RegExp) {
						assert.ok(data.match(check), "data '" + data + "' did not contain '" + check + "' at " + chain.join("."));
					} else {
						assert.strictEqual(data, check, "data '" + data + "' did not equal '" + check + "' at " + chain.join("."));
					}
				});
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
					if (key === "_deepCheck_allowExtraKeys") { return; }
					
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
	
	var assertHtml = function(html, checks) {
		if (typeof html === "string") {
			var dom = cheerio.load(html).root();
		} else {
			var dom = html;
		}
		
		checks.forEach(function(val, i) {
			_assertHtml_checkNode(dom, val);
		});
		
		return true;
	}
	
	var _assertHtml_checkNode = function(parentNode, args) {
		validator.validate(args, {
			type : "object",
			schema : [
				{ name : "selector", type : "string", required : true },
				{ name : "count", type : "number" },
				{ name : "childCount", type : "number" },
				{ name : "html", type : "string" },
				{ name : "text", type : "string" },
				{ name : "textRegex", type : "regex" },
				{ name : "eq", type : "number" },
				{ name : "attrs", type : "indexObject" },
				{ name : "css", type : "indexObject" },
				{ name : "checks", type : "object" }
			],
			allowExtraKeys : false,
			throwOnInvalid : true
		});
		
		var nodes = parentNode.find(args.selector);
		var node = args.eq !== undefined ? nodes.eq(args.eq) : nodes;
		
		if (args.count !== undefined) {
			assert.strictEqual(node.length, args.count, `Count mismatch for selector '${args.selector}'. ${node.length} !== ${args.count}`);
		}
		
		if (args.html !== undefined) {
			var cleanHtml = node.html().replace(/\s+/g, " ").trim();
			assert.strictEqual(cleanHtml, args.html, `Html mismatch for selector '${args.selector}'. '${cleanHtml}' !== '${args.html}'`);
		}

		if (args.text !== undefined) {
			var cleanText = node.text().replace(/\s+/g, " ").trim();
			assert.strictEqual(cleanText, args.text, `Text mismatch for selector '${args.selector}'. '${cleanText}' !== '${args.text}'`);
		}
		
		if (args.textRegex !== undefined) {
			var text = node.text();
			assert.ok(text.match(args.textRegex), `textRegex mismatch for selector '${args.selector}'. '${text}' did not contain '${args.textRegex}'`);
		}
		
		if (args.childCount !== undefined) {
			var len = node.children().length;
			assert.strictEqual(len, args.childCount, `childCount mismatch for selector '${args.selector}'. ${len} !== ${args.childCount}`);
		}
		
		if (args.attrs !== undefined) {
			for(var i in args.attrs) {
				var val = args.attrs[i];
				var attrValue = node.attr(i);
				var checks = val instanceof Array ? val : [val];
				checks.forEach(function(val) {
					if (val instanceof RegExp) {
						assert.ok(attrValue.match(val), `attrs mismatch for selector '${args.selector}' attr '${i}'. '${attrValue}' did not contain '${val}'`);
					} else {
						assert.strictEqual(attrValue, val, `attrs mismatch for selector '${args.selector}' attr '${i}'. '${attrValue}' !== '${val}'`);
					}
				});
			}
		}
		
		if (args.css !== undefined) {
			for(var i in args.css) {
				var val = args.css[i];
				var cssValue = node.css(i);
				assert.strictEqual(cssValue, val, `css mismatch for selector '${args.selector}' css '${i}'. '${cssValue}' !== '${val}'`);
			}
		}
		
		if (args.checks !== undefined) {
			args.checks.forEach(function(val) {
				_assertHtml_checkNode(node, val);
			});
		}
	}
	
	module.exports = {
		assertHtml : assertHtml,
		isDeepStrictEqual : isDeepStrictEqual,
		deepCheck : deepCheck,
		deepStrictEqual : deepStrictEqual,
		throws : throws,
		trimErr : trimErr,
		xor : xor
	}
});