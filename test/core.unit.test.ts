// SPIRAL Core Domain Unit Tests
// Tests for arithmetic and comparison operators

import assert from "node:assert";
import { describe, it } from "node:test";
import { createCoreRegistry } from "../src/domains/core.js";
import { lookupOperator } from "../src/domains/registry.js";
import {
	boolVal,
	errorVal,
	floatVal,
	intVal,
	isError,
	stringVal,
} from "../src/types.js";

describe("Core Domain - Arithmetic Operators", () => {
	const registry = createCoreRegistry();

	describe("add", () => {
		it("should add two integers", () => {
			const op = lookupOperator(registry, "core", "add");
			assert.ok(op);

			const result = op.fn(intVal(10), intVal(32));
			assert.deepStrictEqual(result, intVal(42));
		});

		it("should add negative integers", () => {
			const op = lookupOperator(registry, "core", "add");
			assert.ok(op);

			const result = op.fn(intVal(-10), intVal(52));
			assert.deepStrictEqual(result, intVal(42));
		});

		it("should add two floats", () => {
			const op = lookupOperator(registry, "core", "add");
			assert.ok(op);

			const result = op.fn(floatVal(1.5), floatVal(2.5));
			assert.deepStrictEqual(result, floatVal(4.0));
		});

		it("should return float when mixing int and float", () => {
			const op = lookupOperator(registry, "core", "add");
			assert.ok(op);

			const result = op.fn(intVal(1), floatVal(2.5));
			assert.strictEqual(result.kind, "float");
			assert.strictEqual((result as any).value, 3.5);
		});

		it("should propagate error from first argument", () => {
			const op = lookupOperator(registry, "core", "add");
			assert.ok(op);

			const err = errorVal("TestError", "test");
			const result = op.fn(err, intVal(1));
			assert.ok(isError(result));
		});

		it("should propagate error from second argument", () => {
			const op = lookupOperator(registry, "core", "add");
			assert.ok(op);

			const err = errorVal("TestError", "test");
			const result = op.fn(intVal(1), err);
			assert.ok(isError(result));
		});

		it("should handle zero", () => {
			const op = lookupOperator(registry, "core", "add");
			assert.ok(op);

			const result = op.fn(intVal(42), intVal(0));
			assert.deepStrictEqual(result, intVal(42));
		});
	});

	describe("sub", () => {
		it("should subtract two integers", () => {
			const op = lookupOperator(registry, "core", "sub");
			assert.ok(op);

			const result = op.fn(intVal(50), intVal(8));
			assert.deepStrictEqual(result, intVal(42));
		});

		it("should handle negative result", () => {
			const op = lookupOperator(registry, "core", "sub");
			assert.ok(op);

			const result = op.fn(intVal(10), intVal(20));
			assert.deepStrictEqual(result, intVal(-10));
		});

		it("should subtract floats", () => {
			const op = lookupOperator(registry, "core", "sub");
			assert.ok(op);

			const result = op.fn(floatVal(5.5), floatVal(2.5));
			assert.deepStrictEqual(result, floatVal(3.0));
		});

		it("should return float when mixing int and float", () => {
			const op = lookupOperator(registry, "core", "sub");
			assert.ok(op);

			const result = op.fn(intVal(5), floatVal(2.5));
			assert.strictEqual(result.kind, "float");
		});

		it("should propagate errors", () => {
			const op = lookupOperator(registry, "core", "sub");
			assert.ok(op);

			const err = errorVal("TestError", "test");
			assert.ok(isError(op.fn(err, intVal(1))));
			assert.ok(isError(op.fn(intVal(1), err)));
		});
	});

	describe("mul", () => {
		it("should multiply two integers", () => {
			const op = lookupOperator(registry, "core", "mul");
			assert.ok(op);

			const result = op.fn(intVal(6), intVal(7));
			assert.deepStrictEqual(result, intVal(42));
		});

		it("should handle zero", () => {
			const op = lookupOperator(registry, "core", "mul");
			assert.ok(op);

			const result = op.fn(intVal(42), intVal(0));
			assert.deepStrictEqual(result, intVal(0));
		});

		it("should handle negative numbers", () => {
			const op = lookupOperator(registry, "core", "mul");
			assert.ok(op);

			const result = op.fn(intVal(-6), intVal(7));
			assert.deepStrictEqual(result, intVal(-42));

			const result2 = op.fn(intVal(-6), intVal(-7));
			assert.deepStrictEqual(result2, intVal(42));
		});

		it("should multiply floats", () => {
			const op = lookupOperator(registry, "core", "mul");
			assert.ok(op);

			const result = op.fn(floatVal(2.5), floatVal(4.0));
			assert.deepStrictEqual(result, floatVal(10.0));
		});

		it("should return float when mixing int and float", () => {
			const op = lookupOperator(registry, "core", "mul");
			assert.ok(op);

			const result = op.fn(intVal(2), floatVal(2.5));
			assert.strictEqual(result.kind, "float");
		});

		it("should propagate errors", () => {
			const op = lookupOperator(registry, "core", "mul");
			assert.ok(op);

			const err = errorVal("TestError", "test");
			assert.ok(isError(op.fn(err, intVal(1))));
			assert.ok(isError(op.fn(intVal(1), err)));
		});
	});

	describe("div", () => {
		it("should divide two integers", () => {
			const op = lookupOperator(registry, "core", "div");
			assert.ok(op);

			const result = op.fn(intVal(84), intVal(2));
			assert.deepStrictEqual(result, intVal(42));
		});

		it("should truncate integer division", () => {
			const op = lookupOperator(registry, "core", "div");
			assert.ok(op);

			const result = op.fn(intVal(10), intVal(3));
			assert.deepStrictEqual(result, intVal(3));
		});

		it("should return error on division by zero", () => {
			const op = lookupOperator(registry, "core", "div");
			assert.ok(op);

			const result = op.fn(intVal(42), intVal(0));
			assert.ok(isError(result));
			if (isError(result)) {
				assert.strictEqual(result.code, "DivideByZero");
			}
		});

		it("should divide floats", () => {
			const op = lookupOperator(registry, "core", "div");
			assert.ok(op);

			const result = op.fn(floatVal(10.0), floatVal(4.0));
			assert.deepStrictEqual(result, floatVal(2.5));
		});

		it("should return error on float division by zero", () => {
			const op = lookupOperator(registry, "core", "div");
			assert.ok(op);

			const result = op.fn(floatVal(10.0), floatVal(0.0));
			assert.ok(isError(result));
		});

		it("should return float when mixing int and float", () => {
			const op = lookupOperator(registry, "core", "div");
			assert.ok(op);

			const result = op.fn(intVal(10), floatVal(4.0));
			assert.strictEqual(result.kind, "float");
		});

		it("should propagate errors", () => {
			const op = lookupOperator(registry, "core", "div");
			assert.ok(op);

			const err = errorVal("TestError", "test");
			assert.ok(isError(op.fn(err, intVal(1))));
			assert.ok(isError(op.fn(intVal(1), err)));
		});
	});

	describe("mod", () => {
		it("should compute modulo of two integers", () => {
			const op = lookupOperator(registry, "core", "mod");
			assert.ok(op);

			const result = op.fn(intVal(10), intVal(3));
			assert.deepStrictEqual(result, intVal(1));
		});

		it("should return zero when evenly divisible", () => {
			const op = lookupOperator(registry, "core", "mod");
			assert.ok(op);

			const result = op.fn(intVal(10), intVal(5));
			assert.deepStrictEqual(result, intVal(0));
		});

		it("should return error on modulo by zero", () => {
			const op = lookupOperator(registry, "core", "mod");
			assert.ok(op);

			const result = op.fn(intVal(10), intVal(0));
			assert.ok(isError(result));
			if (isError(result)) {
				assert.strictEqual(result.code, "DivideByZero");
			}
		});

		it("should handle negative numbers", () => {
			const op = lookupOperator(registry, "core", "mod");
			assert.ok(op);

			const result = op.fn(intVal(-10), intVal(3));
			assert.deepStrictEqual(result, intVal(-1));
		});

		it("should propagate errors", () => {
			const op = lookupOperator(registry, "core", "mod");
			assert.ok(op);

			const err = errorVal("TestError", "test");
			assert.ok(isError(op.fn(err, intVal(1))));
			assert.ok(isError(op.fn(intVal(1), err)));
		});
	});

	describe("pow", () => {
		it("should compute power of two integers", () => {
			const op = lookupOperator(registry, "core", "pow");
			assert.ok(op);

			const result = op.fn(intVal(2), intVal(10));
			assert.deepStrictEqual(result, intVal(1024));
		});

		it("should handle zero exponent", () => {
			const op = lookupOperator(registry, "core", "pow");
			assert.ok(op);

			const result = op.fn(intVal(5), intVal(0));
			assert.deepStrictEqual(result, intVal(1));
		});

		it("should handle one exponent", () => {
			const op = lookupOperator(registry, "core", "pow");
			assert.ok(op);

			const result = op.fn(intVal(5), intVal(1));
			assert.deepStrictEqual(result, intVal(5));
		});

		it("should compute power of floats", () => {
			const op = lookupOperator(registry, "core", "pow");
			assert.ok(op);

			const result = op.fn(floatVal(2.0), floatVal(3.0));
			assert.deepStrictEqual(result, floatVal(8.0));
		});

		it("should handle fractional exponents", () => {
			const op = lookupOperator(registry, "core", "pow");
			assert.ok(op);

			const result = op.fn(floatVal(4.0), floatVal(0.5));
			assert.strictEqual(result.kind, "float");
			assert.strictEqual((result as any).value, 2.0);
		});

		it("should return float when mixing int and float", () => {
			const op = lookupOperator(registry, "core", "pow");
			assert.ok(op);

			const result = op.fn(intVal(2), floatVal(3.0));
			assert.strictEqual(result.kind, "float");
		});

		it("should propagate errors", () => {
			const op = lookupOperator(registry, "core", "pow");
			assert.ok(op);

			const err = errorVal("TestError", "test");
			assert.ok(isError(op.fn(err, intVal(1))));
			assert.ok(isError(op.fn(intVal(1), err)));
		});
	});

	describe("neg", () => {
		it("should negate an integer", () => {
			const op = lookupOperator(registry, "core", "neg");
			assert.ok(op);

			const result = op.fn(intVal(42));
			assert.deepStrictEqual(result, intVal(-42));
		});

		it("should negate a negative integer", () => {
			const op = lookupOperator(registry, "core", "neg");
			assert.ok(op);

			const result = op.fn(intVal(-42));
			assert.deepStrictEqual(result, intVal(42));
		});

		it("should negate zero", () => {
			const op = lookupOperator(registry, "core", "neg");
			assert.ok(op);

			const result = op.fn(intVal(0));
			assert.strictEqual(result.kind, "int");
			// Note: -0 and 0 are equal with == but not with Object.is
			// Use == for numeric comparison which handles -0 === 0
			if (result.kind === "int") {
				assert.ok(result.value == 0, "Negation of 0 should equal 0");
			}
		});

		it("should negate a float", () => {
			const op = lookupOperator(registry, "core", "neg");
			assert.ok(op);

			const result = op.fn(floatVal(3.14));
			assert.deepStrictEqual(result, floatVal(-3.14));
		});

		it("should propagate errors", () => {
			const op = lookupOperator(registry, "core", "neg");
			assert.ok(op);

			const err = errorVal("TestError", "test");
			assert.ok(isError(op.fn(err)));
		});

		it("should return error for non-numeric value", () => {
			const op = lookupOperator(registry, "core", "neg");
			assert.ok(op);

			const result = op.fn(stringVal("hello"));
			assert.ok(isError(result));
		});
	});
});

describe("Core Domain - Comparison Operators", () => {
	const registry = createCoreRegistry();

	describe("eq", () => {
		it("should return true for equal integers", () => {
			const op = lookupOperator(registry, "core", "eq");
			assert.ok(op);

			const result = op.fn(intVal(42), intVal(42));
			assert.deepStrictEqual(result, boolVal(true));
		});

		it("should return false for unequal integers", () => {
			const op = lookupOperator(registry, "core", "eq");
			assert.ok(op);

			const result = op.fn(intVal(42), intVal(43));
			assert.deepStrictEqual(result, boolVal(false));
		});

		it("should compare floats", () => {
			const op = lookupOperator(registry, "core", "eq");
			assert.ok(op);

			assert.deepStrictEqual(op.fn(floatVal(3.14), floatVal(3.14)), boolVal(true));
			assert.deepStrictEqual(op.fn(floatVal(3.14), floatVal(3.15)), boolVal(false));
		});

		it("should compare strings", () => {
			const op = lookupOperator(registry, "core", "eq");
			assert.ok(op);

			assert.deepStrictEqual(op.fn(stringVal("hello"), stringVal("hello")), boolVal(true));
			assert.deepStrictEqual(op.fn(stringVal("hello"), stringVal("world")), boolVal(false));
		});

		it("should compare int and float numerically", () => {
			const op = lookupOperator(registry, "core", "eq");
			assert.ok(op);

			const result = op.fn(intVal(3), floatVal(3.0));
			assert.deepStrictEqual(result, boolVal(true));
		});

		it("should propagate errors", () => {
			const op = lookupOperator(registry, "core", "eq");
			assert.ok(op);

			const err = errorVal("TestError", "test");
			assert.ok(isError(op.fn(err, intVal(1))));
			assert.ok(isError(op.fn(intVal(1), err)));
		});
	});

	describe("neq", () => {
		it("should return false for equal integers", () => {
			const op = lookupOperator(registry, "core", "neq");
			assert.ok(op);

			const result = op.fn(intVal(42), intVal(42));
			assert.deepStrictEqual(result, boolVal(false));
		});

		it("should return true for unequal integers", () => {
			const op = lookupOperator(registry, "core", "neq");
			assert.ok(op);

			const result = op.fn(intVal(42), intVal(43));
			assert.deepStrictEqual(result, boolVal(true));
		});

		it("should compare floats", () => {
			const op = lookupOperator(registry, "core", "neq");
			assert.ok(op);

			assert.deepStrictEqual(op.fn(floatVal(3.14), floatVal(3.14)), boolVal(false));
			assert.deepStrictEqual(op.fn(floatVal(3.14), floatVal(3.15)), boolVal(true));
		});

		it("should compare strings", () => {
			const op = lookupOperator(registry, "core", "neq");
			assert.ok(op);

			assert.deepStrictEqual(op.fn(stringVal("hello"), stringVal("hello")), boolVal(false));
			assert.deepStrictEqual(op.fn(stringVal("hello"), stringVal("world")), boolVal(true));
		});

		it("should propagate errors", () => {
			const op = lookupOperator(registry, "core", "neq");
			assert.ok(op);

			const err = errorVal("TestError", "test");
			assert.ok(isError(op.fn(err, intVal(1))));
			assert.ok(isError(op.fn(intVal(1), err)));
		});
	});

	describe("lt", () => {
		it("should return true when first is less than second", () => {
			const op = lookupOperator(registry, "core", "lt");
			assert.ok(op);

			const result = op.fn(intVal(10), intVal(20));
			assert.deepStrictEqual(result, boolVal(true));
		});

		it("should return false when first equals second", () => {
			const op = lookupOperator(registry, "core", "lt");
			assert.ok(op);

			const result = op.fn(intVal(10), intVal(10));
			assert.deepStrictEqual(result, boolVal(false));
		});

		it("should return false when first is greater than second", () => {
			const op = lookupOperator(registry, "core", "lt");
			assert.ok(op);

			const result = op.fn(intVal(20), intVal(10));
			assert.deepStrictEqual(result, boolVal(false));
		});

		it("should compare floats", () => {
			const op = lookupOperator(registry, "core", "lt");
			assert.ok(op);

			assert.deepStrictEqual(op.fn(floatVal(3.14), floatVal(3.15)), boolVal(true));
			assert.deepStrictEqual(op.fn(floatVal(3.15), floatVal(3.14)), boolVal(false));
		});

		it("should compare int and float", () => {
			const op = lookupOperator(registry, "core", "lt");
			assert.ok(op);

			const result = op.fn(intVal(3), floatVal(3.5));
			assert.deepStrictEqual(result, boolVal(true));
		});

		it("should propagate errors", () => {
			const op = lookupOperator(registry, "core", "lt");
			assert.ok(op);

			const err = errorVal("TestError", "test");
			assert.ok(isError(op.fn(err, intVal(1))));
			assert.ok(isError(op.fn(intVal(1), err)));
		});
	});

	describe("lte", () => {
		it("should return true when first is less than second", () => {
			const op = lookupOperator(registry, "core", "lte");
			assert.ok(op);

			const result = op.fn(intVal(10), intVal(20));
			assert.deepStrictEqual(result, boolVal(true));
		});

		it("should return true when first equals second", () => {
			const op = lookupOperator(registry, "core", "lte");
			assert.ok(op);

			const result = op.fn(intVal(10), intVal(10));
			assert.deepStrictEqual(result, boolVal(true));
		});

		it("should return false when first is greater than second", () => {
			const op = lookupOperator(registry, "core", "lte");
			assert.ok(op);

			const result = op.fn(intVal(20), intVal(10));
			assert.deepStrictEqual(result, boolVal(false));
		});

		it("should compare floats", () => {
			const op = lookupOperator(registry, "core", "lte");
			assert.ok(op);

			assert.deepStrictEqual(op.fn(floatVal(3.14), floatVal(3.14)), boolVal(true));
			assert.deepStrictEqual(op.fn(floatVal(3.14), floatVal(3.15)), boolVal(true));
			assert.deepStrictEqual(op.fn(floatVal(3.15), floatVal(3.14)), boolVal(false));
		});

		it("should propagate errors", () => {
			const op = lookupOperator(registry, "core", "lte");
			assert.ok(op);

			const err = errorVal("TestError", "test");
			assert.ok(isError(op.fn(err, intVal(1))));
			assert.ok(isError(op.fn(intVal(1), err)));
		});
	});

	describe("gt", () => {
		it("should return true when first is greater than second", () => {
			const op = lookupOperator(registry, "core", "gt");
			assert.ok(op);

			const result = op.fn(intVal(20), intVal(10));
			assert.deepStrictEqual(result, boolVal(true));
		});

		it("should return false when first equals second", () => {
			const op = lookupOperator(registry, "core", "gt");
			assert.ok(op);

			const result = op.fn(intVal(10), intVal(10));
			assert.deepStrictEqual(result, boolVal(false));
		});

		it("should return false when first is less than second", () => {
			const op = lookupOperator(registry, "core", "gt");
			assert.ok(op);

			const result = op.fn(intVal(10), intVal(20));
			assert.deepStrictEqual(result, boolVal(false));
		});

		it("should compare floats", () => {
			const op = lookupOperator(registry, "core", "gt");
			assert.ok(op);

			assert.deepStrictEqual(op.fn(floatVal(3.15), floatVal(3.14)), boolVal(true));
			assert.deepStrictEqual(op.fn(floatVal(3.14), floatVal(3.15)), boolVal(false));
		});

		it("should propagate errors", () => {
			const op = lookupOperator(registry, "core", "gt");
			assert.ok(op);

			const err = errorVal("TestError", "test");
			assert.ok(isError(op.fn(err, intVal(1))));
			assert.ok(isError(op.fn(intVal(1), err)));
		});
	});

	describe("gte", () => {
		it("should return true when first is greater than second", () => {
			const op = lookupOperator(registry, "core", "gte");
			assert.ok(op);

			const result = op.fn(intVal(20), intVal(10));
			assert.deepStrictEqual(result, boolVal(true));
		});

		it("should return true when first equals second", () => {
			const op = lookupOperator(registry, "core", "gte");
			assert.ok(op);

			const result = op.fn(intVal(10), intVal(10));
			assert.deepStrictEqual(result, boolVal(true));
		});

		it("should return false when first is less than second", () => {
			const op = lookupOperator(registry, "core", "gte");
			assert.ok(op);

			const result = op.fn(intVal(10), intVal(20));
			assert.deepStrictEqual(result, boolVal(false));
		});

		it("should compare floats", () => {
			const op = lookupOperator(registry, "core", "gte");
			assert.ok(op);

			assert.deepStrictEqual(op.fn(floatVal(3.14), floatVal(3.14)), boolVal(true));
			assert.deepStrictEqual(op.fn(floatVal(3.15), floatVal(3.14)), boolVal(true));
			assert.deepStrictEqual(op.fn(floatVal(3.14), floatVal(3.15)), boolVal(false));
		});

		it("should propagate errors", () => {
			const op = lookupOperator(registry, "core", "gte");
			assert.ok(op);

			const err = errorVal("TestError", "test");
			assert.ok(isError(op.fn(err, intVal(1))));
			assert.ok(isError(op.fn(intVal(1), err)));
		});
	});
});

describe("createCoreRegistry", () => {
	it("should create registry with all arithmetic operators", () => {
		const registry = createCoreRegistry();

		assert.ok(lookupOperator(registry, "core", "add"));
		assert.ok(lookupOperator(registry, "core", "sub"));
		assert.ok(lookupOperator(registry, "core", "mul"));
		assert.ok(lookupOperator(registry, "core", "div"));
		assert.ok(lookupOperator(registry, "core", "mod"));
		assert.ok(lookupOperator(registry, "core", "pow"));
		assert.ok(lookupOperator(registry, "core", "neg"));
	});

	it("should create registry with all comparison operators", () => {
		const registry = createCoreRegistry();

		assert.ok(lookupOperator(registry, "core", "eq"));
		assert.ok(lookupOperator(registry, "core", "neq"));
		assert.ok(lookupOperator(registry, "core", "lt"));
		assert.ok(lookupOperator(registry, "core", "lte"));
		assert.ok(lookupOperator(registry, "core", "gt"));
		assert.ok(lookupOperator(registry, "core", "gte"));
	});

	it("should mark all operators as pure", () => {
		const registry = createCoreRegistry();

		const add = lookupOperator(registry, "core", "add");
		assert.ok(add);
		assert.strictEqual(add.pure, true);

		const eq = lookupOperator(registry, "core", "eq");
		assert.ok(eq);
		assert.strictEqual(eq.pure, true);
	});
});
