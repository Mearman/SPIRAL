// SPIRAL Bool Domain Unit Tests
// Tests for boolean algebra operators

import assert from "node:assert";
import { describe, it } from "node:test";
import { createBoolRegistry } from "../src/domains/bool.js";
import { lookupOperator } from "../src/domains/registry.js";
import {
	boolVal,
	errorVal,
	intVal,
	isError,
} from "../src/types.js";

describe("Bool Domain - Boolean Operators", () => {
	const registry = createBoolRegistry();

	describe("and", () => {
		it("should return true for true AND true", () => {
			const op = lookupOperator(registry, "bool", "and");
			assert.ok(op);

			const result = op.fn(boolVal(true), boolVal(true));
			assert.deepStrictEqual(result, boolVal(true));
		});

		it("should return false for true AND false", () => {
			const op = lookupOperator(registry, "bool", "and");
			assert.ok(op);

			const result = op.fn(boolVal(true), boolVal(false));
			assert.deepStrictEqual(result, boolVal(false));
		});

		it("should return false for false AND true", () => {
			const op = lookupOperator(registry, "bool", "and");
			assert.ok(op);

			const result = op.fn(boolVal(false), boolVal(true));
			assert.deepStrictEqual(result, boolVal(false));
		});

		it("should return false for false AND false", () => {
			const op = lookupOperator(registry, "bool", "and");
			assert.ok(op);

			const result = op.fn(boolVal(false), boolVal(false));
			assert.deepStrictEqual(result, boolVal(false));
		});

		it("should propagate error from first argument", () => {
			const op = lookupOperator(registry, "bool", "and");
			assert.ok(op);

			const err = errorVal("TestError", "test");
			const result = op.fn(err, boolVal(true));
			assert.ok(isError(result));
		});

		it("should propagate error from second argument", () => {
			const op = lookupOperator(registry, "bool", "and");
			assert.ok(op);

			const err = errorVal("TestError", "test");
			const result = op.fn(boolVal(true), err);
			assert.ok(isError(result));
		});

		it("should throw for non-boolean value", () => {
			const op = lookupOperator(registry, "bool", "and");
			assert.ok(op);

			assert.throws(() => op.fn(intVal(1), boolVal(true)));
			assert.throws(() => op.fn(boolVal(true), intVal(1)));
		});
	});

	describe("or", () => {
		it("should return true for true OR true", () => {
			const op = lookupOperator(registry, "bool", "or");
			assert.ok(op);

			const result = op.fn(boolVal(true), boolVal(true));
			assert.deepStrictEqual(result, boolVal(true));
		});

		it("should return true for true OR false", () => {
			const op = lookupOperator(registry, "bool", "or");
			assert.ok(op);

			const result = op.fn(boolVal(true), boolVal(false));
			assert.deepStrictEqual(result, boolVal(true));
		});

		it("should return true for false OR true", () => {
			const op = lookupOperator(registry, "bool", "or");
			assert.ok(op);

			const result = op.fn(boolVal(false), boolVal(true));
			assert.deepStrictEqual(result, boolVal(true));
		});

		it("should return false for false OR false", () => {
			const op = lookupOperator(registry, "bool", "or");
			assert.ok(op);

			const result = op.fn(boolVal(false), boolVal(false));
			assert.deepStrictEqual(result, boolVal(false));
		});

		it("should propagate error from first argument", () => {
			const op = lookupOperator(registry, "bool", "or");
			assert.ok(op);

			const err = errorVal("TestError", "test");
			const result = op.fn(err, boolVal(true));
			assert.ok(isError(result));
		});

		it("should propagate error from second argument", () => {
			const op = lookupOperator(registry, "bool", "or");
			assert.ok(op);

			const err = errorVal("TestError", "test");
			const result = op.fn(boolVal(false), err);
			assert.ok(isError(result));
		});

		it("should throw for non-boolean value", () => {
			const op = lookupOperator(registry, "bool", "or");
			assert.ok(op);

			assert.throws(() => op.fn(intVal(1), boolVal(false)));
			assert.throws(() => op.fn(boolVal(false), intVal(0)));
		});
	});

	describe("not", () => {
		it("should return false for NOT true", () => {
			const op = lookupOperator(registry, "bool", "not");
			assert.ok(op);

			const result = op.fn(boolVal(true));
			assert.deepStrictEqual(result, boolVal(false));
		});

		it("should return true for NOT false", () => {
			const op = lookupOperator(registry, "bool", "not");
			assert.ok(op);

			const result = op.fn(boolVal(false));
			assert.deepStrictEqual(result, boolVal(true));
		});

		it("should propagate error", () => {
			const op = lookupOperator(registry, "bool", "not");
			assert.ok(op);

			const err = errorVal("TestError", "test");
			const result = op.fn(err);
			assert.ok(isError(result));
		});

		it("should throw for non-boolean value", () => {
			const op = lookupOperator(registry, "bool", "not");
			assert.ok(op);

			assert.throws(() => op.fn(intVal(1)));
		});

		it("should be idempotent when applied twice", () => {
			const op = lookupOperator(registry, "bool", "not");
			assert.ok(op);

			const original = boolVal(true);
			const negated = op.fn(original);
			const doubleNegated = op.fn(negated);
			assert.deepStrictEqual(doubleNegated, original);
		});
	});

	describe("xor", () => {
		it("should return false for true XOR true", () => {
			const op = lookupOperator(registry, "bool", "xor");
			assert.ok(op);

			const result = op.fn(boolVal(true), boolVal(true));
			assert.deepStrictEqual(result, boolVal(false));
		});

		it("should return true for true XOR false", () => {
			const op = lookupOperator(registry, "bool", "xor");
			assert.ok(op);

			const result = op.fn(boolVal(true), boolVal(false));
			assert.deepStrictEqual(result, boolVal(true));
		});

		it("should return true for false XOR true", () => {
			const op = lookupOperator(registry, "bool", "xor");
			assert.ok(op);

			const result = op.fn(boolVal(false), boolVal(true));
			assert.deepStrictEqual(result, boolVal(true));
		});

		it("should return false for false XOR false", () => {
			const op = lookupOperator(registry, "bool", "xor");
			assert.ok(op);

			const result = op.fn(boolVal(false), boolVal(false));
			assert.deepStrictEqual(result, boolVal(false));
		});

		it("should propagate error from first argument", () => {
			const op = lookupOperator(registry, "bool", "xor");
			assert.ok(op);

			const err = errorVal("TestError", "test");
			const result = op.fn(err, boolVal(true));
			assert.ok(isError(result));
		});

		it("should propagate error from second argument", () => {
			const op = lookupOperator(registry, "bool", "xor");
			assert.ok(op);

			const err = errorVal("TestError", "test");
			const result = op.fn(boolVal(true), err);
			assert.ok(isError(result));
		});

		it("should throw for non-boolean value", () => {
			const op = lookupOperator(registry, "bool", "xor");
			assert.ok(op);

			assert.throws(() => op.fn(intVal(1), boolVal(true)));
			assert.throws(() => op.fn(boolVal(true), intVal(0)));
		});

		it("should be commutative", () => {
			const op = lookupOperator(registry, "bool", "xor");
			assert.ok(op);

			const result1 = op.fn(boolVal(true), boolVal(false));
			const result2 = op.fn(boolVal(false), boolVal(true));
			assert.deepStrictEqual(result1, result2);
		});
	});
});

describe("createBoolRegistry", () => {
	it("should create registry with all boolean operators", () => {
		const registry = createBoolRegistry();

		assert.ok(lookupOperator(registry, "bool", "and"));
		assert.ok(lookupOperator(registry, "bool", "or"));
		assert.ok(lookupOperator(registry, "bool", "not"));
		assert.ok(lookupOperator(registry, "bool", "xor"));
	});

	it("should mark all operators as pure", () => {
		const registry = createBoolRegistry();

		const and = lookupOperator(registry, "bool", "and");
		assert.ok(and);
		assert.strictEqual(and.pure, true);

		const or = lookupOperator(registry, "bool", "or");
		assert.ok(or);
		assert.strictEqual(or.pure, true);

		const not = lookupOperator(registry, "bool", "not");
		assert.ok(not);
		assert.strictEqual(not.pure, true);

		const xor = lookupOperator(registry, "bool", "xor");
		assert.ok(xor);
		assert.strictEqual(xor.pure, true);
	});

	it("should have correct signatures", () => {
		const registry = createBoolRegistry();

		const and = lookupOperator(registry, "bool", "and");
		assert.ok(and);
		assert.strictEqual(and.params.length, 2);
		assert.deepStrictEqual(and.params[0], { kind: "bool" });
		assert.deepStrictEqual(and.params[1], { kind: "bool" });
		assert.deepStrictEqual(and.returns, { kind: "bool" });

		const not = lookupOperator(registry, "bool", "not");
		assert.ok(not);
		assert.strictEqual(not.params.length, 1);
		assert.deepStrictEqual(not.params[0], { kind: "bool" });
		assert.deepStrictEqual(not.returns, { kind: "bool" });
	});
});

describe("Boolean Logic Properties", () => {
	const registry = createBoolRegistry();

	describe("De Morgan's Laws", () => {
		it("should satisfy NOT (A AND B) = (NOT A) OR (NOT B)", () => {
			const andOp = lookupOperator(registry, "bool", "and");
			const orOp = lookupOperator(registry, "bool", "or");
			const notOp = lookupOperator(registry, "bool", "not");
			assert.ok(andOp && orOp && notOp);

			const testCases = [
				[true, true],
				[true, false],
				[false, true],
				[false, false],
			];

			for (const [a, b] of testCases) {
				const left = notOp.fn(andOp.fn(boolVal(a), boolVal(b)));
				const right = orOp.fn(notOp.fn(boolVal(a)), notOp.fn(boolVal(b)));
				assert.deepStrictEqual(left, right, `Failed for a=${a}, b=${b}`);
			}
		});

		it("should satisfy NOT (A OR B) = (NOT A) AND (NOT B)", () => {
			const andOp = lookupOperator(registry, "bool", "and");
			const orOp = lookupOperator(registry, "bool", "or");
			const notOp = lookupOperator(registry, "bool", "not");
			assert.ok(andOp && orOp && notOp);

			const testCases = [
				[true, true],
				[true, false],
				[false, true],
				[false, false],
			];

			for (const [a, b] of testCases) {
				const left = notOp.fn(orOp.fn(boolVal(a), boolVal(b)));
				const right = andOp.fn(notOp.fn(boolVal(a)), notOp.fn(boolVal(b)));
				assert.deepStrictEqual(left, right, `Failed for a=${a}, b=${b}`);
			}
		});
	});

	describe("Identity Laws", () => {
		it("should satisfy A AND true = A", () => {
			const andOp = lookupOperator(registry, "bool", "and");
			assert.ok(andOp);

			assert.deepStrictEqual(andOp.fn(boolVal(true), boolVal(true)), boolVal(true));
			assert.deepStrictEqual(andOp.fn(boolVal(false), boolVal(true)), boolVal(false));
		});

		it("should satisfy A OR false = A", () => {
			const orOp = lookupOperator(registry, "bool", "or");
			assert.ok(orOp);

			assert.deepStrictEqual(orOp.fn(boolVal(true), boolVal(false)), boolVal(true));
			assert.deepStrictEqual(orOp.fn(boolVal(false), boolVal(false)), boolVal(false));
		});
	});

	describe("Annihilation Laws", () => {
		it("should satisfy A AND false = false", () => {
			const andOp = lookupOperator(registry, "bool", "and");
			assert.ok(andOp);

			assert.deepStrictEqual(andOp.fn(boolVal(true), boolVal(false)), boolVal(false));
			assert.deepStrictEqual(andOp.fn(boolVal(false), boolVal(false)), boolVal(false));
		});

		it("should satisfy A OR true = true", () => {
			const orOp = lookupOperator(registry, "bool", "or");
			assert.ok(orOp);

			assert.deepStrictEqual(orOp.fn(boolVal(true), boolVal(true)), boolVal(true));
			assert.deepStrictEqual(orOp.fn(boolVal(false), boolVal(true)), boolVal(true));
		});
	});

	describe("Idempotent Laws", () => {
		it("should satisfy A AND A = A", () => {
			const andOp = lookupOperator(registry, "bool", "and");
			assert.ok(andOp);

			assert.deepStrictEqual(andOp.fn(boolVal(true), boolVal(true)), boolVal(true));
			assert.deepStrictEqual(andOp.fn(boolVal(false), boolVal(false)), boolVal(false));
		});

		it("should satisfy A OR A = A", () => {
			const orOp = lookupOperator(registry, "bool", "or");
			assert.ok(orOp);

			assert.deepStrictEqual(orOp.fn(boolVal(true), boolVal(true)), boolVal(true));
			assert.deepStrictEqual(orOp.fn(boolVal(false), boolVal(false)), boolVal(false));
		});
	});

	describe("Complement Laws", () => {
		it("should satisfy A AND (NOT A) = false", () => {
			const andOp = lookupOperator(registry, "bool", "and");
			const notOp = lookupOperator(registry, "bool", "not");
			assert.ok(andOp && notOp);

			assert.deepStrictEqual(
				andOp.fn(boolVal(true), notOp.fn(boolVal(true))),
				boolVal(false),
			);
			assert.deepStrictEqual(
				andOp.fn(boolVal(false), notOp.fn(boolVal(false))),
				boolVal(false),
			);
		});

		it("should satisfy A OR (NOT A) = true", () => {
			const orOp = lookupOperator(registry, "bool", "or");
			const notOp = lookupOperator(registry, "bool", "not");
			assert.ok(orOp && notOp);

			assert.deepStrictEqual(
				orOp.fn(boolVal(true), notOp.fn(boolVal(true))),
				boolVal(true),
			);
			assert.deepStrictEqual(
				orOp.fn(boolVal(false), notOp.fn(boolVal(false))),
				boolVal(true),
			);
		});
	});

	describe("XOR Properties", () => {
		it("should satisfy A XOR false = A", () => {
			const xorOp = lookupOperator(registry, "bool", "xor");
			assert.ok(xorOp);

			assert.deepStrictEqual(xorOp.fn(boolVal(true), boolVal(false)), boolVal(true));
			assert.deepStrictEqual(xorOp.fn(boolVal(false), boolVal(false)), boolVal(false));
		});

		it("should satisfy A XOR true = NOT A", () => {
			const xorOp = lookupOperator(registry, "bool", "xor");
			const notOp = lookupOperator(registry, "bool", "not");
			assert.ok(xorOp && notOp);

			assert.deepStrictEqual(
				xorOp.fn(boolVal(true), boolVal(true)),
				notOp.fn(boolVal(true)),
			);
			assert.deepStrictEqual(
				xorOp.fn(boolVal(false), boolVal(true)),
				notOp.fn(boolVal(false)),
			);
		});

		it("should satisfy A XOR A = false", () => {
			const xorOp = lookupOperator(registry, "bool", "xor");
			assert.ok(xorOp);

			assert.deepStrictEqual(xorOp.fn(boolVal(true), boolVal(true)), boolVal(false));
			assert.deepStrictEqual(xorOp.fn(boolVal(false), boolVal(false)), boolVal(false));
		});
	});
});
