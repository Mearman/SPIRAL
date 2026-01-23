// SPIRAL Domain Operator Tests
// Tests for list and set operators

import { describe, it } from "node:test";
import assert from "node:assert";
import { createListRegistry } from "../src/domains/list.js";
import { createSetRegistry } from "../src/domains/set.js";
import { lookupOperator } from "../src/domains/registry.js";
import {
	intVal,
	listVal,
	setVal,
	boolVal,
	hashValue,
	isError,
} from "../src/types.js";

describe("List Operators", () => {
	const registry = createListRegistry();

	describe("length", () => {
		it("should return length of a list", () => {
			const op = lookupOperator(registry, "list", "length");
			assert.ok(op);

			const result = op.fn(listVal([intVal(1), intVal(2), intVal(3)]));
			assert.deepStrictEqual(result, intVal(3));
		});

		it("should return 0 for empty list", () => {
			const op = lookupOperator(registry, "list", "length");
			assert.ok(op);

			const result = op.fn(listVal([]));
			assert.deepStrictEqual(result, intVal(0));
		});

		it("should return error for non-list", () => {
			const op = lookupOperator(registry, "list", "length");
			assert.ok(op);

			const result = op.fn(intVal(42));
			assert.ok(isError(result));
		});
	});

	describe("concat", () => {
		it("should concatenate two lists", () => {
			const op = lookupOperator(registry, "list", "concat");
			assert.ok(op);

			const result = op.fn(
				listVal([intVal(1), intVal(2)]),
				listVal([intVal(3), intVal(4)]),
			);
			assert.deepStrictEqual(result, listVal([intVal(1), intVal(2), intVal(3), intVal(4)]));
		});

		it("should handle empty lists", () => {
			const op = lookupOperator(registry, "list", "concat");
			assert.ok(op);

			const result = op.fn(listVal([]), listVal([intVal(1)]));
			assert.deepStrictEqual(result, listVal([intVal(1)]));
		});

		it("should return error for non-list arguments", () => {
			const op = lookupOperator(registry, "list", "concat");
			assert.ok(op);

			const result = op.fn(intVal(1), listVal([]));
			assert.ok(isError(result));
		});
	});

	describe("nth", () => {
		it("should return element at index", () => {
			const op = lookupOperator(registry, "list", "nth");
			assert.ok(op);

			const result = op.fn(
				listVal([intVal(10), intVal(20), intVal(30)]),
				intVal(1),
			);
			assert.deepStrictEqual(result, intVal(20));
		});

		it("should return error for out of bounds index", () => {
			const op = lookupOperator(registry, "list", "nth");
			assert.ok(op);

			const result = op.fn(listVal([intVal(1)]), intVal(5));
			assert.ok(isError(result));
		});

		it("should return error for negative index", () => {
			const op = lookupOperator(registry, "list", "nth");
			assert.ok(op);

			const result = op.fn(listVal([intVal(1)]), intVal(-1));
			assert.ok(isError(result));
		});
	});

	describe("reverse", () => {
		it("should reverse a list", () => {
			const op = lookupOperator(registry, "list", "reverse");
			assert.ok(op);

			const result = op.fn(listVal([intVal(1), intVal(2), intVal(3)]));
			assert.deepStrictEqual(result, listVal([intVal(3), intVal(2), intVal(1)]));
		});

		it("should handle empty list", () => {
			const op = lookupOperator(registry, "list", "reverse");
			assert.ok(op);

			const result = op.fn(listVal([]));
			assert.deepStrictEqual(result, listVal([]));
		});

		it("should handle single element list", () => {
			const op = lookupOperator(registry, "list", "reverse");
			assert.ok(op);

			const result = op.fn(listVal([intVal(42)]));
			assert.deepStrictEqual(result, listVal([intVal(42)]));
		});
	});

	describe("slice", () => {
		it("should slice from index to end", () => {
			const op = lookupOperator(registry, "list", "slice");
			assert.ok(op);

			const result = op.fn(
				listVal([intVal(1), intVal(2), intVal(3), intVal(4)]),
				intVal(2),
			);
			assert.deepStrictEqual(result, listVal([intVal(3), intVal(4)]));
		});

		it("should return empty list when index equals length", () => {
			const op = lookupOperator(registry, "list", "slice");
			assert.ok(op);

			const result = op.fn(listVal([intVal(1), intVal(2)]), intVal(2));
			assert.deepStrictEqual(result, listVal([]));
		});

		it("should return error for negative index", () => {
			const op = lookupOperator(registry, "list", "slice");
			assert.ok(op);

			const result = op.fn(listVal([intVal(1)]), intVal(-1));
			assert.ok(isError(result));
		});
	});

	describe("cons", () => {
		it("should prepend element to list", () => {
			const op = lookupOperator(registry, "list", "cons");
			assert.ok(op);

			const result = op.fn(intVal(0), listVal([intVal(1), intVal(2)]));
			assert.deepStrictEqual(result, listVal([intVal(0), intVal(1), intVal(2)]));
		});

		it("should work with empty list", () => {
			const op = lookupOperator(registry, "list", "cons");
			assert.ok(op);

			const result = op.fn(intVal(42), listVal([]));
			assert.deepStrictEqual(result, listVal([intVal(42)]));
		});

		it("should return error for non-list second argument", () => {
			const op = lookupOperator(registry, "list", "cons");
			assert.ok(op);

			const result = op.fn(intVal(1), intVal(2));
			assert.ok(isError(result));
		});
	});
});

describe("Set Operators", () => {
	const registry = createSetRegistry();

	// Helper to create a set with hashed values
	const makeSet = (...vals: number[]) => {
		return setVal(new Set(vals.map(v => hashValue(intVal(v)))));
	};

	describe("union", () => {
		it("should compute union of two sets", () => {
			const op = lookupOperator(registry, "set", "union");
			assert.ok(op);

			const result = op.fn(makeSet(1, 2), makeSet(2, 3));
			assert.ok(result.kind === "set");
			assert.strictEqual(result.value.size, 3);
		});

		it("should handle empty sets", () => {
			const op = lookupOperator(registry, "set", "union");
			assert.ok(op);

			const result = op.fn(makeSet(), makeSet(1, 2));
			assert.ok(result.kind === "set");
			assert.strictEqual(result.value.size, 2);
		});

		it("should return error for non-set arguments", () => {
			const op = lookupOperator(registry, "set", "union");
			assert.ok(op);

			const result = op.fn(intVal(1), makeSet());
			assert.ok(isError(result));
		});
	});

	describe("intersect", () => {
		it("should compute intersection of two sets", () => {
			const op = lookupOperator(registry, "set", "intersect");
			assert.ok(op);

			const result = op.fn(makeSet(1, 2, 3), makeSet(2, 3, 4));
			assert.ok(result.kind === "set");
			assert.strictEqual(result.value.size, 2);
		});

		it("should return empty set for disjoint sets", () => {
			const op = lookupOperator(registry, "set", "intersect");
			assert.ok(op);

			const result = op.fn(makeSet(1, 2), makeSet(3, 4));
			assert.ok(result.kind === "set");
			assert.strictEqual(result.value.size, 0);
		});
	});

	describe("difference", () => {
		it("should compute set difference", () => {
			const op = lookupOperator(registry, "set", "difference");
			assert.ok(op);

			const result = op.fn(makeSet(1, 2, 3), makeSet(2));
			assert.ok(result.kind === "set");
			assert.strictEqual(result.value.size, 2);
		});

		it("should return empty set when subtracting superset", () => {
			const op = lookupOperator(registry, "set", "difference");
			assert.ok(op);

			const result = op.fn(makeSet(1), makeSet(1, 2, 3));
			assert.ok(result.kind === "set");
			assert.strictEqual(result.value.size, 0);
		});
	});

	describe("contains", () => {
		it("should return true if element is in set", () => {
			const op = lookupOperator(registry, "set", "contains");
			assert.ok(op);

			const result = op.fn(makeSet(1, 2, 3), intVal(2));
			assert.deepStrictEqual(result, boolVal(true));
		});

		it("should return false if element is not in set", () => {
			const op = lookupOperator(registry, "set", "contains");
			assert.ok(op);

			const result = op.fn(makeSet(1, 2, 3), intVal(5));
			assert.deepStrictEqual(result, boolVal(false));
		});

		it("should return error for non-set first argument", () => {
			const op = lookupOperator(registry, "set", "contains");
			assert.ok(op);

			const result = op.fn(intVal(1), intVal(1));
			assert.ok(isError(result));
		});
	});

	describe("subset", () => {
		it("should return true for subset", () => {
			const op = lookupOperator(registry, "set", "subset");
			assert.ok(op);

			const result = op.fn(makeSet(1, 2), makeSet(1, 2, 3));
			assert.deepStrictEqual(result, boolVal(true));
		});

		it("should return false for non-subset", () => {
			const op = lookupOperator(registry, "set", "subset");
			assert.ok(op);

			const result = op.fn(makeSet(1, 4), makeSet(1, 2, 3));
			assert.deepStrictEqual(result, boolVal(false));
		});

		it("should return true for empty set as subset", () => {
			const op = lookupOperator(registry, "set", "subset");
			assert.ok(op);

			const result = op.fn(makeSet(), makeSet(1, 2));
			assert.deepStrictEqual(result, boolVal(true));
		});

		it("should return true for equal sets", () => {
			const op = lookupOperator(registry, "set", "subset");
			assert.ok(op);

			const result = op.fn(makeSet(1, 2), makeSet(1, 2));
			assert.deepStrictEqual(result, boolVal(true));
		});
	});

	describe("add", () => {
		it("should add element to set", () => {
			const op = lookupOperator(registry, "set", "add");
			assert.ok(op);

			const result = op.fn(makeSet(1, 2), intVal(3));
			assert.ok(result.kind === "set");
			assert.strictEqual(result.value.size, 3);
		});

		it("should not duplicate existing element", () => {
			const op = lookupOperator(registry, "set", "add");
			assert.ok(op);

			const result = op.fn(makeSet(1, 2), intVal(2));
			assert.ok(result.kind === "set");
			assert.strictEqual(result.value.size, 2);
		});
	});

	describe("remove", () => {
		it("should remove element from set", () => {
			const op = lookupOperator(registry, "set", "remove");
			assert.ok(op);

			const result = op.fn(makeSet(1, 2, 3), intVal(2));
			assert.ok(result.kind === "set");
			assert.strictEqual(result.value.size, 2);
		});

		it("should handle removing non-existent element", () => {
			const op = lookupOperator(registry, "set", "remove");
			assert.ok(op);

			const result = op.fn(makeSet(1, 2), intVal(5));
			assert.ok(result.kind === "set");
			assert.strictEqual(result.value.size, 2);
		});
	});

	describe("size", () => {
		it("should return size of set", () => {
			const op = lookupOperator(registry, "set", "size");
			assert.ok(op);

			const result = op.fn(makeSet(1, 2, 3));
			assert.deepStrictEqual(result, intVal(3));
		});

		it("should return 0 for empty set", () => {
			const op = lookupOperator(registry, "set", "size");
			assert.ok(op);

			const result = op.fn(makeSet());
			assert.deepStrictEqual(result, intVal(0));
		});

		it("should return error for non-set", () => {
			const op = lookupOperator(registry, "set", "size");
			assert.ok(op);

			const result = op.fn(intVal(42));
			assert.ok(isError(result));
		});
	});
});
