// SPDX-License-Identifier: MIT
// SPIRAL Set Domain - Unit Tests

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createSetRegistry } from "../src/domains/set.js";
import { lookupOperator } from "../src/domains/registry.js";
import {
	setVal,
	intVal,
	boolVal,
	errorVal,
	hashValue,
} from "../src/types.js";
import type { Value } from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const registry = createSetRegistry();

function op(name: string) {
	const operator = lookupOperator(registry, "set", name);
	if (!operator) throw new Error(`Operator set:${name} not found`);
	return operator;
}

function makeSet(...vals: Value[]): Value {
	return setVal(new Set(vals.map(hashValue)));
}

const emptySet = setVal(new Set<string>());
const err = errorVal("TestError", "test");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("set domain", () => {
	// =======================================================================
	// union
	// =======================================================================
	describe("union", () => {
		it("returns union of disjoint sets", () => {
			const a = makeSet(intVal(1), intVal(2));
			const b = makeSet(intVal(3), intVal(4));
			const result = op("union").fn(a, b);
			assert.equal(result.kind, "set");
			if (result.kind === "set") {
				assert.equal(result.value.size, 4);
				assert.ok(result.value.has(hashValue(intVal(1))));
				assert.ok(result.value.has(hashValue(intVal(4))));
			}
		});

		it("returns union with no duplicates for overlapping sets", () => {
			const a = makeSet(intVal(1), intVal(2), intVal(3));
			const b = makeSet(intVal(2), intVal(3), intVal(4));
			const result = op("union").fn(a, b);
			assert.equal(result.kind, "set");
			if (result.kind === "set") {
				assert.equal(result.value.size, 4);
			}
		});

		it("returns non-empty set when unioning empty with non-empty", () => {
			const a = emptySet;
			const b = makeSet(intVal(1), intVal(2));
			const result = op("union").fn(a, b);
			assert.equal(result.kind, "set");
			if (result.kind === "set") {
				assert.equal(result.value.size, 2);
			}
		});

		it("propagates error from first argument", () => {
			const result = op("union").fn(err, emptySet);
			assert.equal(result.kind, "error");
			if (result.kind === "error") assert.equal(result.code, "TestError");
		});

		it("propagates error from second argument", () => {
			const result = op("union").fn(emptySet, err);
			assert.equal(result.kind, "error");
			if (result.kind === "error") assert.equal(result.code, "TestError");
		});

		it("returns TypeError for non-set argument", () => {
			const result = op("union").fn(intVal(1), emptySet);
			assert.equal(result.kind, "error");
			if (result.kind === "error") assert.equal(result.code, "TypeError");
		});
	});

	// =======================================================================
	// intersect
	// =======================================================================
	describe("intersect", () => {
		it("returns common elements of overlapping sets", () => {
			const a = makeSet(intVal(1), intVal(2), intVal(3));
			const b = makeSet(intVal(2), intVal(3), intVal(4));
			const result = op("intersect").fn(a, b);
			assert.equal(result.kind, "set");
			if (result.kind === "set") {
				assert.equal(result.value.size, 2);
				assert.ok(result.value.has(hashValue(intVal(2))));
				assert.ok(result.value.has(hashValue(intVal(3))));
			}
		});

		it("returns empty set for disjoint sets", () => {
			const a = makeSet(intVal(1), intVal(2));
			const b = makeSet(intVal(3), intVal(4));
			const result = op("intersect").fn(a, b);
			assert.deepStrictEqual(result, emptySet);
		});

		it("returns empty set when one argument is empty", () => {
			const a = emptySet;
			const b = makeSet(intVal(1), intVal(2));
			const result = op("intersect").fn(a, b);
			assert.deepStrictEqual(result, emptySet);
		});

		it("propagates error from first argument", () => {
			const result = op("intersect").fn(err, emptySet);
			assert.equal(result.kind, "error");
			if (result.kind === "error") assert.equal(result.code, "TestError");
		});

		it("propagates error from second argument", () => {
			const result = op("intersect").fn(emptySet, err);
			assert.equal(result.kind, "error");
			if (result.kind === "error") assert.equal(result.code, "TestError");
		});

		it("returns TypeError for non-set argument", () => {
			const result = op("intersect").fn(intVal(1), emptySet);
			assert.equal(result.kind, "error");
			if (result.kind === "error") assert.equal(result.code, "TypeError");
		});
	});

	// =======================================================================
	// difference
	// =======================================================================
	describe("difference", () => {
		it("returns elements in a not in b for overlapping sets", () => {
			const a = makeSet(intVal(1), intVal(2), intVal(3));
			const b = makeSet(intVal(2), intVal(3), intVal(4));
			const result = op("difference").fn(a, b);
			assert.equal(result.kind, "set");
			if (result.kind === "set") {
				assert.equal(result.value.size, 1);
				assert.ok(result.value.has(hashValue(intVal(1))));
			}
		});

		it("returns full set a when no overlap with b", () => {
			const a = makeSet(intVal(1), intVal(2));
			const b = makeSet(intVal(3), intVal(4));
			const result = op("difference").fn(a, b);
			assert.equal(result.kind, "set");
			if (result.kind === "set") {
				assert.equal(result.value.size, 2);
				assert.ok(result.value.has(hashValue(intVal(1))));
				assert.ok(result.value.has(hashValue(intVal(2))));
			}
		});

		it("returns empty set when sets are equal", () => {
			const a = makeSet(intVal(1), intVal(2));
			const b = makeSet(intVal(1), intVal(2));
			const result = op("difference").fn(a, b);
			assert.deepStrictEqual(result, emptySet);
		});

		it("returns empty set when first set is empty", () => {
			const b = makeSet(intVal(1));
			const result = op("difference").fn(emptySet, b);
			assert.deepStrictEqual(result, emptySet);
		});

		it("propagates error from first argument", () => {
			const result = op("difference").fn(err, emptySet);
			assert.equal(result.kind, "error");
			if (result.kind === "error") assert.equal(result.code, "TestError");
		});

		it("returns TypeError for non-set argument", () => {
			const result = op("difference").fn(intVal(1), emptySet);
			assert.equal(result.kind, "error");
			if (result.kind === "error") assert.equal(result.code, "TypeError");
		});
	});

	// =======================================================================
	// contains
	// =======================================================================
	describe("contains", () => {
		it("returns true when element is present", () => {
			const s = makeSet(intVal(1), intVal(2), intVal(3));
			const result = op("contains").fn(s, intVal(2));
			assert.deepStrictEqual(result, boolVal(true));
		});

		it("returns false when element is absent", () => {
			const s = makeSet(intVal(1), intVal(2));
			const result = op("contains").fn(s, intVal(5));
			assert.deepStrictEqual(result, boolVal(false));
		});

		it("returns false for empty set", () => {
			const result = op("contains").fn(emptySet, intVal(1));
			assert.deepStrictEqual(result, boolVal(false));
		});

		it("propagates error from first argument", () => {
			const result = op("contains").fn(err, intVal(1));
			assert.equal(result.kind, "error");
			if (result.kind === "error") assert.equal(result.code, "TestError");
		});

		it("propagates error from second argument", () => {
			const s = makeSet(intVal(1));
			const result = op("contains").fn(s, err);
			assert.equal(result.kind, "error");
			if (result.kind === "error") assert.equal(result.code, "TestError");
		});

		it("returns TypeError for non-set first argument", () => {
			const result = op("contains").fn(intVal(1), intVal(2));
			assert.equal(result.kind, "error");
			if (result.kind === "error") assert.equal(result.code, "TypeError");
		});
	});

	// =======================================================================
	// subset
	// =======================================================================
	describe("subset", () => {
		it("returns true for a proper subset", () => {
			const a = makeSet(intVal(1), intVal(2));
			const b = makeSet(intVal(1), intVal(2), intVal(3));
			const result = op("subset").fn(a, b);
			assert.deepStrictEqual(result, boolVal(true));
		});

		it("returns true for equal sets", () => {
			const a = makeSet(intVal(1), intVal(2));
			const b = makeSet(intVal(1), intVal(2));
			const result = op("subset").fn(a, b);
			assert.deepStrictEqual(result, boolVal(true));
		});

		it("returns false for partial overlap", () => {
			const a = makeSet(intVal(1), intVal(2), intVal(3));
			const b = makeSet(intVal(2), intVal(3));
			const result = op("subset").fn(a, b);
			assert.deepStrictEqual(result, boolVal(false));
		});

		it("returns true for empty set as subset of any set", () => {
			const b = makeSet(intVal(1), intVal(2));
			const result = op("subset").fn(emptySet, b);
			assert.deepStrictEqual(result, boolVal(true));
		});

		it("propagates error from first argument", () => {
			const result = op("subset").fn(err, emptySet);
			assert.equal(result.kind, "error");
			if (result.kind === "error") assert.equal(result.code, "TestError");
		});

		it("returns TypeError for non-set argument", () => {
			const result = op("subset").fn(intVal(1), emptySet);
			assert.equal(result.kind, "error");
			if (result.kind === "error") assert.equal(result.code, "TypeError");
		});
	});

	// =======================================================================
	// add
	// =======================================================================
	describe("add", () => {
		it("adds a new element to the set", () => {
			const s = makeSet(intVal(1), intVal(2));
			const result = op("add").fn(s, intVal(3));
			assert.equal(result.kind, "set");
			if (result.kind === "set") {
				assert.equal(result.value.size, 3);
				assert.ok(result.value.has(hashValue(intVal(3))));
			}
		});

		it("does not increase size for duplicate element", () => {
			const s = makeSet(intVal(1), intVal(2));
			const result = op("add").fn(s, intVal(2));
			assert.equal(result.kind, "set");
			if (result.kind === "set") {
				assert.equal(result.value.size, 2);
			}
		});

		it("adds element to empty set", () => {
			const result = op("add").fn(emptySet, intVal(42));
			assert.equal(result.kind, "set");
			if (result.kind === "set") {
				assert.equal(result.value.size, 1);
				assert.ok(result.value.has(hashValue(intVal(42))));
			}
		});

		it("propagates error from first argument", () => {
			const result = op("add").fn(err, intVal(1));
			assert.equal(result.kind, "error");
			if (result.kind === "error") assert.equal(result.code, "TestError");
		});

		it("propagates error from second argument", () => {
			const s = makeSet(intVal(1));
			const result = op("add").fn(s, err);
			assert.equal(result.kind, "error");
			if (result.kind === "error") assert.equal(result.code, "TestError");
		});

		it("returns TypeError for non-set first argument", () => {
			const result = op("add").fn(intVal(1), intVal(2));
			assert.equal(result.kind, "error");
			if (result.kind === "error") assert.equal(result.code, "TypeError");
		});
	});

	// =======================================================================
	// remove
	// =======================================================================
	describe("remove", () => {
		it("removes an existing element from the set", () => {
			const s = makeSet(intVal(1), intVal(2), intVal(3));
			const result = op("remove").fn(s, intVal(2));
			assert.equal(result.kind, "set");
			if (result.kind === "set") {
				assert.equal(result.value.size, 2);
				assert.ok(!result.value.has(hashValue(intVal(2))));
				assert.ok(result.value.has(hashValue(intVal(1))));
				assert.ok(result.value.has(hashValue(intVal(3))));
			}
		});

		it("returns unchanged set when removing absent element", () => {
			const s = makeSet(intVal(1), intVal(2));
			const result = op("remove").fn(s, intVal(5));
			assert.equal(result.kind, "set");
			if (result.kind === "set") {
				assert.equal(result.value.size, 2);
			}
		});

		it("returns empty set when removing from empty set", () => {
			const result = op("remove").fn(emptySet, intVal(1));
			assert.deepStrictEqual(result, emptySet);
		});

		it("propagates error from first argument", () => {
			const result = op("remove").fn(err, intVal(1));
			assert.equal(result.kind, "error");
			if (result.kind === "error") assert.equal(result.code, "TestError");
		});

		it("propagates error from second argument", () => {
			const s = makeSet(intVal(1));
			const result = op("remove").fn(s, err);
			assert.equal(result.kind, "error");
			if (result.kind === "error") assert.equal(result.code, "TestError");
		});

		it("returns TypeError for non-set first argument", () => {
			const result = op("remove").fn(intVal(1), intVal(2));
			assert.equal(result.kind, "error");
			if (result.kind === "error") assert.equal(result.code, "TypeError");
		});
	});

	// =======================================================================
	// size
	// =======================================================================
	describe("size", () => {
		it("returns count for populated set", () => {
			const s = makeSet(intVal(1), intVal(2), intVal(3));
			const result = op("size").fn(s);
			assert.deepStrictEqual(result, intVal(3));
		});

		it("returns 0 for empty set", () => {
			const result = op("size").fn(emptySet);
			assert.deepStrictEqual(result, intVal(0));
		});

		it("propagates error argument", () => {
			const result = op("size").fn(err);
			assert.equal(result.kind, "error");
			if (result.kind === "error") assert.equal(result.code, "TestError");
		});

		it("returns TypeError for non-set argument", () => {
			const result = op("size").fn(intVal(1));
			assert.equal(result.kind, "error");
			if (result.kind === "error") assert.equal(result.code, "TypeError");
		});
	});
});
