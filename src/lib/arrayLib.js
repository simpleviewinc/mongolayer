// umd boilerplate for CommonJS and AMD
if (typeof exports === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var arrayLib;
	
	var _getValue = function(myVar, propPath) {
		var temp = myVar;
		for(var i = 0; i < propPath.length; i++) {
			temp = temp[propPath[i]];
		}
		
		return temp;
	}
	
	// magic function to lookup values in objects and arrays, see unit test for examples
	var _getValues = function(val, path) {
		var tempPath = path.slice(0);
		var tempVal = val[tempPath.shift()];
		
		if (tempVal === undefined) {
			return tempVal;
		}
		
		if (tempPath.length === 0) {
			return tempVal;
		}
		
		if (tempVal instanceof Array === false) {
			return _getValues(tempVal, tempPath);
		}
		
		var temp = [];
		tempVal.forEach(function(val, i) {
			if (typeof val === "object" && Object.getPrototypeOf(val) === Object.prototype) {
				temp.push(_getValues(val, tempPath));
			} else {
				temp.push(val);
			}
		});
		
		return temp;
	}

	var index = function(arr, key, multiple) {
		multiple = multiple === undefined ? false : multiple;
		
		var indexed = {};
		
		var keyPath = key instanceof Array ? key : [key];
		
		for(var i = 0; i < arr.length; i++) {
			var val = arr[i];
			var tempKey = _getValue(val, keyPath);
			
			if (multiple) {
				if (indexed[tempKey] === undefined) {
					indexed[tempKey] = [];
				}
				
				indexed[tempKey].push(val);
			} else {
				indexed[tempKey] = val;
			}
		}
		
		return indexed;
	}

	var unique = function(arr) {
		var results = [];
		
		for(var i = 0; i < arr.length; i++) {
			var val = arr[i];
			if (results.indexOf(val) === -1) {
				results.push(val);
			}
		}
		
		return results;
	}
	
	var duplicates = function(arr) {
		var results = [];
		var temp = [];
		
		arr.forEach(function(val) {
			if (temp.indexOf(val) !== -1 && results.indexOf(val) === -1) {
				results.push(val);
			}
			
			temp.push(val);
		});
		
		return results;
	}

	/**
	 * This function performs a single or multi-column sort on an array. 
	 * There are two different functional call signatures depending on 
	 * whether the desired sort is a single or multi-column sort.
	 *
	 * For a single-column sort, the prop value can be an array of nested 
	 * key values to lookup, or a string value for the object key to sort on.
	 *
	 * ####Example - Single-column sort:
	 *
	 *		arrayLib.sortBy(array, ["node", "val"], "alpha", "asc")
	 *
	 * ####Example - Multi-column sort:
	 *
	 *		arrayLib.sortBy(array, [[["node", "val"], "alpha", "desc"], ["val", "numeric", "asc"]])
	 *
	 */
	var sortBy = function(arr, prop, type, dir) {
		if (arr.length <= 1) { return arr; } // if the array is length 0 or 1 bail early
		
		var isSingle = prop instanceof Array && prop[0] instanceof Array ? false : true;
		var sortOps;
		if (isSingle === true) {
			sortOps = [{ prop : prop, type : type, dir : dir }];
		} else {
			// if multiple the arguments come in on prop so we need to unfold to an object
			sortOps = new Array(prop.length);
			for(var i = 0; i < prop.length; i++) {
				sortOps[i] = { prop : prop[i][0], type : prop[i][1], dir : prop[i][2] };
			}
		}
		
		// our prop should always be an array for lookup purposes
		for(var i = 0; i < sortOps.length; i++) {
			var op = sortOps[i];
			if (op.prop instanceof Array === false) { op.prop = [op.prop]; }
		}
		
		// go through the array and extract the values from it so that way we don't have to do a look-up on each comparison
		var temp = new Array(arr.length);
		for(var i = 0; i < arr.length; i++) {
			var item = arr[i];
			var result = { values : new Array(sortOps.length), index : i, sortOps : sortOps };
			for(var j = 0; j < sortOps.length; j++) {
				var op = sortOps[j];
				
				var value = item;
				for(var k = 0; k < op.prop.length; k++) {
					value = value[op.prop[k]];
					if (value === undefined) { break; }
				}
				
				result.values[j] = {
					raw : value, // original value needed in some comparisons
					clean : op.type === "alpha" && value !== undefined ? value.toLowerCase() : value
				}
			}
			
			temp[i] = result;
		}
		
		temp.sort(propCompare);
		
		// after the sort is completed, recompose our data array based on the indexes from our mapped array
		var done = new Array(temp.length);
		for(var i = 0; i < temp.length; i++) {
			done[i] = arr[temp[i].index];
		}
		return done;
	}
	
	var propCompare = function(a, b) {
		for(var i = 0; i < a.sortOps.length; i++) {
			var op = a.sortOps[i];
			var aVal = a.values[i].clean;
			var aValRaw = a.values[i].raw;
			var bVal = b.values[i].clean;
			var bValRaw = b.values[i].raw;
			var comp;
			
			if (aVal === undefined && bVal !== undefined) {
				comp = 1; // in an ascending sort undefined sorts to last, so if aVal is undefined bVal is smaller
			} else if (aVal !== undefined && bVal === undefined) {
				comp = -1; // in an ascending sort undefined sorts to last, so if bVal is undefined aVal is smaller
			} else if (aVal === undefined && bVal === undefined) {
				comp = 0; // both undefined, consider them equal
			} else if (op.type === "alpha") {
				// in alpha compare we want to compare without case first (all lower), and then with case, this way A goes before a and both go before B
				comp = aVal > bVal ? 1 : aVal < bVal ? -1 : aValRaw > bValRaw ? 1 : aValRaw < bValRaw ? -1 : 0;
			} else if (op.type === "numeric") {
				comp = aVal - bVal;
			} else if (op.type === "natural") {
				comp = naturalCompare(aVal, bVal);
			}
			
			if (comp !== 0) {
				comp *= op.dir === "asc" ? 1 : -1; // with a descending query we reverse the polarity
				return comp;
			}
		}
		
		return 0;
	}
	
	/**
	 * This function performs a "natural sort" comparison of two items. This 
	 * algorithm is taken from Jim Palmer's natural sort algorith on his site:
	 * http://www.overset.com/2008/09/01/javascript-natural-sort-algorithm-with-unicode-support/
	 */
	function naturalCompare (a, b) {
		var re = /(^-?[0-9]+(\.?[0-9]*)[df]?e?[0-9]?$|^0x[0-9a-f]+$|[0-9]+)/gi,
			sre = /(^[ ]*|[ ]*$)/g,
			dre = /(^([\w ]+,?[\w ]+)?[\w ]+,?[\w ]+\d+:\d+(:\d+)?[\w ]?|^\d{1,4}[\/\-]\d{1,4}[\/\-]\d{1,4}|^\w+, \w+ \d+, \d{4})/,
			hre = /^0x[0-9a-f]+$/i,
			ore = /^0/,
			i = function(s) { return naturalCompare.insensitive && (''+s).toLowerCase() || ''+s },
			// convert all to strings strip whitespace
			x = i(a).replace(sre, '') || '',
			y = i(b).replace(sre, '') || '',
			// chunk/tokenize
			xN = x.replace(re, '\0$1\0').replace(/\0$/,'').replace(/^\0/,'').split('\0'),
			yN = y.replace(re, '\0$1\0').replace(/\0$/,'').replace(/^\0/,'').split('\0'),
			// numeric, hex or date detection
			xD = parseInt(x.match(hre)) || (xN.length != 1 && x.match(dre) && Date.parse(x)),
			yD = parseInt(y.match(hre)) || xD && y.match(dre) && Date.parse(y) || null,
			oFxNcL, oFyNcL;
		// first try and sort Hex codes or Dates
		if (yD)
			if ( xD < yD ) return -1;
			else if ( xD > yD ) return 1;
		// natural sorting through split numeric strings and default strings
		for(var cLoc=0, numS=Math.max(xN.length, yN.length); cLoc < numS; cLoc++) {
			// find floats not starting with '0', string or 0 if not defined (Clint Priest)
			oFxNcL = !(xN[cLoc] || '').match(ore) && parseFloat(xN[cLoc]) || xN[cLoc] || 0;
			oFyNcL = !(yN[cLoc] || '').match(ore) && parseFloat(yN[cLoc]) || yN[cLoc] || 0;
			// handle numeric vs string comparison - number < string - (Kyle Adams)
			if (isNaN(oFxNcL) !== isNaN(oFyNcL)) { return (isNaN(oFxNcL)) ? 1 : -1; }
			// rely on string comparison if different types - i.e. '02' < 2 != '02' < '2'
			else if (typeof oFxNcL !== typeof oFyNcL) {
				oFxNcL += '';
				oFyNcL += '';
			}
			if (oFxNcL < oFyNcL) return -1;
			if (oFxNcL > oFyNcL) return 1;
		}
		return 0;
	}

	var sortByArray = function(arr, key, arrOrder) {
		var tempIndex = index(arr, key, true);
		
		var data = [];
		
		arrOrder.forEach(function(val, i) {
			if (tempIndex[val] !== undefined) {
				data.push.apply(data, tempIndex[val]);
			}
		});
		
		return data;
	}

	// "inside-out" version of Fisher and Yates' algorithm from wikipedia
	var randomize = function(arr) {
		var items = [];
		
		arr.forEach(function(val, i) {
			var index = Math.floor(Math.random() * (items.length + 1));
			if (index === items.length) {
				items.push(val);
			} else {
				items.push(items[index]);
				items[index] = val;
			}
		});
		
		return items;
	}
	
	var leftJoin = function(args) {
		// args.leftKey
		// args.rightKey
		// args.mergeKey
		// args.leftArray
		// args.rightArray
		
		var index = arrayLib.index(args.rightArray, args.rightKey);
		
		args.leftArray.forEach(function(val, i) {
			var chain = args.leftKey instanceof Array ? args.leftKey : [args.leftKey];
			var value = _getValues(val, chain);
			
			if (value instanceof Array) {
				var newArray = [];
				
				value.forEach(function(val, i) {
					if (index[val] !== undefined) {
						newArray.push(index[val]);
					}
				});
				
				val[args.mergeKey] = newArray;
			} else if (value !== undefined && index[value] !== undefined) {
				val[args.mergeKey] = index[value];
			}
		});
		
		return args.leftArray;
	}
	
	module.exports = arrayLib = {
		duplicates : duplicates,
		index : index,
		unique : unique,
		sortBy : sortBy,
		sortByArray : sortByArray,
		randomize : randomize,
		leftJoin : leftJoin,
		_getValue : _getValue,
		_getValues : _getValues
	}
});