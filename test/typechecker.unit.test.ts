// SPDX-License-Identifier: MIT
// SPIRAL Type Checker - Unit Tests

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

import {
	TypeChecker,
	typeCheckProgram,
	typeCheckEIRProgram,
} from "../src/typechecker.js";
import {
	emptyTypeEnv,
	extendTypeEnv,
	emptyDefs,
	registerDef,
} from "../src/env.js";
import {
	intType,
	boolType,
	stringType,
	voidType,
	fnType as fnTypeCtor,
	listType,
} from "../src/types.js";
import {
	defineOperator,
	emptyRegistry,
	type OperatorRegistry,
} from "../src/domains/registry.js";
import type { AIRDocument, EIRDocument, Type, Expr } from "../src/types.js";

//==============================================================================
// Test Helpers
//==============================================================================

let testRegistry: OperatorRegistry;

before(() => {
	// Set up a basic operator registry for testing
	testRegistry = emptyRegistry();

	// Register core arithmetic operators
	const addOp = defineOperator("core", "add")
		.setParams(intType, intType)
		.setReturns(intType)
		.setPure(true)
		.setImpl(() => ({ kind: "int", value: 0 }))
		.build();

	const subOp = defineOperator("core", "sub")
		.setParams(intType, intType)
		.setReturns(intType)
		.setPure(true)
		.setImpl(() => ({ kind: "int", value: 0 }))
		.build();

	const mulOp = defineOperator("core", "mul")
		.setParams(intType, intType)
		.setReturns(intType)
		.setPure(true)
		.setImpl(() => ({ kind: "int", value: 0 }))
		.build();

	const divOp = defineOperator("core", "div")
		.setParams(intType, intType)
		.setReturns(intType)
		.setPure(true)
		.setImpl(() => ({ kind: "int", value: 0 }))
		.build();

	// Register comparison operators
	const ltOp = defineOperator("core", "lt")
		.setParams(intType, intType)
		.setReturns(boolType)
		.setPure(true)
		.setImpl(() => ({ kind: "bool", value: false }))
		.build();

	const gtOp = defineOperator("core", "gt")
		.setParams(intType, intType)
		.setReturns(boolType)
		.setPure(true)
		.setImpl(() => ({ kind: "bool", value: false }))
		.build();

	const eqOp = defineOperator("core", "eq")
		.setParams(intType, intType)
		.setReturns(boolType)
		.setPure(true)
		.setImpl(() => ({ kind: "bool", value: false }))
		.build();

	testRegistry.set("core:add", addOp);
	testRegistry.set("core:sub", subOp);
	testRegistry.set("core:mul", mulOp);
	testRegistry.set("core:div", divOp);
	testRegistry.set("core:lt", ltOp);
	testRegistry.set("core:gt", gtOp);
	testRegistry.set("core:eq", eqOp);
});

//==============================================================================
// Test Suite
//==============================================================================

describe("TypeChecker", () => {
	//==========================================================================
	// TypeChecker Class - Literal Expressions
	//==========================================================================

	describe("TypeChecker.typeCheck - lit", () => {
		it("should type check integer literal", () => {
			const defs = emptyDefs();
			const checker = new TypeChecker(testRegistry, defs);
			const env = emptyTypeEnv();

			const litExpr: Expr = {
				kind: "lit",
				type: intType,
				value: 42,
			};

			const result = checker.typeCheck(litExpr, env);

			assert.deepStrictEqual(result.type, intType);
			assert.strictEqual(result.type.kind, "int");
		});

		it("should type check boolean literal", () => {
			const defs = emptyDefs();
			const checker = new TypeChecker(testRegistry, defs);
			const env = emptyTypeEnv();

			const litExpr: Expr = {
				kind: "lit",
				type: boolType,
				value: true,
			};

			const result = checker.typeCheck(litExpr, env);

			assert.deepStrictEqual(result.type, boolType);
			assert.strictEqual(result.type.kind, "bool");
		});

		it("should type check string literal", () => {
			const defs = emptyDefs();
			const checker = new TypeChecker(testRegistry, defs);
			const env = emptyTypeEnv();

			const litExpr: Expr = {
				kind: "lit",
				type: stringType,
				value: "hello",
			};

			const result = checker.typeCheck(litExpr, env);

			assert.deepStrictEqual(result.type, stringType);
			assert.strictEqual(result.type.kind, "string");
		});
	});

	//==========================================================================
	// TypeChecker Class - Variable Expressions
	//==========================================================================

	describe("TypeChecker.typeCheck - var", () => {
		it("should look up variable in environment", () => {
			const defs = emptyDefs();
			const checker = new TypeChecker(testRegistry, defs);
			const env = extendTypeEnv(emptyTypeEnv(), "x", intType);

			const varExpr: Expr = {
				kind: "var",
				name: "x",
			};

			const result = checker.typeCheck(varExpr, env);

			assert.deepStrictEqual(result.type, intType);
		});

		it("should return default int type for unbound variable", () => {
			const defs = emptyDefs();
			const checker = new TypeChecker(testRegistry, defs);
			const env = emptyTypeEnv();

			const varExpr: Expr = {
				kind: "var",
				name: "unknown",
			};

			const result = checker.typeCheck(varExpr, env);

			// Unbound variables return intType as default
			assert.deepStrictEqual(result.type, intType);
		});

		it("should look up string variable in environment", () => {
			const defs = emptyDefs();
			const checker = new TypeChecker(testRegistry, defs);
			const env = extendTypeEnv(emptyTypeEnv(), "msg", stringType);

			const varExpr: Expr = {
				kind: "var",
				name: "msg",
			};

			const result = checker.typeCheck(varExpr, env);

			assert.deepStrictEqual(result.type, stringType);
		});
	});

	//==========================================================================
	// TypeChecker Class - Call Expressions
	//==========================================================================

	describe("TypeChecker.typeCheck - call", () => {
		it("should type check valid operator call with node refs", () => {
			const defs = emptyDefs();
			const checker = new TypeChecker(testRegistry, defs);
			const env = emptyTypeEnv();

			const callExpr: Expr = {
				kind: "call",
				ns: "core",
				name: "add",
				args: ["node1", "node2"],
			};

			const result = checker.typeCheck(callExpr, env);

			assert.strictEqual(result.type.kind, "int");
		});

		it("should type check valid operator call with inline expressions", () => {
			const defs = emptyDefs();
			const checker = new TypeChecker(testRegistry, defs);
			const env = emptyTypeEnv();

			const callExpr: Expr = {
				kind: "call",
				ns: "core",
				name: "add",
				args: [
					{ kind: "lit", type: intType, value: 5 },
					{ kind: "lit", type: intType, value: 3 },
				],
			};

			const result = checker.typeCheck(callExpr, env);

			assert.strictEqual(result.type.kind, "int");
		});

		it("should type check operator call returning bool", () => {
			const defs = emptyDefs();
			const checker = new TypeChecker(testRegistry, defs);
			const env = emptyTypeEnv();

			const callExpr: Expr = {
				kind: "call",
				ns: "core",
				name: "lt",
				args: [
					{ kind: "lit", type: intType, value: 1 },
					{ kind: "lit", type: intType, value: 2 },
				],
			};

			const result = checker.typeCheck(callExpr, env);

			assert.strictEqual(result.type.kind, "bool");
		});

		it("should throw arity error for wrong argument count", () => {
			const defs = emptyDefs();
			const checker = new TypeChecker(testRegistry, defs);
			const env = emptyTypeEnv();

			const callExpr: Expr = {
				kind: "call",
				ns: "core",
				name: "add",
				args: ["node1"],
			};

			assert.throws(
				() => checker.typeCheck(callExpr, env),
				/Arity error.*expects 2 arguments, got 1/,
			);
		});

		it("should throw type error for mismatched inline expression types", () => {
			const defs = emptyDefs();
			const checker = new TypeChecker(testRegistry, defs);
			const env = emptyTypeEnv();

			const callExpr: Expr = {
				kind: "call",
				ns: "core",
				name: "add",
				args: [
					{ kind: "lit", type: intType, value: 5 },
					{ kind: "lit", type: boolType, value: true }, // Wrong type
				],
			};

			assert.throws(
				() => checker.typeCheck(callExpr, env),
				/Type error.*expected int, got bool/,
			);
		});

		it("should throw unknown operator error", () => {
			const defs = emptyDefs();
			const checker = new TypeChecker(testRegistry, defs);
			const env = emptyTypeEnv();

			const callExpr: Expr = {
				kind: "call",
				ns: "unknown",
				name: "foo",
				args: [],
			};

			assert.throws(
				() => checker.typeCheck(callExpr, env),
				/Unknown operator: unknown:foo/,
			);
		});
	});

	//==========================================================================
	// TypeChecker Class - If Expressions
	//==========================================================================

	describe("TypeChecker.typeCheck - if", () => {
		it("should type check if expression with declared type", () => {
			const defs = emptyDefs();
			const checker = new TypeChecker(testRegistry, defs);
			const env = emptyTypeEnv();

			const ifExpr: Expr = {
				kind: "if",
				cond: "condNode",
				then: "thenNode",
				else: "elseNode",
				type: intType,
			};

			const result = checker.typeCheck(ifExpr, env);

			assert.deepStrictEqual(result.type, intType);
		});

		it("should type check if expression with bool result type", () => {
			const defs = emptyDefs();
			const checker = new TypeChecker(testRegistry, defs);
			const env = emptyTypeEnv();

			const ifExpr: Expr = {
				kind: "if",
				cond: "condNode",
				then: "thenNode",
				else: "elseNode",
				type: boolType,
			};

			const result = checker.typeCheck(ifExpr, env);

			assert.deepStrictEqual(result.type, boolType);
		});
	});

	//==========================================================================
	// TypeChecker Class - Let Expressions
	//==========================================================================

	describe("TypeChecker.typeCheck - let", () => {
		it("should type check let expression", () => {
			const defs = emptyDefs();
			const checker = new TypeChecker(testRegistry, defs);
			const env = emptyTypeEnv();

			const letExpr: Expr = {
				kind: "let",
				name: "x",
				value: "valueNode",
				body: "bodyNode",
			};

			const result = checker.typeCheck(letExpr, env);

			assert.strictEqual(result.type.kind, "int");
		});
	});

	//==========================================================================
	// TypeChecker Class - Lambda Expressions
	//==========================================================================

	describe("TypeChecker.typeCheck - lambda", () => {
		it("should type check lambda with correct function type", () => {
			const defs = emptyDefs();
			const checker = new TypeChecker(testRegistry, defs);
			const env = emptyTypeEnv();

			const lambdaType: Type = fnTypeCtor([intType], intType);
			const lambdaExpr: Expr = {
				kind: "lambda",
				params: ["x"],
				body: "bodyNode",
				type: lambdaType,
			};

			const result = checker.typeCheck(lambdaExpr, env);

			assert.deepStrictEqual(result.type, lambdaType);
			assert.strictEqual(result.type.kind, "fn");
		});

		it("should type check lambda with multiple parameters", () => {
			const defs = emptyDefs();
			const checker = new TypeChecker(testRegistry, defs);
			const env = emptyTypeEnv();

			const lambdaType: Type = fnTypeCtor([intType, intType], intType);
			const lambdaExpr: Expr = {
				kind: "lambda",
				params: ["x", "y"],
				body: "bodyNode",
				type: lambdaType,
			};

			const result = checker.typeCheck(lambdaExpr, env);

			assert.strictEqual(result.type.kind, "fn");
			assert.strictEqual(result.type.params.length, 2);
		});

		it("should throw type error for lambda with non-function type", () => {
			const defs = emptyDefs();
			const checker = new TypeChecker(testRegistry, defs);
			const env = emptyTypeEnv();

			const lambdaExpr: Expr = {
				kind: "lambda",
				params: ["x"],
				body: "bodyNode",
				type: intType, // Wrong: should be fn type
			};

			assert.throws(
				() => checker.typeCheck(lambdaExpr, env),
				/Type error.*expected fn/,
			);
		});
	});

	//==========================================================================
	// TypeChecker Class - Fix Expressions
	//==========================================================================

	describe("TypeChecker.typeCheck - fix", () => {
		it("should type check fix expression", () => {
			const defs = emptyDefs();
			const checker = new TypeChecker(testRegistry, defs);
			const env = emptyTypeEnv();

			const fixExpr: Expr = {
				kind: "fix",
				fn: "fnNode",
				type: intType,
			};

			const result = checker.typeCheck(fixExpr, env);

			assert.deepStrictEqual(result.type, intType);
		});
	});

	//==========================================================================
	// TypeChecker Class - Predicate Expressions
	//==========================================================================

	describe("TypeChecker.typeCheck - predicate", () => {
		it("should type check predicate expression", () => {
			const defs = emptyDefs();
			const checker = new TypeChecker(testRegistry, defs);
			const env = emptyTypeEnv();

			const predExpr: Expr = {
				kind: "predicate",
				name: "isPositive",
				value: "valueNode",
			};

			const result = checker.typeCheck(predExpr, env);

			assert.deepStrictEqual(result.type, boolType);
		});
	});

	//==========================================================================
	// TypeChecker Class - AirRef Expressions
	//==========================================================================

	describe("TypeChecker.typeCheck - airRef", () => {
		it("should type check valid airRef", () => {
			const defs = emptyDefs();
			const airDef = {
				ns: "test",
				name: "double",
				params: ["x"],
				result: intType,
				body: { kind: "ref", id: "x" },
			};
			const defsWithDef = registerDef(defs, airDef);

			const checker = new TypeChecker(testRegistry, defsWithDef);
			const env = emptyTypeEnv();

			const airRefExpr: Expr = {
				kind: "airRef",
				ns: "test",
				name: "double",
				args: ["argNode"],
			};

			const result = checker.typeCheck(airRefExpr, env);

			assert.deepStrictEqual(result.type, intType);
		});

		it("should throw arity error for airRef with wrong arg count", () => {
			const defs = emptyDefs();
			const airDef = {
				ns: "test",
				name: "double",
				params: ["x"],
				result: intType,
				body: { kind: "ref", id: "x" },
			};
			const defsWithDef = registerDef(defs, airDef);

			const checker = new TypeChecker(testRegistry, defsWithDef);
			const env = emptyTypeEnv();

			const airRefExpr: Expr = {
				kind: "airRef",
				ns: "test",
				name: "double",
				args: ["arg1", "arg2"], // Too many args
			};

			assert.throws(
				() => checker.typeCheck(airRefExpr, env),
				/Arity error.*expects 1 arguments, got 2/,
			);
		});

		it("should throw unknown definition error", () => {
			const defs = emptyDefs();
			const checker = new TypeChecker(testRegistry, defs);
			const env = emptyTypeEnv();

			const airRefExpr: Expr = {
				kind: "airRef",
				ns: "unknown",
				name: "foo",
				args: [],
			};

			assert.throws(
				() => checker.typeCheck(airRefExpr, env),
				/Unknown definition: unknown:foo/,
			);
		});
	});

	//==========================================================================
	// TypeChecker Class - Ref Expressions
	//==========================================================================

	describe("TypeChecker.typeCheck - ref", () => {
		it("should look up variable reference in environment", () => {
			const defs = emptyDefs();
			const checker = new TypeChecker(testRegistry, defs);
			const env = extendTypeEnv(emptyTypeEnv(), "myVar", stringType);

			const refExpr: Expr = {
				kind: "ref",
				id: "myVar",
			};

			const result = checker.typeCheck(refExpr, env);

			assert.deepStrictEqual(result.type, stringType);
		});

		it("should throw error for unbound ref", () => {
			const defs = emptyDefs();
			const checker = new TypeChecker(testRegistry, defs);
			const env = emptyTypeEnv();

			const refExpr: Expr = {
				kind: "ref",
				id: "unknownNode",
			};

			assert.throws(
				() => checker.typeCheck(refExpr, env),
				/Ref must be resolved during program type checking/,
			);
		});
	});

	//==========================================================================
	// Program Type Checking
	//==========================================================================

	describe("typeCheckProgram", () => {
		it("should type check simple program with literals", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "result",
						expr: { kind: "lit", type: intType, value: 42 },
					},
				],
				result: "result",
			};

			const defs = emptyDefs();
			const result = typeCheckProgram(doc, testRegistry, defs);

			assert.ok(result.nodeTypes.has("result"));
			assert.deepStrictEqual(result.nodeTypes.get("result"), intType);
			assert.deepStrictEqual(result.resultType, intType);
		});

		it("should type check program with operator call", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "a",
						expr: { kind: "lit", type: intType, value: 5 },
					},
					{
						id: "b",
						expr: { kind: "lit", type: intType, value: 3 },
					},
					{
						id: "sum",
						expr: {
							kind: "call",
							ns: "core",
							name: "add",
							args: ["a", "b"],
						},
					},
				],
				result: "sum",
			};

			const defs = emptyDefs();
			const result = typeCheckProgram(doc, testRegistry, defs);

			assert.deepStrictEqual(result.nodeTypes.get("sum"), intType);
			assert.deepStrictEqual(result.resultType, intType);
		});

		it("should type check program with inline expressions in call", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "x",
						expr: { kind: "lit", type: intType, value: 10 },
					},
					{
						id: "sum",
						expr: {
							kind: "call",
							ns: "core",
							name: "add",
							args: ["x", { kind: "lit", type: intType, value: 5 }],
						},
					},
				],
				result: "sum",
			};

			const defs = emptyDefs();
			const result = typeCheckProgram(doc, testRegistry, defs);

			assert.deepStrictEqual(result.nodeTypes.get("sum"), intType);
		});

		it("should type check program with if expression", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "cond",
						expr: { kind: "lit", type: boolType, value: true },
					},
					{
						id: "thenVal",
						expr: { kind: "lit", type: intType, value: 1 },
					},
					{
						id: "elseVal",
						expr: { kind: "lit", type: intType, value: 2 },
					},
					{
						id: "result",
						expr: {
							kind: "if",
							cond: "cond",
							then: "thenVal",
							else: "elseVal",
							type: intType,
						},
					},
				],
				result: "result",
			};

			const defs = emptyDefs();
			const result = typeCheckProgram(doc, testRegistry, defs);

			assert.deepStrictEqual(result.nodeTypes.get("result"), intType);
		});

		it("should type check program with let expression", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "val",
						expr: { kind: "lit", type: intType, value: 42 },
					},
					{
						id: "result",
						expr: {
							kind: "let",
							name: "x",
							value: "val",
							body: {
								kind: "var",
								name: "x",
							},
						},
					},
				],
				result: "result",
			};

			const defs = emptyDefs();
			const result = typeCheckProgram(doc, testRegistry, defs);

			assert.deepStrictEqual(result.nodeTypes.get("result"), intType);
		});

		it("should type check program with lambda", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "body",
						expr: { kind: "lit", type: intType, value: 42 },
					},
					{
						id: "identity",
						expr: {
							kind: "lambda",
							params: ["x"],
							body: "body",
							type: fnTypeCtor([intType], intType),
						},
					},
				],
				result: "identity",
			};

			const defs = emptyDefs();
			const result = typeCheckProgram(doc, testRegistry, defs);

			const lambdaType = result.nodeTypes.get("identity");
			assert.strictEqual(lambdaType?.kind, "fn");
			assert.deepStrictEqual(lambdaType, fnTypeCtor([intType], intType));
		});

		it("should type check program with callExpr", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "body",
						expr: { kind: "lit", type: intType, value: 42 },
					},
					{
						id: "f",
						expr: {
							kind: "lambda",
							params: ["x"],
							body: "body",
							type: fnTypeCtor([intType], intType),
						},
					},
					{
						id: "arg",
						expr: { kind: "lit", type: intType, value: 10 },
					},
					{
						id: "result",
						expr: {
							kind: "callExpr",
							fn: "f",
							args: ["arg"],
						},
					},
				],
				result: "result",
			};

			const defs = emptyDefs();
			const result = typeCheckProgram(doc, testRegistry, defs);

			assert.deepStrictEqual(result.nodeTypes.get("result"), intType);
		});

		it("should type check program with fix", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "body",
						expr: { kind: "lit", type: intType, value: 42 },
					},
					{
						id: "fn",
						expr: {
							kind: "lambda",
							params: ["f"],
							body: "body",
							type: fnTypeCtor([intType], intType),
						},
					},
					{
						id: "result",
						expr: {
							kind: "fix",
							fn: "fn",
							type: intType,
						},
					},
				],
				result: "result",
			};

			const defs = emptyDefs();
			const result = typeCheckProgram(doc, testRegistry, defs);

			assert.deepStrictEqual(result.nodeTypes.get("result"), intType);
		});

		it("should throw error for unknown result node", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "node1",
						expr: { kind: "lit", type: intType, value: 42 },
					},
				],
				result: "unknownResult",
			};

			const defs = emptyDefs();

			assert.throws(
				() => typeCheckProgram(doc, testRegistry, defs),
				/Result node not found: unknownResult/,
			);
		});
	});

	//==========================================================================
	// EIR Program Type Checking
	//==========================================================================

	describe("typeCheckEIRProgram", () => {
		it("should type check EIR seq expression", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "first",
						expr: { kind: "lit", type: intType, value: 1 },
					},
					{
						id: "then",
						expr: { kind: "lit", type: intType, value: 2 },
					},
					{
						id: "result",
						expr: {
							kind: "seq",
							first: "first",
							then: "then",
						},
					},
				],
				result: "result",
			};

			const effects = new Map();
			const defs = emptyDefs();
			const result = typeCheckEIRProgram(doc, testRegistry, defs, effects);

			assert.deepStrictEqual(result.nodeTypes.get("result"), intType);
		});

		it("should type check EIR while expression", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "cond",
						expr: { kind: "lit", type: boolType, value: true },
					},
					{
						id: "body",
						expr: { kind: "lit", type: voidType, value: null },
					},
					{
						id: "result",
						expr: {
							kind: "while",
							cond: "cond",
							body: "body",
						},
					},
				],
				result: "result",
			};

			const effects = new Map();
			const defs = emptyDefs();
			const result = typeCheckEIRProgram(doc, testRegistry, defs, effects);

			assert.deepStrictEqual(result.nodeTypes.get("result"), voidType);
		});

		it("should type check EIR assign expression", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "val",
						expr: { kind: "lit", type: intType, value: 42 },
					},
					{
						id: "result",
						expr: {
							kind: "assign",
							target: "x",
							value: "val",
						},
					},
				],
				result: "result",
			};

			const effects = new Map();
			const defs = emptyDefs();
			const result = typeCheckEIRProgram(doc, testRegistry, defs, effects);

			assert.deepStrictEqual(result.nodeTypes.get("result"), voidType);
		});

		it("should type check EIR iter expression", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "nums",
						expr: {
							kind: "lit",
							type: listType(intType),
							value: [
								{ kind: "int", value: 1 },
								{ kind: "int", value: 2 },
							],
						},
					},
					{
						id: "body",
						expr: { kind: "lit", type: voidType, value: null },
					},
					{
						id: "result",
						expr: {
							kind: "iter",
							var: "x",
							iter: "nums",
							body: "body",
						},
					},
				],
				result: "result",
			};

			const effects = new Map();
			const defs = emptyDefs();
			const result = typeCheckEIRProgram(doc, testRegistry, defs, effects);

			assert.deepStrictEqual(result.nodeTypes.get("result"), voidType);
		});

		it("should type check EIR refCell expression", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "val",
						expr: { kind: "lit", type: intType, value: 42 },
					},
					{
						id: "result",
						expr: {
							kind: "assign",
							target: "x",
							value: "val",
						},
					},
					{
						id: "ref",
						expr: {
							kind: "refCell",
							target: "x",
						},
					},
				],
				result: "ref",
			};

			const effects = new Map();
			const defs = emptyDefs();
			const result = typeCheckEIRProgram(doc, testRegistry, defs, effects);

			const refType = result.nodeTypes.get("ref");
			assert.strictEqual(refType?.kind, "ref");
			if (refType?.kind === "ref") {
				assert.deepStrictEqual(refType.of, intType);
			}
		});

		it("should type check EIR deref expression", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "val",
						expr: { kind: "lit", type: intType, value: 42 },
					},
					{
						id: "assign1",
						expr: {
							kind: "assign",
							target: "x",
							value: "val",
						},
					},
					{
						id: "ref",
						expr: {
							kind: "refCell",
							target: "x",
						},
					},
					{
						id: "result",
						expr: {
							kind: "deref",
							target: "ref",
						},
					},
				],
				result: "result",
			};

			const effects = new Map();
			const defs = emptyDefs();
			const result = typeCheckEIRProgram(doc, testRegistry, defs, effects);

			assert.deepStrictEqual(result.nodeTypes.get("result"), intType);
		});

		it("should type check EIR try expression with success path", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "val",
						expr: { kind: "lit", type: intType, value: 42 },
					},
					{
						id: "result",
						expr: {
							kind: "try",
							tryBody: "val",
							catchParam: "e",
							catchBody: "fallback",
							fallback: "val",
						},
					},
					{
						id: "fallback",
						expr: { kind: "lit", type: intType, value: 0 },
					},
				],
				result: "result",
			};

			const effects = new Map();
			const defs = emptyDefs();
			const result = typeCheckEIRProgram(doc, testRegistry, defs, effects);

			assert.deepStrictEqual(result.nodeTypes.get("result"), intType);
		});

		it("should type check EIR try expression with catch path", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "err",
						expr: {
							kind: "lit",
							type: { kind: "error", code: 1, message: "test" },
							value: { code: 1, message: "test" },
						},
					},
					{
						id: "fallback",
						expr: { kind: "lit", type: intType, value: 0 },
					},
					{
						id: "result",
						expr: {
							kind: "try",
							tryBody: "err",
							catchParam: "e",
							catchBody: "fallback",
						},
					},
				],
				result: "result",
			};

			const effects = new Map();
			const defs = emptyDefs();
			const result = typeCheckEIRProgram(doc, testRegistry, defs, effects);

			assert.deepStrictEqual(result.nodeTypes.get("result"), intType);
		});

		it("should type check EIR while loop expression", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "true",
						expr: { kind: "lit", type: boolType, value: true },
					},
					{
						id: "body",
						expr: { kind: "lit", type: intType, value: 1 },
					},
					{
						id: "result",
						expr: {
							kind: "while",
							cond: "true",
							body: "body",
						},
					},
				],
				result: "result",
			};

			const effects = new Map();
			const defs = emptyDefs();
			const result = typeCheckEIRProgram(doc, testRegistry, defs, effects);

			assert.deepStrictEqual(result.nodeTypes.get("result"), voidType);
		});

		it("should type check EIR for loop expression", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "init",
						expr: { kind: "lit", type: intType, value: 0 },
					},
					{
						id: "cond",
						expr: { kind: "lit", type: boolType, value: false },
					},
					{
						id: "update",
						expr: { kind: "lit", type: intType, value: 1 },
					},
					{
						id: "body",
						expr: { kind: "lit", type: intType, value: 42 },
					},
					{
						id: "result",
						expr: {
							kind: "for",
							var: "i",
							init: "init",
							cond: "cond",
							update: "update",
							body: "body",
						},
					},
				],
				result: "result",
			};

			const effects = new Map();
			const defs = emptyDefs();
			const result = typeCheckEIRProgram(doc, testRegistry, defs, effects);

			assert.deepStrictEqual(result.nodeTypes.get("result"), voidType);
		});

		it("should type check EIR seq expression", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "first",
						expr: { kind: "lit", type: intType, value: 1 },
					},
					{
						id: "second",
						expr: { kind: "lit", type: intType, value: 2 },
					},
					{
						id: "result",
						expr: {
							kind: "seq",
							first: "first",
							then: "second",
						},
					},
				],
				result: "result",
			};

			const effects = new Map();
			const defs = emptyDefs();
			const result = typeCheckEIRProgram(doc, testRegistry, defs, effects);

			assert.deepStrictEqual(result.nodeTypes.get("result"), intType);
		});
	});

	//==========================================================================
	// Additional Tests for Coverage - AIR/CIR Features
	//==========================================================================

	describe("typeCheckProgram - Additional Coverage", () => {
		it("should handle lambda with multiple parameters", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "body",
						expr: { kind: "lit", type: intType, value: 42 },
					},
					{
						id: "lambda",
						expr: {
							kind: "lambda",
							type: { kind: "fn", params: [intType, intType, intType], returns: intType },
							params: ["x", "y", "z"],
							body: "body",
						},
					},
					{
						id: "a",
						expr: { kind: "lit", type: intType, value: 1 },
					},
					{
						id: "b",
						expr: { kind: "lit", type: intType, value: 2 },
					},
					{
						id: "c",
						expr: { kind: "lit", type: intType, value: 3 },
					},
					{
						id: "result",
						expr: {
							kind: "callExpr",
							fn: "lambda",
							args: ["a", "b", "c"],
						},
					},
				],
				result: "result",
			};

			const defs = emptyDefs();
			const result = typeCheckProgram(doc, testRegistry, defs);

			// Should have a function type for lambda
			assert.ok(result.nodeTypes.has("lambda"));
		});

		it("should handle nested let expressions", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "yVal",
						expr: { kind: "lit", type: intType, value: 2 },
					},
					{
						id: "useY",
						expr: { kind: "var", name: "y" },
					},
					{
						id: "inner",
						expr: {
							kind: "let",
							name: "y",
							value: "yVal",
							body: "useY",
						},
					},
					{
						id: "useX",
						expr: { kind: "var", name: "x" },
					},
					{
						id: "outer",
						expr: {
							kind: "let",
							name: "x",
							value: "inner",
							body: "useX",
						},
					},
					{
						id: "result",
						expr: { kind: "lit", type: intType, value: 0 },
					},
				],
				result: "result",
			};

			const defs = emptyDefs();
			const result = typeCheckProgram(doc, testRegistry, defs);

			assert.ok(result.nodeTypes.has("result"));
		});

		it("should handle complex if-else chains", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "cond1",
						expr: { kind: "lit", type: boolType, value: true },
					},
					{
						id: "cond2",
						expr: { kind: "lit", type: boolType, value: false },
					},
					{
						id: "branch1",
						expr: { kind: "lit", type: intType, value: 1 },
					},
					{
						id: "branch2",
						expr: { kind: "lit", type: intType, value: 2 },
					},
					{
						id: "branch3",
						expr: { kind: "lit", type: intType, value: 3 },
					},
					{
						id: "innerIf",
						expr: {
							kind: "if",
							type: intType,
							cond: "cond2",
							then: "branch2",
							else: "branch3",
						},
					},
					{
						id: "result",
						expr: {
							kind: "if",
							type: intType,
							cond: "cond1",
							then: "branch1",
							else: "innerIf",
						},
					},
				],
				result: "result",
			};

			const defs = emptyDefs();
			const result = typeCheckProgram(doc, testRegistry, defs);

			assert.deepStrictEqual(result.nodeTypes.get("result"), intType);
		});

		it("should handle ref expressions to other nodes", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "value",
						expr: { kind: "lit", type: intType, value: 42 },
					},
					{
						id: "refToValue",
						expr: { kind: "ref", id: "value" },
					},
					{
						id: "result",
						expr: { kind: "var", name: "dummy" },
					},
				],
				result: "result",
			};

			const defs = emptyDefs();
			const result = typeCheckProgram(doc, testRegistry, defs);

			assert.deepStrictEqual(result.nodeTypes.get("result"), intType);
		});
	});

	//==========================================================================
	// Error Cases
	//==========================================================================

	describe("TypeChecker - Error Cases", () => {
		it("should throw error for unknown expression kind", () => {
			const defs = emptyDefs();
			const checker = new TypeChecker(testRegistry, defs);
			const env = emptyTypeEnv();

			// Create an invalid expression by casting through unknown
			const invalidExpr = {
				kind: "not-a-real-kind",
			} as unknown as Expr;

			assert.throws(
				() => checker.typeCheck(invalidExpr, env),
				/Unexpected value/,
			);
		});

		it("should handle unknown operator gracefully", () => {
			const defs = emptyDefs();
			const checker = new TypeChecker(testRegistry, defs);
			const env = emptyTypeEnv();

			const callExpr: Expr = {
				kind: "call",
				ns: "unknown",
				name: "op",
				args: [],
			};

			// Unknown operators throw an error
			assert.throws(
				() => checker.typeCheck(callExpr, env),
				/Unknown operator: unknown:op/,
			);
		});
	});
});
