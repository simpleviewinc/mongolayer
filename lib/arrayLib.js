// umd boilerplate for CommonJS and AMD
if (typeof exports === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _getValue = function(myVar, propPath) {
		var temp = myVar;
		propPath.forEach(function(val, i) {
			temp = temp[val];
		});
		
		return temp;
	}

	var index = function(arr, key, multiple) {
		multiple = multiple === undefined ? false : multiple;
		
		var indexed = {};
		
		var keyPath = key instanceof Array ? key : [key];
		
		arr.forEach(function(val, i) {
			var tempKey = _getValue(val, keyPath);
			
			if (multiple) {
				if (indexed[tempKey] === undefined) {
					indexed[tempKey] = [];
				}
				
				indexed[tempKey].push(val);
			} else {
				indexed[tempKey] = val;
			}
		});
		
		return indexed;
	}

	var unique = function(arr) {
		var results = [];
		
		arr.forEach(function(val, i) {
			if (results.indexOf(val) === -1) {
				results.push(val);
			}
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
		var temp = [].slice.call(arr);
		var columns = null;

		// Are we attempting a multi-column sort?
		if (prop instanceof Array && prop.length >= 1 && prop[0] instanceof Array) {

			prop.forEach(function(sortColumns) {
				if (sortColumns.length !== 3) {
					throw new Error("arrayLib#sortBy(): Sort columns must be in the format ['prop', sortDir, sortOrder]");
				}
			});

			columns = prop
		} else {

			// Single column sort
			if (dir !== "asc" && dir !== "desc") {
				throw new Error("arrayLib#sortBy(): Direction must be 'asc' or 'desc'");
			}
			
			if (type !== "alpha" && type !== "numeric" && type !== "natural") {
				throw new Error("arrayLib#sortBy(): Type must be 'alpha', 'numeric', 'natural'");
			}

			columns = [[prop, type, dir]];
		}

		temp.sort(function(a, b) {
			return multiPropertyObjectCompare(a, b, columns);
		});

		return temp;
	}

	/**
	 * Given two objects, perform a comparison on them using the desired
	 * type - numeric, alphabetic or natural. This method supports sorting on
	 * nested object elements.
	 *
	 * @param {Object} an object to compare
	 * @param {Object} an object to compare
	 * @param {Array} an array of sort properties
	 *
	 * ####Example:
	 *
	 *		arrayLib.multiPropertyObjectCompare(
	 *					obj1, obj2, [[["node", "val"], "alpha", "asc"], ["val", "alpha", "asc"]])
	 */
	var multiPropertyObjectCompare = function(obj1, obj2, compareColumnsArray) {
		var aVal;
		var bVal;
		var column;
		var columnIndex = 0;
		var compare = 0;
		var factor;
		var type;
		var prop;
		var propPath;

		// Compare the first properties of the sort columns on each object,
		// if they are equal, go to the next column to determine the ordering.
		 while ((columnIndex < compareColumnsArray.length) && (compare === 0)) {

			column = compareColumnsArray[columnIndex];
			prop = column[0]; // Property path
			type = column[1]; // sort type (alpha, numeric, natural)
			dir = column[2];  // type (asc or desc)
			factor = (dir === "asc") ? 1 : -1;

			propPath = prop instanceof Array ? prop : [prop];
			aVal = _getValue(obj1, propPath);
			bVal = _getValue(obj2, propPath);

			if (type === "alpha") {
				compare = alphaCompare(aVal, bVal);
			} else if (type === "numeric") { // numeric
				compare = (aVal - bVal);
			} else if (type === "natural") {
				compare = naturalCompare(aVal, bVal);
			}

			compare *= factor;
			columnIndex++;
		}

		return compare;
	}

	/**
	 * This function compares two string values ignoring the case.
	 */
	var alphaCompare = function(a, b) {
		var compare = a.toLowerCase().localeCompare(b.toLowerCase());
		return compare ? compare : (a > b ? 1 : (a < b ? -1 : 0));
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
		var tempIndex = index(arr, key);
		
		var data = [];
		
		arrOrder.forEach(function(val, i) {
			if (tempIndex[val] !== undefined) {
				data.push(tempIndex[val]);
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
			if (val[args.leftKey] instanceof Array) {
				var newArray = [];
				
				val[args.leftKey].forEach(function(val, i) {
					if (index[val] !== undefined) {
						newArray.push(index[val]);
					}
				});
				
				val[args.mergeKey] = newArray;
			} else if (val[args.leftKey] !== undefined && index[val[args.leftKey]] !== undefined) {
				val[args.mergeKey] = index[val[args.leftKey]];
			}
		});
		
		return args.leftArray;
	}
	
	module.exports = arrayLib = {
		index : index,
		unique : unique,
		sortBy : sortBy,
		sortByArray : sortByArray,
		randomize : randomize,
		leftJoin : leftJoin,
		multiPropertyObjectCompare : multiPropertyObjectCompare,
		_getValue : _getValue
	}
});