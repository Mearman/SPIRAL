// SPIRAL Map Domain
// Map/record operators for key-value data manipulation

import { ErrorCodes } from "../errors.js";
import type { Value } from "../types.js";
import {
	boolType,
	boolVal,
	errorVal,
	intType,
	intVal,
	isError,
	listVal,
	mapType,
	mapVal,
	stringType,
	stringVal,
} from "../types.js";
import {
	defineOperator,
	Operator,
	OperatorRegistry,
	registerOperator,
} from "./registry.js";

//==============================================================================
// Map Operators
//==============================================================================

// get(map, string) -> value
// Retrieve a value by string key. Errors if key is missing.
const get: Operator = defineOperator("map", "get")
	.setParams(mapType(stringType, intType), stringType)
	.setReturns(intType)
	.setPure(true)
	.setImpl((m, k) => {
		if (isError(m)) return m;
		if (isError(k)) return k;
		if (m.kind !== "map") return errorVal(ErrorCodes.TypeError, "Expected map value");
		if (k.kind !== "string") return errorVal(ErrorCodes.TypeError, "Expected string key");
		const hash = "s:" + k.value;
		const result = m.value.get(hash);
		if (result === undefined) return errorVal(ErrorCodes.DomainError, "Key not found: " + k.value);
		return result;
	})
	.build();

// set(map, string, value) -> map
// Return a new map with the key set to the given value.
const set: Operator = defineOperator("map", "set")
	.setParams(mapType(stringType, intType), stringType, intType)
	.setReturns(mapType(stringType, intType))
	.setPure(true)
	.setImpl((m, k, v) => {
		if (isError(m)) return m;
		if (isError(k)) return k;
		if (isError(v)) return v;
		if (m.kind !== "map") return errorVal(ErrorCodes.TypeError, "Expected map value");
		if (k.kind !== "string") return errorVal(ErrorCodes.TypeError, "Expected string key");
		const hash = "s:" + k.value;
		const newMap = new Map(m.value);
		newMap.set(hash, v);
		return mapVal(newMap);
	})
	.build();

// has(map, string) -> bool
// Check if a key exists in the map.
const has: Operator = defineOperator("map", "has")
	.setParams(mapType(stringType, intType), stringType)
	.setReturns(boolType)
	.setPure(true)
	.setImpl((m, k) => {
		if (isError(m)) return m;
		if (isError(k)) return k;
		if (m.kind !== "map") return errorVal(ErrorCodes.TypeError, "Expected map value");
		if (k.kind !== "string") return errorVal(ErrorCodes.TypeError, "Expected string key");
		const hash = "s:" + k.value;
		return boolVal(m.value.has(hash));
	})
	.build();

// keys(map) -> list<string>
// Get all keys as a list of strings.
const keys: Operator = defineOperator("map", "keys")
	.setParams(mapType(stringType, intType))
	.setReturns(intType) // placeholder, actually list<string>
	.setPure(true)
	.setImpl((m) => {
		if (isError(m)) return m;
		if (m.kind !== "map") return errorVal(ErrorCodes.TypeError, "Expected map value");
		const keyList: Value[] = [];
		for (const hash of m.value.keys()) {
			// Keys are stored as "s:actualKey" - strip the prefix
			if (hash.startsWith("s:")) {
				keyList.push(stringVal(hash.slice(2)));
			}
		}
		return listVal(keyList);
	})
	.build();

// values(map) -> list<value>
// Get all values as a list.
const values: Operator = defineOperator("map", "values")
	.setParams(mapType(stringType, intType))
	.setReturns(intType) // placeholder, actually list<value>
	.setPure(true)
	.setImpl((m) => {
		if (isError(m)) return m;
		if (m.kind !== "map") return errorVal(ErrorCodes.TypeError, "Expected map value");
		return listVal([...m.value.values()]);
	})
	.build();

// size(map) -> int
// Get the number of entries in the map.
const size: Operator = defineOperator("map", "size")
	.setParams(mapType(stringType, intType))
	.setReturns(intType)
	.setPure(true)
	.setImpl((m) => {
		if (isError(m)) return m;
		if (m.kind !== "map") return errorVal(ErrorCodes.TypeError, "Expected map value");
		return intVal(m.value.size);
	})
	.build();

// remove(map, string) -> map
// Return a new map without the given key.
const remove: Operator = defineOperator("map", "remove")
	.setParams(mapType(stringType, intType), stringType)
	.setReturns(mapType(stringType, intType))
	.setPure(true)
	.setImpl((m, k) => {
		if (isError(m)) return m;
		if (isError(k)) return k;
		if (m.kind !== "map") return errorVal(ErrorCodes.TypeError, "Expected map value");
		if (k.kind !== "string") return errorVal(ErrorCodes.TypeError, "Expected string key");
		const hash = "s:" + k.value;
		const newMap = new Map(m.value);
		newMap.delete(hash);
		return mapVal(newMap);
	})
	.build();

// merge(map, map) -> map
// Merge two maps. Right map values take precedence on key conflicts.
const merge: Operator = defineOperator("map", "merge")
	.setParams(mapType(stringType, intType), mapType(stringType, intType))
	.setReturns(mapType(stringType, intType))
	.setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		if (a.kind !== "map" || b.kind !== "map") {
			return errorVal(ErrorCodes.TypeError, "Expected map values");
		}
		const merged = new Map(a.value);
		for (const [key, val] of b.value) {
			merged.set(key, val);
		}
		return mapVal(merged);
	})
	.build();

//==============================================================================
// Registry Creation
//==============================================================================

/**
 * Create the map domain registry with all map operators.
 */
export function createMapRegistry(): OperatorRegistry {
	let registry: OperatorRegistry = new Map();

	registry = registerOperator(registry, get);
	registry = registerOperator(registry, set);
	registry = registerOperator(registry, has);
	registry = registerOperator(registry, keys);
	registry = registerOperator(registry, values);
	registry = registerOperator(registry, size);
	registry = registerOperator(registry, remove);
	registry = registerOperator(registry, merge);

	return registry;
}
