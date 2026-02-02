import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { Evaluator, evaluateProgram } from "../src/evaluator.js";
import { createKernelRegistry } from "../src/stdlib/kernel.js";
import { emptyValueEnv, extendValueEnv, emptyDefs } from "../src/env.js";
import type { ValueEnv } from "../src/env.js";
import type { Expr, AIRDocument, Value } from "../src/types.js";
import {
	boolVal,
	floatVal,
	intVal,
	isError,
	listVal,
	opaqueVal,
	optionVal,
	stringVal,
	voidVal,
} from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const registry = createKernelRegistry();
const defs = emptyDefs();

function ev(expr: Expr, env: ValueEnv = emptyValueEnv()): Value {
	return new Evaluator(registry, defs).evaluate(expr, env);
}

function lit(type: { kind: string; [k: string]: unknown }, value: unknown): Expr {
	return { kind: "lit", type, value } as Expr;
}

function makeDoc(
	nodes: { id: string; expr: Expr }[],
	result: string,
): AIRDocument {
	return {
		version: "1.0",
		airDefs: [],
		nodes,
		result,
	};
}

// ===========================================================================
// 1. evalLit switch branches
// ===========================================================================
describe("evalLit", () => {
	it("void literal", () => {
		assert.deepEqual(ev(lit({ kind: "void" }, null)), voidVal());
	});

	it("bool literal true", () => {
		assert.deepEqual(ev(lit({ kind: "bool" }, true)), boolVal(true));
	});

	it("bool literal false", () => {
		assert.deepEqual(ev(lit({ kind: "bool" }, false)), boolVal(false));
	});

	it("int literal", () => {
		assert.deepEqual(ev(lit({ kind: "int" }, 42)), intVal(42));
	});

	it("float literal", () => {
		assert.deepEqual(ev(lit({ kind: "float" }, 3.14)), floatVal(3.14));
	});

	it("string literal", () => {
		assert.deepEqual(ev(lit({ kind: "string" }, "hello")), stringVal("hello"));
	});

	it("list literal with raw primitives", () => {
		const result = ev(lit({ kind: "list", of: { kind: "int" } }, [1, 2, 3]));
		assert.deepEqual(result, listVal([intVal(1), intVal(2), intVal(3)]));
	});

	it("list literal with Value objects", () => {
		const result = ev(
			lit({ kind: "list", of: { kind: "int" } }, [
				{ kind: "int", value: 10 },
				{ kind: "int", value: 20 },
			]),
		);
		assert.deepEqual(result, listVal([intVal(10), intVal(20)]));
	});

	it("list literal non-array returns error", () => {
		const result = ev(lit({ kind: "list", of: { kind: "int" } }, "not-array"));
		assert.equal(isError(result), true);
	});

	it("set literal non-array returns error", () => {
		const result = ev(lit({ kind: "set", of: { kind: "int" } }, "not-array"));
		assert.equal(isError(result), true);
	});

	it("map literal non-array returns error", () => {
		const result = ev(
			lit({ kind: "map", key: { kind: "string" }, value: { kind: "int" } }, "not-array"),
		);
		assert.equal(isError(result), true);
	});

	it("option literal null", () => {
		assert.deepEqual(
			ev(lit({ kind: "option", of: { kind: "int" } }, null)),
			optionVal(null),
		);
	});

	it("option literal with value", () => {
		const inner = intVal(7);
		assert.deepEqual(
			ev(lit({ kind: "option", of: { kind: "int" } }, inner)),
			optionVal(inner),
		);
	});

	it("opaque literal", () => {
		const result = ev(lit({ kind: "opaque", name: "Token" }, "abc"));
		assert.deepEqual(result, opaqueVal("Token", "abc"));
	});

	it("unsupported type returns error", () => {
		// fn type is not handled in evalLit
		const result = ev(
			lit({ kind: "fn", params: [], returns: { kind: "int" } }, null),
		);
		assert.equal(isError(result), true);
	});
});

// ===========================================================================
// 2. evalVar
// ===========================================================================
describe("evalVar", () => {
	it("bound variable", () => {
		const env = extendValueEnv(emptyValueEnv(), "x", intVal(99));
		const result = ev({ kind: "var", name: "x" } as Expr, env);
		assert.deepEqual(result, intVal(99));
	});

	it("unbound variable returns error", () => {
		const result = ev({ kind: "var", name: "missing" } as Expr);
		assert.equal(isError(result), true);
		if (result.kind === "error") {
			assert.equal(result.code, "UnboundIdentifier");
		}
	});
});

// ===========================================================================
// 3. evalCall inline
// ===========================================================================
describe("evalCall inline", () => {
	it("call with inline literal args", () => {
		const expr: Expr = {
			kind: "call",
			ns: "core",
			name: "add",
			args: [
				lit({ kind: "int" }, 3),
				lit({ kind: "int" }, 4),
			],
		} as unknown as Expr;
		assert.deepEqual(ev(expr), intVal(7));
	});

	it("call propagates arg error", () => {
		// An error literal as an arg (we create an inner call that errors)
		const badArg: Expr = { kind: "var", name: "nope" } as Expr;
		const expr: Expr = {
			kind: "call",
			ns: "core",
			name: "add",
			args: [badArg, lit({ kind: "int" }, 1)],
		} as unknown as Expr;
		const result = ev(expr);
		assert.equal(isError(result), true);
	});

	it("unbound string arg returns error", () => {
		// Mix: one inline expr to avoid "must be resolved during program eval" and one string ref
		const expr: Expr = {
			kind: "call",
			ns: "core",
			name: "add",
			args: ["missing_ref", lit({ kind: "int" }, 1)],
		} as unknown as Expr;
		const result = ev(expr);
		assert.equal(isError(result), true);
		if (result.kind === "error") {
			assert.equal(result.code, "UnboundIdentifier");
		}
	});

	it("unknown operator returns error", () => {
		const expr: Expr = {
			kind: "call",
			ns: "core",
			name: "nonexistent_op",
			args: [lit({ kind: "int" }, 1)],
		} as unknown as Expr;
		const result = ev(expr);
		assert.equal(isError(result), true);
		if (result.kind === "error") {
			assert.equal(result.code, "UnknownOperator");
		}
	});

	it("arity mismatch returns error", () => {
		const expr: Expr = {
			kind: "call",
			ns: "core",
			name: "add",
			args: [lit({ kind: "int" }, 1)],
		} as unknown as Expr;
		const result = ev(expr);
		assert.equal(isError(result), true);
		if (result.kind === "error") {
			assert.equal(result.code, "ArityError");
		}
	});
});

// ===========================================================================
// 4. evalIf inline
// ===========================================================================
describe("evalIf inline", () => {
	it("true branch", () => {
		const expr: Expr = {
			kind: "if",
			cond: lit({ kind: "bool" }, true),
			then: lit({ kind: "int" }, 1),
			else: lit({ kind: "int" }, 2),
		} as unknown as Expr;
		assert.deepEqual(ev(expr), intVal(1));
	});

	it("false branch", () => {
		const expr: Expr = {
			kind: "if",
			cond: lit({ kind: "bool" }, false),
			then: lit({ kind: "int" }, 1),
			else: lit({ kind: "int" }, 2),
		} as unknown as Expr;
		assert.deepEqual(ev(expr), intVal(2));
	});

	it("error condition propagates", () => {
		const expr: Expr = {
			kind: "if",
			cond: { kind: "var", name: "missing" } as Expr,
			then: lit({ kind: "int" }, 1),
			else: lit({ kind: "int" }, 2),
		} as unknown as Expr;
		const result = ev(expr);
		assert.equal(isError(result), true);
	});

	it("unbound string cond ref returns error", () => {
		// Mix inline and string to avoid "must be resolved"
		const expr: Expr = {
			kind: "if",
			cond: "missing",
			then: lit({ kind: "int" }, 1),
			else: lit({ kind: "int" }, 2),
		} as unknown as Expr;
		const result = ev(expr);
		assert.equal(isError(result), true);
	});

	it("unbound string then ref returns error", () => {
		const expr: Expr = {
			kind: "if",
			cond: lit({ kind: "bool" }, true),
			then: "missing",
			else: lit({ kind: "int" }, 2),
		} as unknown as Expr;
		const result = ev(expr);
		assert.equal(isError(result), true);
	});

	it("unbound string else ref returns error", () => {
		const expr: Expr = {
			kind: "if",
			cond: lit({ kind: "bool" }, false),
			then: lit({ kind: "int" }, 1),
			else: "missing",
		} as unknown as Expr;
		const result = ev(expr);
		assert.equal(isError(result), true);
	});
});

// ===========================================================================
// 5. evalLet inline
// ===========================================================================
describe("evalLet inline", () => {
	it("bind and evaluate body", () => {
		const expr: Expr = {
			kind: "let",
			name: "x",
			value: lit({ kind: "int" }, 10),
			body: { kind: "var", name: "x" } as Expr,
		} as unknown as Expr;
		assert.deepEqual(ev(expr), intVal(10));
	});

	it("value error propagates", () => {
		const expr: Expr = {
			kind: "let",
			name: "x",
			value: { kind: "var", name: "missing" } as Expr,
			body: { kind: "var", name: "x" } as Expr,
		} as unknown as Expr;
		const result = ev(expr);
		assert.equal(isError(result), true);
	});

	it("unbound string value ref returns error", () => {
		const expr: Expr = {
			kind: "let",
			name: "x",
			value: "missing",
			body: lit({ kind: "int" }, 0),
		} as unknown as Expr;
		const result = ev(expr);
		assert.equal(isError(result), true);
	});

	it("unbound string body ref returns error", () => {
		const expr: Expr = {
			kind: "let",
			name: "x",
			value: lit({ kind: "int" }, 5),
			body: "missing",
		} as unknown as Expr;
		const result = ev(expr);
		assert.equal(isError(result), true);
	});
});

// ===========================================================================
// 6. Async expressions in sync evaluator
// ===========================================================================
describe("Async expressions in sync evaluator", () => {
	const asyncKinds = ["par", "spawn", "await", "channel", "send", "recv", "select", "race"] as const;

	for (const kind of asyncKinds) {
		it(`${kind} returns domain error`, () => {
			// Build a minimal expression for each async kind
			let expr: Record<string, unknown> = { kind };
			switch (kind) {
			case "par":
				expr = { kind, branches: [] };
				break;
			case "spawn":
				expr = { kind, task: "t" };
				break;
			case "await":
				expr = { kind, future: "f" };
				break;
			case "channel":
				expr = { kind, channelType: "mpsc" };
				break;
			case "send":
				expr = { kind, channel: "c", value: "v" };
				break;
			case "recv":
				expr = { kind, channel: "c" };
				break;
			case "select":
				expr = { kind, futures: [] };
				break;
			case "race":
				expr = { kind, tasks: [] };
				break;
			}
			const result = ev(expr as Expr);
			assert.equal(isError(result), true);
			if (result.kind === "error") {
				assert.match(result.message ?? "", /Async expressions require AsyncEvaluator/);
			}
		});
	}
});

// ===========================================================================
// 7. evaluateProgram
// ===========================================================================
describe("evaluateProgram", () => {
	it("evaluates simple literal program", () => {
		const doc = makeDoc(
			[{ id: "n1", expr: lit({ kind: "int" }, 42) }],
			"n1",
		);
		assert.deepEqual(evaluateProgram(doc, registry, defs), intVal(42));
	});

	it("transitive closure skips bound nodes (let body)", () => {
		// let x = 5 in x
		const doc = makeDoc(
			[
				{ id: "val", expr: lit({ kind: "int" }, 5) },
				{ id: "body", expr: { kind: "var", name: "x" } as Expr },
				{
					id: "result",
					expr: { kind: "let", name: "x", value: "val", body: "body" } as unknown as Expr,
				},
			],
			"result",
		);
		assert.deepEqual(evaluateProgram(doc, registry, defs), intVal(5));
	});

	it("bound result node is evaluated on demand", () => {
		// The result node is a let, which is always bound; evaluateProgram evaluates it on demand
		const doc = makeDoc(
			[
				{ id: "val", expr: lit({ kind: "int" }, 7) },
				{ id: "body", expr: { kind: "var", name: "y" } as Expr },
				{
					id: "letn",
					expr: { kind: "let", name: "y", value: "val", body: "body" } as unknown as Expr,
				},
			],
			"letn",
		);
		assert.deepEqual(evaluateProgram(doc, registry, defs), intVal(7));
	});

	it("missing result node returns error", () => {
		const doc = makeDoc(
			[{ id: "n1", expr: lit({ kind: "int" }, 1) }],
			"nonexistent",
		);
		const result = evaluateProgram(doc, registry, defs);
		assert.equal(isError(result), true);
	});

	it("program with call node (node-ref args)", () => {
		const doc = makeDoc(
			[
				{ id: "a", expr: lit({ kind: "int" }, 3) },
				{ id: "b", expr: lit({ kind: "int" }, 4) },
				{
					id: "sum",
					expr: { kind: "call", ns: "core", name: "add", args: ["a", "b"] } as unknown as Expr,
				},
			],
			"sum",
		);
		assert.deepEqual(evaluateProgram(doc, registry, defs), intVal(7));
	});

	it("program with if node", () => {
		const doc = makeDoc(
			[
				{ id: "cond", expr: lit({ kind: "bool" }, true) },
				{ id: "yes", expr: lit({ kind: "int" }, 10) },
				{ id: "no", expr: lit({ kind: "int" }, 20) },
				{
					id: "result",
					expr: {
						kind: "if",
						cond: "cond",
						then: "yes",
						else: "no",
						type: { kind: "int" },
					} as unknown as Expr,
				},
			],
			"result",
		);
		assert.deepEqual(evaluateProgram(doc, registry, defs), intVal(10));
	});
});

// ===========================================================================
// 8. Lambda / Closure
// ===========================================================================
describe("lambda and closure", () => {
	it("create closure and apply with callExpr", () => {
		// lambda(n) => n + 1, then call with 5
		const doc = makeDoc(
			[
				{ id: "one", expr: lit({ kind: "int" }, 1) },
				{
					id: "body",
					expr: {
						kind: "call",
						ns: "core",
						name: "add",
						args: ["n", "one"],
					} as unknown as Expr,
				},
				{
					id: "fn",
					expr: {
						kind: "lambda",
						params: ["n"],
						body: "body",
						type: { kind: "fn", params: [{ kind: "int" }], returns: { kind: "int" } },
					} as unknown as Expr,
				},
				{ id: "arg", expr: lit({ kind: "int" }, 5) },
				{
					id: "result",
					expr: {
						kind: "callExpr",
						fn: "fn",
						args: ["arg"],
					} as unknown as Expr,
				},
			],
			"result",
		);
		assert.deepEqual(evaluateProgram(doc, registry, defs), intVal(6));
	});

	it("callExpr arity error (too few args)", () => {
		const doc = makeDoc(
			[
				{
					id: "body",
					expr: { kind: "var", name: "a" } as Expr,
				},
				{
					id: "fn",
					expr: {
						kind: "lambda",
						params: ["a", "b"],
						body: "body",
						type: { kind: "fn", params: [{ kind: "int" }, { kind: "int" }], returns: { kind: "int" } },
					} as unknown as Expr,
				},
				{
					id: "result",
					expr: {
						kind: "callExpr",
						fn: "fn",
						args: [],
					} as unknown as Expr,
				},
			],
			"result",
		);
		const result = evaluateProgram(doc, registry, defs);
		assert.equal(isError(result), true);
	});

	it("callExpr arity error (too many args)", () => {
		const doc = makeDoc(
			[
				{
					id: "body",
					expr: { kind: "var", name: "a" } as Expr,
				},
				{
					id: "fn",
					expr: {
						kind: "lambda",
						params: ["a"],
						body: "body",
						type: { kind: "fn", params: [{ kind: "int" }], returns: { kind: "int" } },
					} as unknown as Expr,
				},
				{ id: "x", expr: lit({ kind: "int" }, 1) },
				{ id: "y", expr: lit({ kind: "int" }, 2) },
				{
					id: "result",
					expr: {
						kind: "callExpr",
						fn: "fn",
						args: ["x", "y"],
					} as unknown as Expr,
				},
			],
			"result",
		);
		const result = evaluateProgram(doc, registry, defs);
		assert.equal(isError(result), true);
	});
});

// ===========================================================================
// 9. Optional parameters
// ===========================================================================
describe("optional parameters", () => {
	it("provided value is used", () => {
		// lambda(a, b?) where b has default=10; call with (1, 2)
		const doc = makeDoc(
			[
				{
					id: "body",
					expr: {
						kind: "call",
						ns: "core",
						name: "add",
						args: ["a", "b"],
					} as unknown as Expr,
				},
				{
					id: "fn",
					expr: {
						kind: "lambda",
						params: [
							"a",
							{ name: "b", optional: true, default: lit({ kind: "int" }, 10) },
						],
						body: "body",
						type: { kind: "fn", params: [{ kind: "int" }, { kind: "int" }], returns: { kind: "int" } },
					} as unknown as Expr,
				},
				{ id: "x", expr: lit({ kind: "int" }, 1) },
				{ id: "y", expr: lit({ kind: "int" }, 2) },
				{
					id: "result",
					expr: {
						kind: "callExpr",
						fn: "fn",
						args: ["x", "y"],
					} as unknown as Expr,
				},
			],
			"result",
		);
		assert.deepEqual(evaluateProgram(doc, registry, defs), intVal(3));
	});

	it("default expression is used when arg omitted", () => {
		// lambda(a, b?) where b has default=10; call with (1)
		const doc = makeDoc(
			[
				{
					id: "body",
					expr: {
						kind: "call",
						ns: "core",
						name: "add",
						args: ["a", "b"],
					} as unknown as Expr,
				},
				{
					id: "fn",
					expr: {
						kind: "lambda",
						params: [
							"a",
							{ name: "b", optional: true, default: lit({ kind: "int" }, 10) },
						],
						body: "body",
						type: { kind: "fn", params: [{ kind: "int" }, { kind: "int" }], returns: { kind: "int" } },
					} as unknown as Expr,
				},
				{ id: "x", expr: lit({ kind: "int" }, 1) },
				{
					id: "result",
					expr: {
						kind: "callExpr",
						fn: "fn",
						args: ["x"],
					} as unknown as Expr,
				},
			],
			"result",
		);
		assert.deepEqual(evaluateProgram(doc, registry, defs), intVal(11));
	});

	it("omitted optional param without default yields option(null)", () => {
		// lambda(a?) with no default; call with no args; body just returns a
		const doc = makeDoc(
			[
				{
					id: "body",
					expr: { kind: "var", name: "a" } as Expr,
				},
				{
					id: "fn",
					expr: {
						kind: "lambda",
						params: [{ name: "a", optional: true }],
						body: "body",
						type: { kind: "fn", params: [{ kind: "int" }], returns: { kind: "int" } },
					} as unknown as Expr,
				},
				{
					id: "result",
					expr: {
						kind: "callExpr",
						fn: "fn",
						args: [],
					} as unknown as Expr,
				},
			],
			"result",
		);
		// undefinedVal() is optionVal(null)
		assert.deepEqual(evaluateProgram(doc, registry, defs), optionVal(null));
	});
});

// ===========================================================================
// 10. fix combinator
// ===========================================================================
describe("fix combinator", () => {
	it("recursive factorial via fix", () => {
		// fix(lambda(rec) => lambda(n) => if n == 0 then 1 else n * rec(n-1))
		// Then call the result with 5 -> 120
		const doc = makeDoc(
			[
				// Nodes for inner body: if n == 0 then 1 else n * rec(n-1)
				{ id: "zero", expr: lit({ kind: "int" }, 0) },
				{ id: "one", expr: lit({ kind: "int" }, 1) },
				{
					id: "n_eq_0",
					expr: {
						kind: "call",
						ns: "core",
						name: "eq",
						args: ["n", "zero"],
					} as unknown as Expr,
				},
				{
					id: "n_sub_1",
					expr: {
						kind: "call",
						ns: "core",
						name: "sub",
						args: ["n", "one"],
					} as unknown as Expr,
				},
				{
					id: "rec_call",
					expr: {
						kind: "callExpr",
						fn: "rec",
						args: ["n_sub_1"],
					} as unknown as Expr,
				},
				{
					id: "n_mul_rec",
					expr: {
						kind: "call",
						ns: "core",
						name: "mul",
						args: ["n", "rec_call"],
					} as unknown as Expr,
				},
				{
					id: "if_node",
					expr: {
						kind: "if",
						cond: "n_eq_0",
						then: "one",
						else: "n_mul_rec",
						type: { kind: "int" },
					} as unknown as Expr,
				},
				// Inner lambda: lambda(n) => if_node
				{
					id: "inner_lambda",
					expr: {
						kind: "lambda",
						params: ["n"],
						body: "if_node",
						type: { kind: "fn", params: [{ kind: "int" }], returns: { kind: "int" } },
					} as unknown as Expr,
				},
				// Outer lambda: lambda(rec) => inner_lambda
				{
					id: "outer_lambda",
					expr: {
						kind: "lambda",
						params: ["rec"],
						body: "inner_lambda",
						type: {
							kind: "fn",
							params: [{ kind: "fn", params: [{ kind: "int" }], returns: { kind: "int" } }],
							returns: { kind: "fn", params: [{ kind: "int" }], returns: { kind: "int" } },
						},
					} as unknown as Expr,
				},
				// fix(outer_lambda)
				{
					id: "factorial",
					expr: {
						kind: "fix",
						fn: "outer_lambda",
						type: { kind: "fn", params: [{ kind: "int" }], returns: { kind: "int" } },
					} as unknown as Expr,
				},
				// call factorial(5)
				{ id: "five", expr: lit({ kind: "int" }, 5) },
				{
					id: "result",
					expr: {
						kind: "callExpr",
						fn: "factorial",
						args: ["five"],
					} as unknown as Expr,
				},
			],
			"result",
		);
		assert.deepEqual(evaluateProgram(doc, registry, defs), intVal(120));
	});
});

// ===========================================================================
// 11. ref resolution
// ===========================================================================
describe("ref resolution", () => {
	it("ref resolves from env", () => {
		const env = extendValueEnv(emptyValueEnv(), "mynode", intVal(55));
		const result = ev({ kind: "ref", id: "mynode" } as Expr, env);
		assert.deepEqual(result, intVal(55));
	});

	it("ref throws for unresolved ref outside program context", () => {
		assert.throws(
			() => ev({ kind: "ref", id: "nowhere" } as Expr),
			/Ref must be resolved during program evaluation/,
		);
	});
});
