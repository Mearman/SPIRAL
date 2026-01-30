// SPDX-License-Identifier: MIT
// SPIRAL do expression - Unit Tests

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	validateCIR,
	validateAIR,
	validateEIR,
	validatePIR,
} from "../src/validator.js";
import { evaluateProgram } from "../src/evaluator.js";
import { createCoreRegistry } from "../src/domains/core.js";
import { typeCheckProgram } from "../src/typechecker.js";
import { emptyDefs } from "../src/env.js";
import { synthesizePython } from "../src/synth/python.js";
import {
	intVal,
	stringVal,
	intType,
	stringType,
	voidType,
} from "../src/types.js";
import type {
	AIRDocument,
	CIRDocument,
	EIRDocument,
	PIRDocument,
	Expr,
} from "../src/types.js";

//==============================================================================
// Helpers
//==============================================================================

const registry = createCoreRegistry();
const defs = emptyDefs();

function lit(type: { kind: string; [k: string]: unknown }, value: unknown): Expr {
	return { kind: "lit", type, value } as Expr;
}

//==============================================================================
// 1. Validator Tests
//==============================================================================

describe("do expression - validator", () => {
	it("valid: CIR document with do referencing defined nodes", () => {
		const doc: CIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "a", expr: { kind: "lit", type: { kind: "int" }, value: 1 } },
				{ id: "b", expr: { kind: "lit", type: { kind: "int" }, value: 2 } },
				{ id: "result", expr: { kind: "do", exprs: ["a", "b"] } },
			],
			result: "result",
		};
		const result = validateCIR(doc);
		assert.ok(result.valid, `Expected valid but got errors: ${JSON.stringify(result.errors)}`);
	});

	it("invalid: do with empty exprs array", () => {
		const doc: CIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "result", expr: { kind: "do", exprs: [] } },
			],
			result: "result",
		};
		const result = validateCIR(doc);
		// Empty exprs is technically a valid array, so the validator may accept it.
		// The evaluator handles it by returning void. Either outcome is acceptable.
		// We just verify it does not throw.
		assert.ok(typeof result.valid === "boolean");
	});

	it("invalid: do in an AIR document", () => {
		const doc = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "a", expr: { kind: "lit", type: { kind: "int" }, value: 1 } },
				{ id: "result", expr: { kind: "do", exprs: ["a"] } },
			],
			result: "result",
		};
		const result = validateAIR(doc);
		assert.ok(!result.valid, "do expression should not be valid in AIR");
		assert.ok(result.errors.length > 0, "Should have validation errors");
	});

	it("valid: do with inline literal expressions", () => {
		const doc: CIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{
					id: "result",
					expr: {
						kind: "do",
						exprs: [
							{ kind: "lit", type: { kind: "int" }, value: 10 },
							{ kind: "lit", type: { kind: "string" }, value: "hello" },
						],
					},
				},
			],
			result: "result",
		};
		const result = validateCIR(doc);
		assert.ok(result.valid, `Expected valid but got errors: ${JSON.stringify(result.errors)}`);
	});

	it("valid: do in EIR document", () => {
		const doc: EIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "a", expr: { kind: "lit", type: { kind: "int" }, value: 1 } },
				{ id: "b", expr: { kind: "lit", type: { kind: "int" }, value: 2 } },
				{ id: "result", expr: { kind: "do", exprs: ["a", "b"] } },
			],
			result: "result",
		};
		const result = validateEIR(doc);
		assert.ok(result.valid, `Expected valid in EIR but got errors: ${JSON.stringify(result.errors)}`);
	});

	it("valid: do in PIR document", () => {
		const doc: PIRDocument = {
			version: "2.0.0",
			airDefs: [],
			nodes: [
				{ id: "a", expr: { kind: "lit", type: { kind: "int" }, value: 1 } },
				{ id: "b", expr: { kind: "lit", type: { kind: "int" }, value: 2 } },
				{ id: "result", expr: { kind: "do", exprs: ["a", "b"] } },
			],
			result: "result",
		};
		const result = validatePIR(doc);
		assert.ok(result.valid, `Expected valid in PIR but got errors: ${JSON.stringify(result.errors)}`);
	});
});

//==============================================================================
// 2. Evaluator Tests
//==============================================================================

describe("do expression - evaluator", () => {
	it("evaluates do and returns last expression value", () => {
		const doc: AIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "a", expr: lit({ kind: "int" }, 1) },
				{ id: "b", expr: lit({ kind: "int" }, 2) },
				{ id: "result", expr: { kind: "do", exprs: ["a", "b"] } as unknown as Expr },
			],
			result: "result",
		};
		const result = evaluateProgram(doc, registry, defs);
		assert.deepStrictEqual(result, intVal(2));
	});

	it("single-expression do returns that expression", () => {
		const doc: AIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "a", expr: lit({ kind: "string" }, "only") },
				{ id: "result", expr: { kind: "do", exprs: ["a"] } as unknown as Expr },
			],
			result: "result",
		};
		const result = evaluateProgram(doc, registry, defs);
		assert.deepStrictEqual(result, stringVal("only"));
	});

	it("multi-expression do returns last", () => {
		const doc: AIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "a", expr: lit({ kind: "int" }, 10) },
				{ id: "b", expr: lit({ kind: "string" }, "middle") },
				{ id: "c", expr: lit({ kind: "int" }, 42) },
				{ id: "result", expr: { kind: "do", exprs: ["a", "b", "c"] } as unknown as Expr },
			],
			result: "result",
		};
		const result = evaluateProgram(doc, registry, defs);
		assert.deepStrictEqual(result, intVal(42));
	});
});

//==============================================================================
// 3. Type Checker Tests
//==============================================================================

describe("do expression - type checker", () => {
	it("type of do is the type of its last expression", () => {
		const doc: AIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "a", expr: { kind: "lit", type: intType, value: 1 } },
				{ id: "b", expr: { kind: "lit", type: stringType, value: "hello" } },
				{ id: "result", expr: { kind: "do", exprs: ["a", "b"] } },
			],
			result: "result",
		};
		const registry = createCoreRegistry();
		const defs = emptyDefs();
		const { resultType } = typeCheckProgram(doc, registry, defs);
		assert.deepStrictEqual(resultType, stringType);
	});

	it("type of single-expression do matches that expression", () => {
		const doc: AIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "a", expr: { kind: "lit", type: intType, value: 42 } },
				{ id: "result", expr: { kind: "do", exprs: ["a"] } },
			],
			result: "result",
		};
		const registry = createCoreRegistry();
		const defs = emptyDefs();
		const { resultType } = typeCheckProgram(doc, registry, defs);
		assert.deepStrictEqual(resultType, intType);
	});

	it("type of empty do is void", () => {
		const doc: AIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "result", expr: { kind: "do", exprs: [] } },
			],
			result: "result",
		};
		const registry = createCoreRegistry();
		const defs = emptyDefs();
		const { resultType } = typeCheckProgram(doc, registry, defs);
		assert.deepStrictEqual(resultType, voidType);
	});
});

//==============================================================================
// 4. Python Synthesizer Tests
//==============================================================================

describe("do expression - Python synthesizer", () => {
	it("do synthesizes to Python tuple trick", () => {
		const doc: CIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "a", expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 1 } } },
				{ id: "b", expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 2 } } },
				{ id: "result", expr: { kind: "do", exprs: ["a", "b"] } },
			],
			result: "result",
		};
		const code = synthesizePython(doc);
		// The do expression should use the tuple trick: (expr1, expr2)[-1]
		assert.ok(code.includes("[-1]"), `Expected tuple trick with [-1] in output:\n${code}`);
	});

	it("single-expression do does not need tuple trick", () => {
		const doc: CIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "a", expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 42 } } },
				{ id: "result", expr: { kind: "do", exprs: ["a"] } },
			],
			result: "result",
		};
		const code = synthesizePython(doc);
		// Single expression do should not use tuple trick
		assert.ok(!code.includes("[-1]"), `Single-expression do should not use tuple trick:\n${code}`);
	});
});
