// SPIRAL TypeChecker Unit Tests

import assert from "node:assert";
import { describe, it } from "node:test";
import { emptyDefs, emptyTypeEnv, extendTypeEnv, registerDef as envRegisterDef } from "../src/env.js";
import { createDefaultEffectRegistry } from "../src/effects.js";
import { createCoreRegistry, createBoolRegistry } from "../src/index.js";
import type { OperatorRegistry } from "../src/domains/registry.js";
import {
	TypeChecker,
	typeCheckProgram,
	typeCheckEIRProgram,
} from "../src/typechecker.js";
import {
	boolType,
	fnType,
	intType,
	listType,
	refType,
	voidType,
} from "../src/types.js";
import type { AIRDef, Type, Defs } from "../src/types.js";

// Helper to merge registries
function mergeRegistries(...registries: OperatorRegistry[]): OperatorRegistry {
	const merged = new Map();
	for (const reg of registries) {
		for (const [key, val] of reg) {
			merged.set(key, val);
		}
	}
	return merged;
}

// Helper to create and register an airDef for testing
function registerDef(
	defs: Defs,
	ns: string,
	name: string,
	params: Array<{ name: string; type: Type }>,
	result: Type,
): Defs {
	const def: AIRDef = {
		ns,
		name,
		params: params.map(p => p.name),
		result,
		body: { kind: "lit", type: result, value: 0 }, // placeholder body
	};
	return envRegisterDef(defs, def);
}
import { createTestDocument, createCIRTestDocument, createTestExpr } from "./helper.js";

describe("TypeChecker Class", () => {
	const registry = mergeRegistries(createCoreRegistry(), createBoolRegistry());
	const defs = emptyDefs();

	describe("typeCheckLit", () => {
		it("should type check integer literal", () => {
			const checker = new TypeChecker(registry, defs);
			const expr = createTestExpr({ kind: "lit", type: intType, value: 42 });
			const result = checker.typeCheck(expr, emptyTypeEnv());
			assert.deepStrictEqual(result.type, intType);
		});

		it("should type check boolean literal", () => {
			const checker = new TypeChecker(registry, defs);
			const expr = createTestExpr({ kind: "lit", type: boolType, value: true });
			const result = checker.typeCheck(expr, emptyTypeEnv());
			assert.deepStrictEqual(result.type, boolType);
		});
	});

	describe("typeCheckVar", () => {
		it("should type check variable with type in environment", () => {
			const checker = new TypeChecker(registry, defs);
			const env = extendTypeEnv(emptyTypeEnv(), "x", intType);
			const expr = createTestExpr({ kind: "var", name: "x" });
			const result = checker.typeCheck(expr, env);
			assert.deepStrictEqual(result.type, intType);
		});

		it("should return default type for unbound variable", () => {
			const checker = new TypeChecker(registry, defs);
			const expr = createTestExpr({ kind: "var", name: "unbound" });
			const result = checker.typeCheck(expr, emptyTypeEnv());
			// Returns int as placeholder for let-bound variables
			assert.deepStrictEqual(result.type, intType);
		});
	});

	describe("typeCheckCall", () => {
		it("should type check call to core:add", () => {
			const checker = new TypeChecker(registry, defs);
			const expr = createTestExpr({
				kind: "call",
				ns: "core",
				name: "add",
				args: ["a", "b"],
			});
			const result = checker.typeCheck(expr, emptyTypeEnv());
			assert.deepStrictEqual(result.type, intType);
		});

		it("should type check call to bool:and", () => {
			const checker = new TypeChecker(registry, defs);
			const expr = createTestExpr({
				kind: "call",
				ns: "bool",
				name: "and",
				args: ["a", "b"],
			});
			const result = checker.typeCheck(expr, emptyTypeEnv());
			assert.deepStrictEqual(result.type, boolType);
		});

		it("should type check call to core:lt returning bool", () => {
			const checker = new TypeChecker(registry, defs);
			const expr = createTestExpr({
				kind: "call",
				ns: "core",
				name: "lt",
				args: ["a", "b"],
			});
			const result = checker.typeCheck(expr, emptyTypeEnv());
			assert.deepStrictEqual(result.type, boolType);
		});

		it("should throw for unknown operator", () => {
			const checker = new TypeChecker(registry, defs);
			const expr = createTestExpr({
				kind: "call",
				ns: "unknown",
				name: "op",
				args: [],
			});
			assert.throws(() => checker.typeCheck(expr, emptyTypeEnv()));
		});

		it("should throw for arity mismatch", () => {
			const checker = new TypeChecker(registry, defs);
			const expr = createTestExpr({
				kind: "call",
				ns: "core",
				name: "add",
				args: ["a"],
			});
			assert.throws(() => checker.typeCheck(expr, emptyTypeEnv()));
		});

		it("should type check inline expression arguments", () => {
			const checker = new TypeChecker(registry, defs);
			const expr = createTestExpr({
				kind: "call",
				ns: "core",
				name: "add",
				args: [
					{ kind: "lit", type: intType, value: 1 },
					{ kind: "lit", type: intType, value: 2 },
				],
			});
			const result = checker.typeCheck(expr, emptyTypeEnv());
			assert.deepStrictEqual(result.type, intType);
		});

		it("should throw for type mismatch in inline arguments", () => {
			const checker = new TypeChecker(registry, defs);
			const expr = createTestExpr({
				kind: "call",
				ns: "core",
				name: "add",
				args: [
					{ kind: "lit", type: boolType, value: true },
					{ kind: "lit", type: intType, value: 2 },
				],
			});
			assert.throws(() => checker.typeCheck(expr, emptyTypeEnv()));
		});
	});

	describe("typeCheckIf", () => {
		it("should type check if expression with declared type", () => {
			const checker = new TypeChecker(registry, defs);
			const expr = createTestExpr({
				kind: "if",
				cond: "c",
				then: "t",
				else: "e",
				type: intType,
			});
			const result = checker.typeCheck(expr, emptyTypeEnv());
			assert.deepStrictEqual(result.type, intType);
		});
	});

	describe("typeCheckLet", () => {
		it("should type check let expression", () => {
			const checker = new TypeChecker(registry, defs);
			const expr = createTestExpr({
				kind: "let",
				name: "x",
				value: "v",
				body: "b",
			});
			const result = checker.typeCheck(expr, emptyTypeEnv());
			// Returns placeholder type
			assert.deepStrictEqual(result.type, intType);
		});
	});

	describe("typeCheckAirRef", () => {
		it("should type check airRef with registered definition", () => {
			const customDefs = registerDef(
				emptyDefs(),
				"math",
				"double",
				[{ name: "x", type: intType }],
				intType,
			);
			const checker = new TypeChecker(registry, customDefs);
			const expr = createTestExpr({
				kind: "airRef",
				ns: "math",
				name: "double",
				args: ["x"],
			});
			const result = checker.typeCheck(expr, emptyTypeEnv());
			assert.deepStrictEqual(result.type, intType);
		});

		it("should throw for unknown definition", () => {
			const checker = new TypeChecker(registry, defs);
			const expr = createTestExpr({
				kind: "airRef",
				ns: "unknown",
				name: "def",
				args: [],
			});
			assert.throws(() => checker.typeCheck(expr, emptyTypeEnv()));
		});

		it("should throw for arity mismatch", () => {
			const customDefs = registerDef(
				emptyDefs(),
				"math",
				"double",
				[{ name: "x", type: intType }],
				intType,
			);
			const checker = new TypeChecker(registry, customDefs);
			const expr = createTestExpr({
				kind: "airRef",
				ns: "math",
				name: "double",
				args: [],
			});
			assert.throws(() => checker.typeCheck(expr, emptyTypeEnv()));
		});
	});

	describe("typeCheckPredicate", () => {
		it("should return bool type for predicate", () => {
			const checker = new TypeChecker(registry, defs);
			const expr = createTestExpr({
				kind: "predicate",
				name: "isZero",
				value: "x",
			});
			const result = checker.typeCheck(expr, emptyTypeEnv());
			assert.deepStrictEqual(result.type, boolType);
		});
	});

	describe("typeCheckLambda", () => {
		it("should type check lambda with function type", () => {
			const checker = new TypeChecker(registry, defs);
			const lambdaType = fnType([intType], intType);
			const expr = createTestExpr({
				kind: "lambda",
				params: ["x"],
				body: "b",
				type: lambdaType,
			});
			const result = checker.typeCheck(expr, emptyTypeEnv());
			assert.deepStrictEqual(result.type, lambdaType);
		});

		it("should throw if lambda type is not function type", () => {
			const checker = new TypeChecker(registry, defs);
			const expr = createTestExpr({
				kind: "lambda",
				params: ["x"],
				body: "b",
				type: intType,
			});
			assert.throws(() => checker.typeCheck(expr, emptyTypeEnv()));
		});
	});

	describe("typeCheckCallExpr", () => {
		it("should type check callExpr", () => {
			const checker = new TypeChecker(registry, defs);
			const expr = createTestExpr({
				kind: "callExpr",
				fn: "f",
				args: ["x"],
			});
			const result = checker.typeCheck(expr, emptyTypeEnv());
			// Returns placeholder type
			assert.deepStrictEqual(result.type, intType);
		});
	});

	describe("typeCheckFix", () => {
		it("should type check fix expression", () => {
			const checker = new TypeChecker(registry, defs);
			const expr = createTestExpr({
				kind: "fix",
				fn: "f",
				type: intType,
			});
			const result = checker.typeCheck(expr, emptyTypeEnv());
			assert.deepStrictEqual(result.type, intType);
		});
	});

	describe("unknown expression kind", () => {
		it("should throw for unknown expression kind", () => {
			const checker = new TypeChecker(registry, defs);
			const expr = { kind: "unknown" };
			assert.throws(() => checker.typeCheck(expr as any, emptyTypeEnv()));
		});
	});
});

describe("typeCheckProgram", () => {
	const registry = mergeRegistries(createCoreRegistry(), createBoolRegistry());
	const defs = emptyDefs();

	it("should type check simple literal program", () => {
		const doc = createTestDocument({
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "result", expr: { kind: "lit", type: intType, value: 42 } },
			],
			result: "result",
		});
		const { nodeTypes, resultType } = typeCheckProgram(doc, registry, defs);
		assert.deepStrictEqual(resultType, intType);
		assert.deepStrictEqual(nodeTypes.get("result"), intType);
	});

	it("should type check program with ref", () => {
		const doc = createTestDocument({
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "x", expr: { kind: "lit", type: intType, value: 10 } },
				{ id: "result", expr: { kind: "ref", id: "x" } },
			],
			result: "result",
		});
		const { resultType } = typeCheckProgram(doc, registry, defs);
		assert.deepStrictEqual(resultType, intType);
	});

	it("should type check program with call", () => {
		const doc = createTestDocument({
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "a", expr: { kind: "lit", type: intType, value: 10 } },
				{ id: "b", expr: { kind: "lit", type: intType, value: 20 } },
				{ id: "result", expr: { kind: "call", ns: "core", name: "add", args: ["a", "b"] } },
			],
			result: "result",
		});
		const { resultType } = typeCheckProgram(doc, registry, defs);
		assert.deepStrictEqual(resultType, intType);
	});

	it("should type check program with if", () => {
		const doc = createTestDocument({
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "cond", expr: { kind: "lit", type: boolType, value: true } },
				{ id: "then", expr: { kind: "lit", type: intType, value: 1 } },
				{ id: "else", expr: { kind: "lit", type: intType, value: 2 } },
				{
					id: "result",
					expr: { kind: "if", cond: "cond", then: "then", else: "else", type: intType },
				},
			],
			result: "result",
		});
		const { resultType } = typeCheckProgram(doc, registry, defs);
		assert.deepStrictEqual(resultType, intType);
	});

	it("should type check program with let", () => {
		const doc = createTestDocument({
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "val", expr: { kind: "lit", type: intType, value: 42 } },
				{ id: "body", expr: { kind: "var", name: "x" } },
				{ id: "result", expr: { kind: "let", name: "x", value: "val", body: "body" } },
			],
			result: "result",
		});
		const { nodeTypes } = typeCheckProgram(doc, registry, defs);
		// Let node should be type-checked
		assert.ok(nodeTypes.has("result"));
	});

	it("should type check program with airRef", () => {
		const customDefs = registerDef(
			emptyDefs(),
			"math",
			"inc",
			[{ name: "x", type: intType }],
			intType,
		);
		const doc = createTestDocument({
			version: "1.0.0",
			airDefs: [
				{
					ns: "math",
					name: "inc",
					params: [{ name: "x", type: intType }],
					result: intType,
					nodes: [
						{ id: "one", expr: { kind: "lit", type: intType, value: 1 } },
						{ id: "ret", expr: { kind: "call", ns: "core", name: "add", args: ["x", "one"] } },
					],
					body: "ret",
				},
			],
			nodes: [
				{ id: "n", expr: { kind: "lit", type: intType, value: 5 } },
				{ id: "result", expr: { kind: "airRef", ns: "math", name: "inc", args: ["n"] } },
			],
			result: "result",
		});
		const { resultType } = typeCheckProgram(doc, registry, customDefs);
		assert.deepStrictEqual(resultType, intType);
	});

	it("should type check program with predicate", () => {
		const doc = createTestDocument({
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "x", expr: { kind: "lit", type: intType, value: 0 } },
				{ id: "result", expr: { kind: "predicate", name: "isZero", value: "x" } },
			],
			result: "result",
		});
		const { resultType } = typeCheckProgram(doc, registry, defs);
		assert.deepStrictEqual(resultType, boolType);
	});

	it("should throw for missing result node", () => {
		const doc = createTestDocument({
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "x", expr: { kind: "lit", type: intType, value: 42 } },
			],
			result: "nonexistent",
		});
		assert.throws(() => typeCheckProgram(doc, registry, defs));
	});

	it("should throw for invalid ref", () => {
		const doc = createTestDocument({
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "result", expr: { kind: "ref", id: "nonexistent" } },
			],
			result: "result",
		});
		assert.throws(() => typeCheckProgram(doc, registry, defs));
	});
});

describe("typeCheckProgram - CIR features", () => {
	const registry = mergeRegistries(createCoreRegistry(), createBoolRegistry());
	const defs = emptyDefs();

	it("should type check lambda", () => {
		const doc = createCIRTestDocument({
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "body", expr: { kind: "var", name: "x" } },
				{
					id: "result",
					expr: {
						kind: "lambda",
						params: ["x"],
						body: "body",
						type: fnType([intType], intType),
					},
				},
			],
			result: "result",
		});
		const { resultType } = typeCheckProgram(doc, registry, defs);
		assert.strictEqual(resultType.kind, "fn");
	});

	it("should type check callExpr", () => {
		const doc = createCIRTestDocument({
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "body", expr: { kind: "var", name: "x" } },
				{
					id: "fn",
					expr: {
						kind: "lambda",
						params: ["x"],
						body: "body",
						type: fnType([intType], intType),
					},
				},
				{ id: "arg", expr: { kind: "lit", type: intType, value: 42 } },
				{ id: "result", expr: { kind: "callExpr", fn: "fn", args: ["arg"] } },
			],
			result: "result",
		});
		const { resultType } = typeCheckProgram(doc, registry, defs);
		assert.deepStrictEqual(resultType, intType);
	});

	it("should type check fix expression", () => {
		const doc = createCIRTestDocument({
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "body", expr: { kind: "var", name: "f" } },
				{
					id: "fn",
					expr: {
						kind: "lambda",
						params: ["f"],
						body: "body",
						type: fnType([fnType([intType], intType)], fnType([intType], intType)),
					},
				},
				{
					id: "result",
					expr: { kind: "fix", fn: "fn", type: fnType([intType], intType) },
				},
			],
			result: "result",
		});
		const { resultType } = typeCheckProgram(doc, registry, defs);
		assert.strictEqual(resultType.kind, "fn");
	});

	it("should handle partial application (currying)", () => {
		const doc = createCIRTestDocument({
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "body", expr: { kind: "var", name: "x" } },
				{
					id: "fn",
					expr: {
						kind: "lambda",
						params: ["x", "y"],
						body: "body",
						type: fnType([intType, intType], intType),
					},
				},
				{ id: "arg", expr: { kind: "lit", type: intType, value: 1 } },
				{ id: "result", expr: { kind: "callExpr", fn: "fn", args: ["arg"] } },
			],
			result: "result",
		});
		const { resultType } = typeCheckProgram(doc, registry, defs);
		// Should return a function type with remaining parameter
		assert.strictEqual(resultType.kind, "fn");
		if (resultType.kind === "fn") {
			assert.strictEqual(resultType.params.length, 1);
		}
	});

	it("should throw for callExpr with non-function", () => {
		const doc = createCIRTestDocument({
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "notfn", expr: { kind: "lit", type: intType, value: 42 } },
				{ id: "arg", expr: { kind: "lit", type: intType, value: 1 } },
				{ id: "result", expr: { kind: "callExpr", fn: "notfn", args: ["arg"] } },
			],
			result: "result",
		});
		assert.throws(() => typeCheckProgram(doc, registry, defs));
	});

	it("should throw for callExpr with too many arguments", () => {
		const doc = createCIRTestDocument({
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "body", expr: { kind: "var", name: "x" } },
				{
					id: "fn",
					expr: {
						kind: "lambda",
						params: ["x"],
						body: "body",
						type: fnType([intType], intType),
					},
				},
				{ id: "arg1", expr: { kind: "lit", type: intType, value: 1 } },
				{ id: "arg2", expr: { kind: "lit", type: intType, value: 2 } },
				{ id: "result", expr: { kind: "callExpr", fn: "fn", args: ["arg1", "arg2"] } },
			],
			result: "result",
		});
		assert.throws(() => typeCheckProgram(doc, registry, defs));
	});

	it("should throw for callExpr with type mismatch", () => {
		const doc = createCIRTestDocument({
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "body", expr: { kind: "var", name: "x" } },
				{
					id: "fn",
					expr: {
						kind: "lambda",
						params: ["x"],
						body: "body",
						type: fnType([intType], intType),
					},
				},
				{ id: "arg", expr: { kind: "lit", type: boolType, value: true } },
				{ id: "result", expr: { kind: "callExpr", fn: "fn", args: ["arg"] } },
			],
			result: "result",
		});
		assert.throws(() => typeCheckProgram(doc, registry, defs));
	});

	it("should throw for fix with non-function", () => {
		const doc = createCIRTestDocument({
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "notfn", expr: { kind: "lit", type: intType, value: 42 } },
				{ id: "result", expr: { kind: "fix", fn: "notfn", type: intType } },
			],
			result: "result",
		});
		assert.throws(() => typeCheckProgram(doc, registry, defs));
	});

	it("should throw for fix with wrong arity", () => {
		const doc = createCIRTestDocument({
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "body", expr: { kind: "var", name: "x" } },
				{
					id: "fn",
					expr: {
						kind: "lambda",
						params: ["x", "y"],
						body: "body",
						type: fnType([intType, intType], intType),
					},
				},
				{ id: "result", expr: { kind: "fix", fn: "fn", type: intType } },
			],
			result: "result",
		});
		assert.throws(() => typeCheckProgram(doc, registry, defs));
	});
});

describe("typeCheckEIRProgram", () => {
	const registry = mergeRegistries(createCoreRegistry(), createBoolRegistry());
	const defs = emptyDefs();
	const effects = createDefaultEffectRegistry();

	it("should type check seq expression", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "a", expr: { kind: "lit", type: intType, value: 1 } },
				{ id: "b", expr: { kind: "lit", type: intType, value: 2 } },
				{ id: "result", expr: { kind: "seq", first: "a", then: "b" } },
			],
			result: "result",
		};
		const { resultType } = typeCheckEIRProgram(doc as any, registry, defs, effects);
		assert.deepStrictEqual(resultType, intType);
	});

	it("should type check assign expression", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "val", expr: { kind: "lit", type: intType, value: 42 } },
				{ id: "result", expr: { kind: "assign", target: "x", value: "val" } },
			],
			result: "result",
		};
		const { resultType } = typeCheckEIRProgram(doc as any, registry, defs, effects);
		assert.deepStrictEqual(resultType, voidType);
	});

	it("should type check while expression", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "cond", expr: { kind: "lit", type: boolType, value: true } },
				{ id: "body", expr: { kind: "lit", type: intType, value: 1 } },
				{ id: "result", expr: { kind: "while", cond: "cond", body: "body" } },
			],
			result: "result",
		};
		const { resultType } = typeCheckEIRProgram(doc as any, registry, defs, effects);
		assert.deepStrictEqual(resultType, voidType);
	});

	it("should type check for expression", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "init", expr: { kind: "lit", type: intType, value: 0 } },
				{ id: "cond", expr: { kind: "lit", type: boolType, value: true } },
				{ id: "update", expr: { kind: "lit", type: intType, value: 1 } },
				{ id: "body", expr: { kind: "lit", type: intType, value: 2 } },
				{
					id: "result",
					expr: { kind: "for", var: "i", init: "init", cond: "cond", update: "update", body: "body" },
				},
			],
			result: "result",
		};
		const { resultType } = typeCheckEIRProgram(doc as any, registry, defs, effects);
		assert.deepStrictEqual(resultType, voidType);
	});

	it("should type check iter expression", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "list", expr: { kind: "lit", type: listType(intType), value: [1, 2, 3] } },
				{ id: "body", expr: { kind: "lit", type: intType, value: 0 } },
				{ id: "result", expr: { kind: "iter", var: "x", iter: "list", body: "body" } },
			],
			result: "result",
		};
		const { resultType } = typeCheckEIRProgram(doc as any, registry, defs, effects);
		assert.deepStrictEqual(resultType, voidType);
	});

	it("should type check effect expression", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "msg", expr: { kind: "lit", type: { kind: "string" }, value: "hello" } },
				{ id: "result", expr: { kind: "effect", op: "print", args: ["msg"] } },
			],
			result: "result",
		};
		const { resultType } = typeCheckEIRProgram(doc as any, registry, defs, effects);
		assert.deepStrictEqual(resultType, voidType);
	});

	it("should type check refCell expression", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "val", expr: { kind: "lit", type: intType, value: 42 } },
				{ id: "result", expr: { kind: "refCell", target: "val" } },
			],
			result: "result",
		};
		const { resultType } = typeCheckEIRProgram(doc as any, registry, defs, effects);
		assert.deepStrictEqual(resultType, refType(intType));
	});

	it("should type check deref expression", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "val", expr: { kind: "lit", type: intType, value: 42 } },
				{ id: "ref", expr: { kind: "refCell", target: "val" } },
				{ id: "result", expr: { kind: "deref", target: "ref" } },
			],
			result: "result",
		};
		const { resultType } = typeCheckEIRProgram(doc as any, registry, defs, effects);
		assert.deepStrictEqual(resultType, intType);
	});

	it("should fall through to CIR type checking for non-EIR expressions", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "a", expr: { kind: "lit", type: intType, value: 10 } },
				{ id: "b", expr: { kind: "lit", type: intType, value: 20 } },
				{ id: "result", expr: { kind: "call", ns: "core", name: "add", args: ["a", "b"] } },
			],
			result: "result",
		};
		const { resultType } = typeCheckEIRProgram(doc as any, registry, defs, effects);
		assert.deepStrictEqual(resultType, intType);
	});

	it("should throw for unknown effect", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "result", expr: { kind: "effect", op: "unknownEffect", args: [] } },
			],
			result: "result",
		};
		assert.throws(() => typeCheckEIRProgram(doc as any, registry, defs, effects));
	});

	it("should throw for deref of non-ref type", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "val", expr: { kind: "lit", type: intType, value: 42 } },
				{ id: "result", expr: { kind: "deref", target: "val" } },
			],
			result: "result",
		};
		assert.throws(() => typeCheckEIRProgram(doc as any, registry, defs, effects));
	});

	it("should throw for while with non-bool condition", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "cond", expr: { kind: "lit", type: intType, value: 1 } },
				{ id: "body", expr: { kind: "lit", type: intType, value: 2 } },
				{ id: "result", expr: { kind: "while", cond: "cond", body: "body" } },
			],
			result: "result",
		};
		assert.throws(() => typeCheckEIRProgram(doc as any, registry, defs, effects));
	});

	it("should throw for iter with non-list iterator", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "notList", expr: { kind: "lit", type: intType, value: 42 } },
				{ id: "body", expr: { kind: "lit", type: intType, value: 0 } },
				{ id: "result", expr: { kind: "iter", var: "x", iter: "notList", body: "body" } },
			],
			result: "result",
		};
		assert.throws(() => typeCheckEIRProgram(doc as any, registry, defs, effects));
	});

	it("should throw for missing result node", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "x", expr: { kind: "lit", type: intType, value: 42 } },
			],
			result: "nonexistent",
		};
		assert.throws(() => typeCheckEIRProgram(doc as any, registry, defs, effects));
	});
});
