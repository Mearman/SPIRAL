// SPIRAL Map Domain - Unit Tests

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createMapRegistry } from "../src/domains/map.js";
import { lookupOperator } from "../src/domains/registry.js";
import {
	mapVal,
	intVal,
	stringVal,
	boolVal,
	listVal,
	errorVal,
} from "../src/types.js";
import type { Value } from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const registry = createMapRegistry();

function op(name: string) {
	const operator = lookupOperator(registry, "map", name);
	if (!operator) throw new Error(`Operator map:${name} not found`);
	return operator;
}

function makeMap(entries: [string, Value][]): Value {
	return mapVal(new Map(entries.map(([k, v]) => ["s:" + k, v])));
}

const emptyMap = mapVal(new Map());
const err = errorVal("TestError", "test");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("map domain", () => {
	// =======================================================================
	// get
	// =======================================================================
	describe("get", () => {
		it("returns value for existing key", () => {
			const m = makeMap([["x", intVal(42)]]);
			const result = op("get").fn(m, stringVal("x"));
			assert.deepEqual(result, intVal(42));
		});

		it("returns error for missing key", () => {
			const m = makeMap([["x", intVal(42)]]);
			const result = op("get").fn(m, stringVal("y"));
			assert.equal(result.kind, "error");
		});

		it("propagates error from map arg", () => {
			const result = op("get").fn(err, stringVal("x"));
			assert.equal(result.kind, "error");
		});

		it("returns error for non-map first arg", () => {
			const result = op("get").fn(intVal(1), stringVal("x"));
			assert.equal(result.kind, "error");
		});
	});

	// =======================================================================
	// set
	// =======================================================================
	describe("set", () => {
		it("adds new key-value pair", () => {
			const m = makeMap([["x", intVal(1)]]);
			const result = op("set").fn(m, stringVal("y"), intVal(2));
			assert.equal(result.kind, "map");
			if (result.kind === "map") {
				assert.equal(result.value.size, 2);
				assert.deepEqual(result.value.get("s:y"), intVal(2));
			}
		});

		it("overwrites existing key", () => {
			const m = makeMap([["x", intVal(1)]]);
			const result = op("set").fn(m, stringVal("x"), intVal(99));
			assert.equal(result.kind, "map");
			if (result.kind === "map") {
				assert.equal(result.value.size, 1);
				assert.deepEqual(result.value.get("s:x"), intVal(99));
			}
		});
	});

	// =======================================================================
	// has
	// =======================================================================
	describe("has", () => {
		it("returns true for existing key", () => {
			const m = makeMap([["x", intVal(1)]]);
			assert.deepEqual(op("has").fn(m, stringVal("x")), boolVal(true));
		});

		it("returns false for missing key", () => {
			const m = makeMap([["x", intVal(1)]]);
			assert.deepEqual(op("has").fn(m, stringVal("y")), boolVal(false));
		});
	});

	// =======================================================================
	// keys
	// =======================================================================
	describe("keys", () => {
		it("returns list of string keys", () => {
			const m = makeMap([["a", intVal(1)], ["b", intVal(2)]]);
			const result = op("keys").fn(m);
			assert.equal(result.kind, "list");
			if (result.kind === "list") {
				const strs = result.value.map(v => v.kind === "string" ? v.value : "?");
				assert.deepEqual(strs.sort(), ["a", "b"]);
			}
		});

		it("returns empty list for empty map", () => {
			const result = op("keys").fn(emptyMap);
			assert.deepEqual(result, listVal([]));
		});
	});

	// =======================================================================
	// values
	// =======================================================================
	describe("values", () => {
		it("returns list of values", () => {
			const m = makeMap([["a", intVal(1)], ["b", intVal(2)]]);
			const result = op("values").fn(m);
			assert.equal(result.kind, "list");
			if (result.kind === "list") {
				assert.equal(result.value.length, 2);
			}
		});
	});

	// =======================================================================
	// size
	// =======================================================================
	describe("size", () => {
		it("returns 0 for empty map", () => {
			assert.deepEqual(op("size").fn(emptyMap), intVal(0));
		});

		it("returns correct count", () => {
			const m = makeMap([["a", intVal(1)], ["b", intVal(2)], ["c", intVal(3)]]);
			assert.deepEqual(op("size").fn(m), intVal(3));
		});
	});

	// =======================================================================
	// remove
	// =======================================================================
	describe("remove", () => {
		it("removes existing key", () => {
			const m = makeMap([["x", intVal(1)], ["y", intVal(2)]]);
			const result = op("remove").fn(m, stringVal("x"));
			assert.equal(result.kind, "map");
			if (result.kind === "map") {
				assert.equal(result.value.size, 1);
				assert.equal(result.value.has("s:x"), false);
			}
		});

		it("is no-op for missing key", () => {
			const m = makeMap([["x", intVal(1)]]);
			const result = op("remove").fn(m, stringVal("z"));
			assert.equal(result.kind, "map");
			if (result.kind === "map") {
				assert.equal(result.value.size, 1);
			}
		});
	});

	// =======================================================================
	// merge
	// =======================================================================
	describe("merge", () => {
		it("merges two maps with right precedence", () => {
			const a = makeMap([["x", intVal(1)], ["y", intVal(2)]]);
			const b = makeMap([["y", intVal(99)], ["z", intVal(3)]]);
			const result = op("merge").fn(a, b);
			assert.equal(result.kind, "map");
			if (result.kind === "map") {
				assert.equal(result.value.size, 3);
				assert.deepEqual(result.value.get("s:y"), intVal(99));
				assert.deepEqual(result.value.get("s:z"), intVal(3));
			}
		});

		it("merges with empty map", () => {
			const m = makeMap([["x", intVal(1)]]);
			const result = op("merge").fn(m, emptyMap);
			assert.equal(result.kind, "map");
			if (result.kind === "map") {
				assert.equal(result.value.size, 1);
			}
		});
	});
});
