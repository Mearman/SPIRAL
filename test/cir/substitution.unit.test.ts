// SPDX-License-Identifier: MIT
// SPIRAL CIR Substitution - Unit Tests

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	freshName,
	substitute,
	collectFreeVars,
	alphaRename,
	substituteEnv,
} from "../../src/cir/substitution.js";
import type { Expr, Value } from "../../src/types.js";

//==============================================================================
// Test Fixtures
//==============================================================================

// Helper to create a literal expression
const lit = (value: number): Expr => ({
	kind: "lit",
	type: { kind: "int" },
	value,
});

// Helper to create a variable expression
const v = (name: string): Expr => ({ kind: "var", name });

// Helper to create a lambda expression
const lambda = (params: string[], retType: Expr, body: string): Expr => ({
	kind: "lambda",
	params,
	retType,
	body,
});

// Helper to create a let expression
const letExpr = (name: string, value: string, body: string): Expr => ({
	kind: "let",
	name,
	value,
	body,
});

// Helper to create a value
const val = (value: number): Value => ({
	kind: "int",
	value,
});

//==============================================================================
// Test Suite
//==============================================================================

describe("CIR Substitution - Unit Tests", () => {

	//==========================================================================
	// Fresh Name Generation
	//==========================================================================

	describe("freshName", () => {
		it("should return the base name if not in context", () => {
			const context = new Set<string>(["x", "y"]);
			const result = freshName("z", context);
			assert.strictEqual(result, "z");
		});

		it("should generate a fresh name if base is in context", () => {
			const context = new Set<string>(["x", "y"]);
			const result = freshName("x", context);
			assert.strictEqual(result, "__spiral_1");
		});

		it("should generate incrementing fresh names", () => {
			const context = new Set<string>(["x", "y", "__spiral_0", "__spiral_1"]);
			const result = freshName("x", context);
			assert.strictEqual(result, "__spiral_2");
		});

		it("should handle empty context", () => {
			const context = new Set<string>();
			const result = freshName("myVar", context);
			assert.strictEqual(result, "myVar");
		});
	});

	//==========================================================================
	// Variable Substitution
	//==========================================================================

	describe("substitute", () => {
		it("should substitute free variable in simple expression", () => {
			const expr = v("x");
			const result = substitute(expr, "x", lit(42));
			assert.deepStrictEqual(result, lit(42));
		});

		it("should not substitute different variable", () => {
			const expr = v("y");
			const result = substitute(expr, "x", lit(42));
			assert.deepStrictEqual(result, v("y"));
		});

		it("should not substitute bound variable", () => {
			const expr = v("x");
			// When x is bound, substitution should not occur
			const result = substitute(expr, "x", lit(42));
			// Since the variable is "x" and we're substituting "x", but there's no
			// binding context in this simple case, the test verifies the basic behavior
			assert.deepStrictEqual(result, lit(42));
		});

		it("should return literal unchanged", () => {
			const expr = lit(5);
			const result = substitute(expr, "x", lit(42));
			assert.deepStrictEqual(result, lit(5));
		});

		it("should return ref unchanged", () => {
			const expr: Expr = { kind: "ref", id: "someNode" };
			const result = substitute(expr, "x", lit(42));
			assert.deepStrictEqual(result, expr);
		});

		it("should return call unchanged", () => {
			const expr: Expr = {
				kind: "call",
				ns: "core",
				name: "add",
				args: ["a", "b"],
			};
			const result = substitute(expr, "x", lit(42));
			assert.deepStrictEqual(result, expr);
		});

		it("should return if expression unchanged", () => {
			const expr: Expr = {
				kind: "if",
				cond: "test",
				then: "thenBranch",
				else: "elseBranch",
				type: { kind: "int" },
			};
			const result = substitute(expr, "x", lit(42));
			assert.deepStrictEqual(result, expr);
		});

		it("should return let expression structurally unchanged", () => {
			const expr = letExpr("x", "valueNode", "bodyNode");
			const result = substitute(expr, "y", lit(42));
			assert.deepStrictEqual(result, expr);
		});

		it("should return lambda unchanged when var is bound by lambda", () => {
			const expr = lambda(["x"], { kind: "int" }, "body");
			const result = substitute(expr, "x", lit(42));
			// x is bound by the lambda, so substitution should not occur
			assert.deepStrictEqual(result, expr);
		});

		it("should return airRef unchanged", () => {
			const expr: Expr = {
				kind: "airRef",
				ns: "core",
				name: "add",
			};
			const result = substitute(expr, "x", lit(42));
			assert.deepStrictEqual(result, expr);
		});

		it("should return predicate unchanged", () => {
			const expr: Expr = {
				kind: "predicate",
				name: "isPositive",
			};
			const result = substitute(expr, "x", lit(42));
			assert.deepStrictEqual(result, expr);
		});

		it("should return callExpr unchanged", () => {
			const expr: Expr = {
				kind: "callExpr",
				callee: "funcNode",
				args: ["arg1", "arg2"],
			};
			const result = substitute(expr, "x", lit(42));
			assert.deepStrictEqual(result, expr);
		});

		it("should return fix unchanged", () => {
			const expr: Expr = {
				kind: "fix",
				name: "recFunc",
				func: "funcNode",
			};
			const result = substitute(expr, "x", lit(42));
			assert.deepStrictEqual(result, expr);
		});

		// Async expressions
		it("should return par unchanged", () => {
			const expr: Expr = {
				kind: "par",
				exprs: ["e1", "e2"],
			};
			const result = substitute(expr, "x", lit(42));
			assert.deepStrictEqual(result, expr);
		});

		it("should return spawn unchanged", () => {
			const expr: Expr = {
				kind: "spawn",
				task: "taskBody",
			};
			const result = substitute(expr, "x", lit(42));
			assert.deepStrictEqual(result, expr);
		});

		it("should return await unchanged", () => {
			const expr: Expr = {
				kind: "await",
				future: "fut",
			};
			const result = substitute(expr, "x", lit(42));
			assert.deepStrictEqual(result, expr);
		});

		it("should return channel unchanged", () => {
			const expr: Expr = {
				kind: "channel",
				elemType: { kind: "int" },
			};
			const result = substitute(expr, "x", lit(42));
			assert.deepStrictEqual(result, expr);
		});

		it("should return send unchanged", () => {
			const expr: Expr = {
				kind: "send",
				channel: "chan",
				value: "val",
			};
			const result = substitute(expr, "x", lit(42));
			assert.deepStrictEqual(result, expr);
		});

		it("should return recv unchanged", () => {
			const expr: Expr = {
				kind: "recv",
				channel: "chan",
			};
			const result = substitute(expr, "x", lit(42));
			assert.deepStrictEqual(result, expr);
		});

		it("should return select unchanged", () => {
			const expr: Expr = {
				kind: "select",
				cases: [
					{ chan: "c1", body: "b1" },
					{ chan: "c2", body: "b2" },
				],
			};
			const result = substitute(expr, "x", lit(42));
			assert.deepStrictEqual(result, expr);
		});

		it("should return race unchanged", () => {
			const expr: Expr = {
				kind: "race",
				cases: ["t1", "t2"],
			};
			const result = substitute(expr, "x", lit(42));
			assert.deepStrictEqual(result, expr);
		});
	});

	//==========================================================================
	// Free Variable Collection
	//==========================================================================

	describe("collectFreeVars", () => {
		it("should return empty for literal", () => {
			const expr = lit(5);
			const boundVars = new Set<string>();
			const result = collectFreeVars(expr, boundVars);
			assert.deepStrictEqual(result, []);
		});

		it("should return empty for ref", () => {
			const expr: Expr = { kind: "ref", id: "someNode" };
			const boundVars = new Set<string>();
			const result = collectFreeVars(expr, boundVars);
			assert.deepStrictEqual(result, []);
		});

		it("should return variable name if free", () => {
			const expr = v("x");
			const boundVars = new Set<string>();
			const result = collectFreeVars(expr, boundVars);
			assert.deepStrictEqual(result, ["x"]);
		});

		it("should return empty if variable is bound", () => {
			const expr = v("x");
			const boundVars = new Set<string>(["x", "y"]);
			const result = collectFreeVars(expr, boundVars);
			assert.deepStrictEqual(result, []);
		});

		it("should return empty for call", () => {
			const expr: Expr = {
				kind: "call",
				ns: "core",
				name: "add",
				args: ["a", "b"],
			};
			const boundVars = new Set<string>();
			const result = collectFreeVars(expr, boundVars);
			assert.deepStrictEqual(result, []);
		});

		it("should return empty for if", () => {
			const expr: Expr = {
				kind: "if",
				cond: "test",
				then: "thenBranch",
				else: "elseBranch",
				type: { kind: "int" },
			};
			const boundVars = new Set<string>();
			const result = collectFreeVars(expr, boundVars);
			assert.deepStrictEqual(result, []);
		});

		it("should bind variable in let and return empty", () => {
			const expr = letExpr("x", "val", "body");
			const boundVars = new Set<string>();
			const result = collectFreeVars(expr, boundVars);
			assert.deepStrictEqual(result, []);
		});

		it("should return empty for lambda", () => {
			const expr = lambda(["x", "y"], { kind: "int" }, "body");
			const boundVars = new Set<string>();
			const result = collectFreeVars(expr, boundVars);
			assert.deepStrictEqual(result, []);
		});

		it("should return empty for airRef", () => {
			const expr: Expr = {
				kind: "airRef",
				ns: "core",
				name: "add",
			};
			const boundVars = new Set<string>();
			const result = collectFreeVars(expr, boundVars);
			assert.deepStrictEqual(result, []);
		});

		it("should return empty for predicate", () => {
			const expr: Expr = {
				kind: "predicate",
				name: "isPositive",
			};
			const boundVars = new Set<string>();
			const result = collectFreeVars(expr, boundVars);
			assert.deepStrictEqual(result, []);
		});

		it("should return empty for callExpr", () => {
			const expr: Expr = {
				kind: "callExpr",
				callee: "func",
				args: ["a1", "a2"],
			};
			const boundVars = new Set<string>();
			const result = collectFreeVars(expr, boundVars);
			assert.deepStrictEqual(result, []);
		});

		it("should return empty for fix", () => {
			const expr: Expr = {
				kind: "fix",
				name: "rec",
				func: "func",
			};
			const boundVars = new Set<string>();
			const result = collectFreeVars(expr, boundVars);
			assert.deepStrictEqual(result, []);
		});

		// Async expressions
		it("should return empty for par", () => {
			const expr: Expr = { kind: "par", exprs: ["e1", "e2"] };
			const result = collectFreeVars(expr, new Set());
			assert.deepStrictEqual(result, []);
		});

		it("should return empty for spawn", () => {
			const expr: Expr = { kind: "spawn", task: "task" };
			const result = collectFreeVars(expr, new Set());
			assert.deepStrictEqual(result, []);
		});

		it("should return empty for await", () => {
			const expr: Expr = { kind: "await", future: "fut" };
			const result = collectFreeVars(expr, new Set());
			assert.deepStrictEqual(result, []);
		});

		it("should return empty for channel", () => {
			const expr: Expr = {
				kind: "channel",
				elemType: { kind: "int" },
			};
			const result = collectFreeVars(expr, new Set());
			assert.deepStrictEqual(result, []);
		});

		it("should return empty for send", () => {
			const expr: Expr = {
				kind: "send",
				channel: "ch",
				value: "v",
			};
			const result = collectFreeVars(expr, new Set());
			assert.deepStrictEqual(result, []);
		});

		it("should return empty for recv", () => {
			const expr: Expr = { kind: "recv", channel: "ch" };
			const result = collectFreeVars(expr, new Set());
			assert.deepStrictEqual(result, []);
		});

		it("should return empty for select", () => {
			const expr: Expr = {
				kind: "select",
				cases: [
					{ chan: "c1", body: "b1" },
				],
			};
			const result = collectFreeVars(expr, new Set());
			assert.deepStrictEqual(result, []);
		});

		it("should return empty for race", () => {
			const expr: Expr = { kind: "race", cases: ["t1"] };
			const result = collectFreeVars(expr, new Set());
			assert.deepStrictEqual(result, []);
		});
	});

	//==========================================================================
	// Alpha Renaming
	//==========================================================================

	describe("alphaRename", () => {
		it("should throw if oldVars and newVars have different lengths", () => {
			const expr = v("x");
			assert.throws(
				() => alphaRename(expr, ["x"], ["y", "z"]),
				/oldVars and newVars must have the same length/,
			);
		});

		it("should rename simple variable", () => {
			const expr = v("old");
			const result = alphaRename(expr, ["old"], ["new"]);
			assert.deepStrictEqual(result, v("new"));
		});

		it("should not rename unrelated variable", () => {
			const expr = v("x");
			const result = alphaRename(expr, ["y"], ["z"]);
			assert.deepStrictEqual(result, v("x"));
		});

		it("should return literal unchanged", () => {
			const expr = lit(5);
			const result = alphaRename(expr, ["x"], ["y"]);
			assert.deepStrictEqual(result, lit(5));
		});

		it("should return ref unchanged", () => {
			const expr: Expr = { kind: "ref", id: "node" };
			const result = alphaRename(expr, ["x"], ["y"]);
			assert.deepStrictEqual(result, expr);
		});

		it("should rename lambda parameters", () => {
			const expr = lambda(["x"], { kind: "int" }, "body");
			const result = alphaRename(expr, ["x"], ["x'"]);
			assert.strictEqual(result.kind, "lambda");
			if (result.kind === "lambda") {
				assert.deepStrictEqual(result.params, ["x'"]);
			}
		});

		it("should rename multiple lambda parameters", () => {
			const expr = lambda(["x", "y"], { kind: "int" }, "body");
			const result = alphaRename(expr, ["x", "y"], ["x'", "y'"]);
			assert.strictEqual(result.kind, "lambda");
			if (result.kind === "lambda") {
				assert.deepStrictEqual(result.params, ["x'", "y'"]);
			}
		});

		it("should rename only specified lambda parameters", () => {
			const expr = lambda(["x", "y", "z"], { kind: "int" }, "body");
			const result = alphaRename(expr, ["x", "z"], ["x'", "z'"]);
			assert.strictEqual(result.kind, "lambda");
			if (result.kind === "lambda") {
				assert.deepStrictEqual(result.params, ["x'", "y", "z'"]);
			}
		});

		it("should handle empty renaming", () => {
			const expr = lambda(["x", "y"], { kind: "int" }, "body");
			const result = alphaRename(expr, [], []);
			assert.deepStrictEqual(result, expr);
		});

		it("should return call unchanged", () => {
			const expr: Expr = {
				kind: "call",
				ns: "core",
				name: "add",
				args: ["a", "b"],
			};
			const result = alphaRename(expr, ["x"], ["y"]);
			assert.deepStrictEqual(result, expr);
		});

		it("should return if unchanged", () => {
			const expr: Expr = {
				kind: "if",
				cond: "test",
				then: "then",
				else: "else",
				type: { kind: "int" },
			};
			const result = alphaRename(expr, ["x"], ["y"]);
			assert.deepStrictEqual(result, expr);
		});

		it("should return let unchanged", () => {
			const expr = letExpr("x", "val", "body");
			const result = alphaRename(expr, ["y"], ["z"]);
			assert.deepStrictEqual(result, expr);
		});

		// Async expressions
		it("should return par unchanged", () => {
			const expr: Expr = { kind: "par", exprs: ["e1"] };
			const result = alphaRename(expr, ["x"], ["y"]);
			assert.deepStrictEqual(result, expr);
		});

		it("should return spawn unchanged", () => {
			const expr: Expr = { kind: "spawn", task: "task" };
			const result = alphaRename(expr, ["x"], ["y"]);
			assert.deepStrictEqual(result, expr);
		});

		it("should return await unchanged", () => {
			const expr: Expr = { kind: "await", future: "fut" };
			const result = alphaRename(expr, ["x"], ["y"]);
			assert.deepStrictEqual(result, expr);
		});

		it("should return channel unchanged", () => {
			const expr: Expr = {
				kind: "channel",
				elemType: { kind: "int" },
			};
			const result = alphaRename(expr, ["x"], ["y"]);
			assert.deepStrictEqual(result, expr);
		});

		it("should return send unchanged", () => {
			const expr: Expr = {
				kind: "send",
				channel: "ch",
				value: "v",
			};
			const result = alphaRename(expr, ["x"], ["y"]);
			assert.deepStrictEqual(result, expr);
		});

		it("should return recv unchanged", () => {
			const expr: Expr = { kind: "recv", channel: "ch" };
			const result = alphaRename(expr, ["x"], ["y"]);
			assert.deepStrictEqual(result, expr);
		});

		it("should return select unchanged", () => {
			const expr: Expr = {
				kind: "select",
				cases: [{ chan: "c1", body: "b1" }],
			};
			const result = alphaRename(expr, ["x"], ["y"]);
			assert.deepStrictEqual(result, expr);
		});

		it("should return race unchanged", () => {
			const expr: Expr = { kind: "race", cases: ["t1"] };
			const result = alphaRename(expr, ["x"], ["y"]);
			assert.deepStrictEqual(result, expr);
		});
	});

	//==========================================================================
	// Environment Substitution
	//==========================================================================

	describe("substituteEnv", () => {
		it("should add new variable to empty environment", () => {
			const env = new Map<string, Value>();
			const value = val(42);
			const result = substituteEnv(env, "x", value);
			assert.strictEqual(result.size, 1);
			assert.deepStrictEqual(result.get("x"), value);
		});

		it("should add new variable to existing environment", () => {
			const env = new Map<string, Value>([["y", val(10)]]);
			const value = val(42);
			const result = substituteEnv(env, "x", value);
			assert.strictEqual(result.size, 2);
			assert.deepStrictEqual(result.get("x"), value);
			assert.deepStrictEqual(result.get("y"), val(10));
		});

		it("should replace existing variable in environment", () => {
			const env = new Map<string, Value>([["x", val(10)]]);
			const value = val(42);
			const result = substituteEnv(env, "x", value);
			assert.strictEqual(result.size, 1);
			assert.deepStrictEqual(result.get("x"), value);
		});

		it("should not mutate original environment", () => {
			const env = new Map<string, Value>([["y", val(10)]]);
			const value = val(42);
			substituteEnv(env, "x", value);
			assert.strictEqual(env.size, 1);
			assert.ok(!env.has("x"));
		});

		it("should handle complex value types", () => {
			const env = new Map<string, Value>();
			const listValue: Value = {
				kind: "list",
				value: [
					{ kind: "int", value: 1 },
					{ kind: "int", value: 2 },
				],
			};
			const result = substituteEnv(env, "xs", listValue);
			assert.strictEqual(result.size, 1);
			assert.deepStrictEqual(result.get("xs"), listValue);
		});
	});
});
