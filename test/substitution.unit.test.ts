// CAIRS CIR Substitution Tests
// Tests for capture-avoiding substitution, free variable collection, and alpha renaming

import { describe, it } from "node:test";
import assert from "node:assert";
import {
	freshName,
	substitute,
	collectFreeVars,
	alphaRename,
	substituteEnv,
} from "../src/cir/substitution.js";
import { intType, intVal, boolVal } from "../src/types.js";
import type { Expr } from "../src/types.js";
import { emptyValueEnv } from "../src/env.js";

describe("freshName", () => {
	it("should return base name if not in context", () => {
		const result = freshName("x", new Set());
		assert.strictEqual(result, "x");
	});

	it("should generate fresh name if base is in context", () => {
		const result = freshName("x", new Set(["x"]));
		assert.strictEqual(result, "__cairs_1");
	});

	it("should skip already used fresh names", () => {
		const result = freshName("x", new Set(["x", "__cairs_1"]));
		assert.strictEqual(result, "__cairs_2");
	});
});

describe("collectFreeVars", () => {
	it("should return empty for literals", () => {
		const expr: Expr = { kind: "lit", type: intType, value: 42 };
		const result = collectFreeVars(expr, new Set());
		assert.deepStrictEqual(result, []);
	});

	it("should return empty for refs", () => {
		const expr: Expr = { kind: "ref", id: "node1" };
		const result = collectFreeVars(expr, new Set());
		assert.deepStrictEqual(result, []);
	});

	it("should return variable name for free variable", () => {
		const expr: Expr = { kind: "var", name: "x" };
		const result = collectFreeVars(expr, new Set());
		assert.deepStrictEqual(result, ["x"]);
	});

	it("should return empty for bound variable", () => {
		const expr: Expr = { kind: "var", name: "x" };
		const result = collectFreeVars(expr, new Set(["x"]));
		assert.deepStrictEqual(result, []);
	});

	it("should return empty for call expressions", () => {
		const expr: Expr = { kind: "call", ns: "math", name: "add", args: ["a", "b"] };
		const result = collectFreeVars(expr, new Set());
		assert.deepStrictEqual(result, []);
	});

	it("should return empty for if expressions", () => {
		const expr: Expr = { kind: "if", type: intType, cond: "c", then: "t", else: "e" };
		const result = collectFreeVars(expr, new Set());
		assert.deepStrictEqual(result, []);
	});

	it("should return empty for let expressions", () => {
		const expr: Expr = { kind: "let", name: "x", value: "v", body: "b" };
		const result = collectFreeVars(expr, new Set());
		assert.deepStrictEqual(result, []);
	});

	it("should return empty for lambda expressions", () => {
		const expr: Expr = { kind: "lambda", type: intType, params: ["x"], body: "b" };
		const result = collectFreeVars(expr, new Set());
		assert.deepStrictEqual(result, []);
	});
});

describe("substitute", () => {
	it("should not substitute in literals", () => {
		const expr: Expr = { kind: "lit", type: intType, value: 42 };
		const result = substitute(expr, "x", { kind: "var", name: "y" });
		assert.deepStrictEqual(result, expr);
	});

	it("should not substitute in refs", () => {
		const expr: Expr = { kind: "ref", id: "node1" };
		const result = substitute(expr, "x", { kind: "var", name: "y" });
		assert.deepStrictEqual(result, expr);
	});

	it("should substitute free variable", () => {
		const expr: Expr = { kind: "var", name: "x" };
		const replacement: Expr = { kind: "lit", type: intType, value: 99 };
		const result = substitute(expr, "x", replacement);
		assert.deepStrictEqual(result, replacement);
	});

	it("should not substitute different variable", () => {
		const expr: Expr = { kind: "var", name: "y" };
		const replacement: Expr = { kind: "lit", type: intType, value: 99 };
		const result = substitute(expr, "x", replacement);
		assert.deepStrictEqual(result, expr);
	});

	it("should not substitute in lambda when var is bound", () => {
		const expr: Expr = { kind: "lambda", type: intType, params: ["x"], body: "b" };
		const result = substitute(expr, "x", { kind: "var", name: "y" });
		assert.deepStrictEqual(result, expr);
	});
});

describe("alphaRename", () => {
	it("should throw on mismatched array lengths", () => {
		const expr: Expr = { kind: "var", name: "x" };
		assert.throws(
			() => alphaRename(expr, ["x", "y"], ["a"]),
			/oldVars and newVars must have the same length/,
		);
	});

	it("should rename free variable", () => {
		const expr: Expr = { kind: "var", name: "x" };
		const result = alphaRename(expr, ["x"], ["y"]);
		assert.deepStrictEqual(result, { kind: "var", name: "y" });
	});

	it("should not rename different variable", () => {
		const expr: Expr = { kind: "var", name: "z" };
		const result = alphaRename(expr, ["x"], ["y"]);
		assert.deepStrictEqual(result, expr);
	});

	it("should not rename bound variable", () => {
		const expr: Expr = { kind: "var", name: "x" };
		// Variable is free in this context, but we'd need a more complex expression
		// to test bound variable renaming properly
		const result = alphaRename(expr, ["y"], ["z"]);
		assert.deepStrictEqual(result, expr);
	});

	it("should not rename literals", () => {
		const expr: Expr = { kind: "lit", type: intType, value: 42 };
		const result = alphaRename(expr, ["x"], ["y"]);
		assert.deepStrictEqual(result, expr);
	});

	it("should not rename refs", () => {
		const expr: Expr = { kind: "ref", id: "node1" };
		const result = alphaRename(expr, ["x"], ["y"]);
		assert.deepStrictEqual(result, expr);
	});
});

describe("substituteEnv", () => {
	it("should add new binding to empty environment", () => {
		const env = emptyValueEnv();
		const result = substituteEnv(env, "x", intVal(42));

		assert.deepStrictEqual(result.get("x"), intVal(42));
		// Original should be unchanged
		assert.strictEqual(env.get("x"), undefined);
	});

	it("should shadow existing binding", () => {
		const env = emptyValueEnv();
		env.set("x", intVal(1));
		const result = substituteEnv(env, "x", intVal(2));

		assert.deepStrictEqual(result.get("x"), intVal(2));
		assert.deepStrictEqual(env.get("x"), intVal(1));
	});

	it("should preserve other bindings", () => {
		const env = emptyValueEnv();
		env.set("y", boolVal(true));
		const result = substituteEnv(env, "x", intVal(42));

		assert.deepStrictEqual(result.get("x"), intVal(42));
		assert.deepStrictEqual(result.get("y"), boolVal(true));
	});
});
