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

var sortBy = function(arr, prop, type, dir) {
	var temp = [].slice.call(arr);
	
	if (dir !== "asc" && dir !== "desc") {
		throw new Error("arrayLib#sortBy(): Direction must be 'asc' or 'desc'");
	}
	
	if (type !== "alpha" && type !== "numeric") {
		throw new Error("arrayLib#sortBy(): Type must be 'alpha' or 'numeric'");
	}
	
	var propPath = prop instanceof Array ? prop : [prop];
	
	if (type === "alpha") {
		if (dir === "asc") {
			var factors = [1,-1];
		} else if (dir === "desc") {
			var factors = [-1,1];
		}
		
		temp.sort(function(a, b) {
			var aVal = _getValue(a, propPath);
			var bVal = _getValue(b, propPath);
			
			if (dir === "asc") {
				var lccomp = aVal.toLowerCase().localeCompare(bVal.toLowerCase());
			} else if (dir === "desc") {
				var lccomp = bVal.toLowerCase().localeCompare(aVal.toLowerCase());
			}
			
			return lccomp ? lccomp : aVal > bVal ? factors[0] : aVal < bVal ? factors[1] : 0;
		});
	} else if (type === "numeric") {
		var factors = dir === "asc" ? 1 : -1;
		
		temp.sort(function(a, b) {
			var aVal = _getValue(a, propPath);
			var bVal = _getValue(b, propPath);
			
			return (aVal - bVal) * factors;
		});
	}
	
	return temp;
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

module.exports = {
	index : index,
	unique : unique,
	sortBy : sortBy,
	sortByArray : sortByArray,
	randomize : randomize,
	_getValue : _getValue
}