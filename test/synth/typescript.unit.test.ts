// SPDX-License-Identifier: MIT
// SPIRAL TypeScript Synthesizer - Unit Tests

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	synthesizeTypeScript,
	type TypeScriptSynthOptions,
} from "../../src/synth/typescript.js";
import type {
	AIRDocument,
	CIRDocument,
	EIRDocument,
	LIRDocument,
	Node,
} from "../../src/types.js";

//==============================================================================
// Test Fixtures
//==============================================================================

// Simple AIR document with arithmetic
const airArithmeticDoc: AIRDocument = {
	version: "1.0.0",
	airDefs: [
		{
			ns: "core",
			name: "add",
			params: ["a", "b"],
			result: { kind: "int" },
			body: {
				kind: "call",
				ns: "core",
				name: "add",
				args: [{ kind: "ref", id: "a" }, { kind: "ref", id: "b" }],
			},
		},
	],
	nodes: [
		{
			id: "x",
			expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 5 } },
		},
		{
			id: "y",
			expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 3 } },
		},
		{
			id: "sum",
			expr: {
				kind: "call",
				ns: "core",
				name: "add",
				args: ["x", "y"],
			},
		},
	],
	result: "sum",
};

// AIR document with boolean operations
const airBooleanDoc: AIRDocument = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "a",
			expr: { kind: "lit", type: { kind: "bool" }, value: { kind: "bool", value: true } },
		},
		{
			id: "b",
			expr: { kind: "lit", type: { kind: "bool" }, value: { kind: "bool", value: false } },
		},
		{
			id: "andResult",
			expr: {
				kind: "call",
				ns: "bool",
				name: "and",
				args: ["a", "b"],
			},
		},
		{
			id: "result",
			expr: {
				kind: "call",
				ns: "bool",
				name: "or",
				args: ["a", "b"],
			},
		},
	],
	result: "result",
};

// CIR document with lambda
const cirLambdaDoc: CIRDocument = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "x",
			expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 10 } },
		},
		{
			id: "increment",
			expr: {
				kind: "lambda",
				params: ["n"],
				body: "x",
			},
		},
		{
			id: "result",
			expr: {
				kind: "callExpr",
				fn: "increment",
				args: [],
			},
		},
	],
	result: "result",
};

// CIR document with fix (recursion)
const cirFixDoc: CIRDocument = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "factorial",
			expr: {
				kind: "lambda",
				params: ["n"],
				body: "n",
			},
		},
		{
			id: "result",
			expr: {
				kind: "fix",
				fn: "factorial",
			},
		},
	],
	result: "result",
};

// EIR document with sequencing and mutation
const eirMutationDoc: EIRDocument = {
	version: "1.0.0",
	airDefs: [
		{
			ns: "core",
			name: "add",
			params: ["a", "b"],
			result: { kind: "int" },
			body: { kind: "ref", id: "a" },
		},
	],
	nodes: [
		{
			id: "counter",
			expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 0 } },
		},
		{
			id: "assign1",
			expr: {
				kind: "assign",
				target: "counter",
				value: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 5 } },
			},
		},
		{
			id: "result",
			expr: { kind: "ref", id: "counter" },
		},
	],
	result: "result",
};

// EIR document with while loop
const eirWhileDoc: EIRDocument = {
	version: "1.0.0",
	airDefs: [
		{
			ns: "core",
			name: "lt",
			params: ["a", "b"],
			result: { kind: "bool" },
			body: { kind: "lit", type: { kind: "bool" }, value: { kind: "bool", value: true } },
		},
	],
	nodes: [
		{
			id: "i",
			expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 0 } },
		},
		{
			id: "limit",
			expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 3 } },
		},
		{
			id: "cond",
			expr: {
				kind: "call",
				ns: "core",
				name: "lt",
				args: ["i", "limit"],
			},
		},
		{
			id: "body",
			expr: { kind: "lit", type: { kind: "void" }, value: { kind: "void" } },
		},
		{
			id: "loop",
			expr: {
				kind: "while",
				cond: "cond",
				body: "body",
			},
		},
	],
	result: "loop",
};

// EIR document with iter
const eirIterDoc: EIRDocument = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "items",
			expr: {
				kind: "lit",
				type: { kind: "list", of: { kind: "int" } },
				value: [
					{ kind: "int", value: 1 },
					{ kind: "int", value: 2 },
					{ kind: "int", value: 3 },
				],
			},
		},
		{
			id: "result",
			expr: {
				kind: "iter",
				var: "x",
				iter: "items",
				body: { kind: "lit", type: { kind: "void" }, value: { kind: "void" } },
			},
		},
	],
	result: "result",
};

// EIR document with effect
const eirEffectDoc: EIRDocument = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "msg",
			expr: { kind: "lit", type: { kind: "string" }, value: { kind: "string", value: "Hello" } },
		},
		{
			id: "result",
			expr: {
				kind: "effect",
				op: "print",
				args: ["msg"],
			},
		},
	],
	result: "result",
};

// EIR document with for loop
const eirForDoc: EIRDocument = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "init",
			expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 0 } },
		},
		{
			id: "cond",
			expr: { kind: "lit", type: { kind: "bool" }, value: { kind: "bool", value: true } },
		},
		{
			id: "update",
			expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 1 } },
		},
		{
			id: "body",
			expr: { kind: "lit", type: { kind: "void" }, value: { kind: "void" } },
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

// EIR document with try/catch
const eirTryDoc: EIRDocument = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "tryBody",
			expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 42 } },
		},
		{
			id: "catchBody",
			expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: -1 } },
		},
		{
			id: "result",
			expr: {
				kind: "try",
				tryBody: "tryBody",
				catchParam: "err",
				catchBody: "catchBody",
			},
		},
	],
	result: "result",
};

// LIR document with CFG blocks
const lirDoc: LIRDocument = {
	version: "1.0.0",
	nodes: [
		{
			id: "main",
			entry: "entry",
			blocks: [
				{
					id: "entry",
					instructions: [
						{
							kind: "assign",
							target: "x",
							value: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 42 } },
						},
					],
					terminator: {
						kind: "return",
						value: "x",
					},
				},
			],
		},
	],
	result: "main",
};

// Document with special characters in IDs
const specialCharsDoc: AIRDocument = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "node-with-dashes",
			expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 1 } },
		},
		{
			id: "node.with.dots",
			expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 2 } },
		},
		{
			id: "result",
			expr: {
				kind: "call",
				ns: "core",
				name: "add",
				args: ["node-with-dashes", "node.with.dots"],
			},
		},
	],
	result: "result",
};

// Document with all literal types
const allLiteralsDoc: AIRDocument = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "intVal",
			expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 42 } },
		},
		{
			id: "boolVal",
			expr: { kind: "lit", type: { kind: "bool" }, value: { kind: "bool", value: true } },
		},
		{
			id: "stringVal",
			expr: { kind: "lit", type: { kind: "string" }, value: { kind: "string", value: "hello" } },
		},
		{
			id: "listVal",
			expr: {
				kind: "lit",
				type: { kind: "list", of: { kind: "int" } },
				value: [
					{ kind: "int", value: 1 },
					{ kind: "int", value: 2 },
				],
			},
		},
		{
			id: "noneVal",
			expr: { kind: "lit", type: { kind: "option", of: { kind: "int" } }, value: null },
		},
	],
	result: "listVal",
};

//==============================================================================
// Test Suite
//==============================================================================

describe("TypeScript Synthesizer - Unit Tests", () => {

	//==========================================================================
	// AIR Document Tests
	//==========================================================================

	describe("AIR Documents", () => {
		it("should synthesize simple arithmetic", () => {
			const result = synthesizeTypeScript(airArithmeticDoc);
			assert.ok(result.includes("const v_x = 5;"));
			assert.ok(result.includes("const v_y = 3;"));
			assert.ok(result.includes("air_core_add"));
			assert.ok(result.includes("console.log(v_sum)"));
		});

		it("should include module name in header", () => {
			const opts: TypeScriptSynthOptions = { moduleName: "test_module" };
			const result = synthesizeTypeScript(airArithmeticDoc, opts);
			assert.ok(result.includes("// Module: test_module"));
		});

		it("should handle boolean operations", () => {
			const result = synthesizeTypeScript(airBooleanDoc);
			assert.ok(result.includes("const v_a = true;"));
			assert.ok(result.includes("const v_b = false;"));
			assert.ok(result.includes("&&"));
		});

		it("should handle AIR definitions", () => {
			const result = synthesizeTypeScript(airArithmeticDoc);
			assert.ok(result.includes("// AIR definitions"));
			assert.ok(result.includes("function air_core_add(a: any, b: any)"));
		});

		it("should sanitize IDs with special characters", () => {
			const result = synthesizeTypeScript(specialCharsDoc);
			assert.ok(result.includes("v_node_with_dashes"));
			assert.ok(result.includes("v_node_with_dots"));
		});
	});

	//==========================================================================
	// CIR Document Tests
	//==========================================================================

	describe("CIR Documents", () => {
		it("should synthesize lambda expressions with arrow syntax", () => {
			const result = synthesizeTypeScript(cirLambdaDoc);
			assert.ok(result.includes("=>"));
		});

		it("should synthesize fix combinator", () => {
			const result = synthesizeTypeScript(cirFixDoc);
			assert.ok(result.includes("=>"));
		});

		it("should handle call expressions", () => {
			const result = synthesizeTypeScript(cirLambdaDoc);
			assert.ok(result.includes("v_increment("));
		});
	});

	//==========================================================================
	// EIR Document Tests
	//==========================================================================

	describe("EIR Documents", () => {
		it("should synthesize assignment with mutable cells", () => {
			const result = synthesizeTypeScript(eirMutationDoc);
			assert.ok(result.includes("// Mutable cells"));
			assert.ok(result.includes("let cell_"));
		});

		it("should synthesize while loops as IIFE", () => {
			const result = synthesizeTypeScript(eirWhileDoc);
			assert.ok(result.includes("while ("));
			assert.ok(result.includes("(() =>"));
		});

		it("should synthesize iter expressions as IIFE", () => {
			const result = synthesizeTypeScript(eirIterDoc);
			assert.ok(result.includes("for (const x of"));
			assert.ok(result.includes("(() =>"));
		});

		it("should synthesize effect operations", () => {
			const result = synthesizeTypeScript(eirEffectDoc);
			assert.ok(result.includes('console.log("print"'));
		});

		it("should synthesize for loops as IIFE", () => {
			const result = synthesizeTypeScript(eirForDoc);
			assert.ok(result.includes("for (let i ="));
			assert.ok(result.includes("(() =>"));
		});

		it("should synthesize try/catch as IIFE", () => {
			const result = synthesizeTypeScript(eirTryDoc);
			assert.ok(result.includes("try {"));
			assert.ok(result.includes("catch (err)"));
			assert.ok(result.includes("(() =>"));
		});
	});

	//==========================================================================
	// LIR Document Tests
	//==========================================================================

	describe("LIR Documents", () => {
		it("should synthesize CFG-based documents", () => {
			const result = synthesizeTypeScript(lirDoc);
			assert.ok(result.includes("// IR Layer: LIR (CFG-based)"));
			assert.ok(result.includes("function executeLir("));
			assert.ok(result.includes("const blocks"));
		});

		it("should include LIR execution engine", () => {
			const result = synthesizeTypeScript(lirDoc);
			assert.ok(result.includes("while (true)"));
			assert.ok(result.includes("inst.kind === \"assign\""));
			assert.ok(result.includes("inst.kind === \"op\""));
			assert.ok(result.includes("inst.kind === \"phi\""));
		});

		it("should handle LIR terminators", () => {
			const result = synthesizeTypeScript(lirDoc);
			assert.ok(result.includes("term.kind === \"jump\""));
			assert.ok(result.includes("term.kind === \"branch\""));
			assert.ok(result.includes("term.kind === \"return\""));
			assert.ok(result.includes("term.kind === \"exit\""));
		});
	});

	//==========================================================================
	// Literal Tests
	//==========================================================================

	describe("Literal Values", () => {
		it("should synthesize integer literals", () => {
			const result = synthesizeTypeScript(allLiteralsDoc);
			assert.ok(result.includes("const v_intVal = 42;"));
		});

		it("should synthesize boolean literals (true/false)", () => {
			const result = synthesizeTypeScript(allLiteralsDoc);
			assert.ok(result.includes("const v_boolVal = true;"));
		});

		it("should synthesize string literals", () => {
			const result = synthesizeTypeScript(allLiteralsDoc);
			assert.ok(result.includes('const v_stringVal = "hello";'));
		});

		it("should synthesize list literals", () => {
			const result = synthesizeTypeScript(allLiteralsDoc);
			assert.ok(result.includes("const v_listVal = [1, 2];"));
		});

		it("should synthesize null values", () => {
			const result = synthesizeTypeScript(allLiteralsDoc);
			assert.ok(result.includes("const v_noneVal = null;"));
		});
	});

	//==========================================================================
	// Operator Tests
	//==========================================================================

	describe("Operator Mappings", () => {
		it("should map core:add to +", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "a", expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 1 } } },
					{ id: "b", expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 2 } } },
					{ id: "result", expr: { kind: "call", ns: "core", name: "add", args: ["a", "b"] } },
				],
				result: "result",
			};
			const result = synthesizeTypeScript(doc);
			assert.ok(result.includes("+"));
		});

		it("should map core:div to Math.floor", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "a", expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 10 } } },
					{ id: "b", expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 3 } } },
					{ id: "result", expr: { kind: "call", ns: "core", name: "div", args: ["a", "b"] } },
				],
				result: "result",
			};
			const result = synthesizeTypeScript(doc);
			assert.ok(result.includes("Math.floor("));
		});

		it("should map core:eq to ===", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "a", expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 1 } } },
					{ id: "b", expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 2 } } },
					{ id: "result", expr: { kind: "call", ns: "core", name: "eq", args: ["a", "b"] } },
				],
				result: "result",
			};
			const result = synthesizeTypeScript(doc);
			assert.ok(result.includes("==="));
		});

		it("should map boolean operators to && and ||", () => {
			const result = synthesizeTypeScript(airBooleanDoc);
			assert.ok(result.includes("&&"));
			assert.ok(result.includes("||"));
		});

		it("should map list:length to .length", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "lst",
						expr: {
							kind: "lit",
							type: { kind: "list", of: { kind: "int" } },
							value: [{ kind: "int", value: 1 }, { kind: "int", value: 2 }],
						},
					},
					{ id: "result", expr: { kind: "call", ns: "list", name: "length", args: ["lst"] } },
				],
				result: "result",
			};
			const result = synthesizeTypeScript(doc);
			assert.ok(result.includes(".length"));
		});

		it("should map bool:not to !", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "a", expr: { kind: "lit", type: { kind: "bool" }, value: { kind: "bool", value: true } } },
					{ id: "result", expr: { kind: "call", ns: "bool", name: "not", args: ["a"] } },
				],
				result: "result",
			};
			const result = synthesizeTypeScript(doc);
			assert.ok(result.includes("(!"));
		});
	});

	//==========================================================================
	// Expression Tests
	//==========================================================================

	describe("Expression Types", () => {
		it("should synthesize if as ternary", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "cond", expr: { kind: "lit", type: { kind: "bool" }, value: { kind: "bool", value: true } } },
					{ id: "then", expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 1 } } },
					{ id: "else", expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 2 } } },
					{ id: "result", expr: { kind: "if", cond: "cond", then: "then", else: "else" } },
				],
				result: "result",
			};
			const result = synthesizeTypeScript(doc);
			assert.ok(result.includes("?"));
			assert.ok(result.includes(":"));
		});

		it("should synthesize let as IIFE", () => {
			const doc: CIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "val", expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 5 } } },
					{ id: "body", expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 10 } } },
					{ id: "result", expr: { kind: "let", name: "x", value: "val", body: "body" } },
				],
				result: "result",
			};
			const result = synthesizeTypeScript(doc);
			assert.ok(result.includes("=>"));
			assert.ok(result.includes("(x: any)"));
		});

		it("should synthesize do as IIFE", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "a", expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 1 } } },
					{ id: "b", expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 2 } } },
					{ id: "result", expr: { kind: "do", exprs: ["a", "b"] } },
				],
				result: "result",
			};
			const result = synthesizeTypeScript(doc);
			assert.ok(result.includes("(() =>"));
			assert.ok(result.includes("return"));
		});

		it("should synthesize seq expressions", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "first", expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 1 } } },
					{ id: "then", expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 2 } } },
					{ id: "result", expr: { kind: "seq", first: "first", then: "then" } },
				],
				result: "result",
			};
			const result = synthesizeTypeScript(doc);
			assert.ok(result.includes("(_: any) =>"));
		});

		it("should synthesize var expressions", () => {
			const doc: CIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "result", expr: { kind: "var", name: "my_var" } },
				],
				result: "result",
			};
			const result = synthesizeTypeScript(doc);
			assert.ok(result.includes("my_var"));
		});

		it("should synthesize ref expressions", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "x", expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 42 } } },
					{ id: "result", expr: { kind: "ref", id: "x" } },
				],
				result: "result",
			};
			const result = synthesizeTypeScript(doc);
			assert.ok(result.includes("const v_result = v_x;"));
		});
	});

	//==========================================================================
	// Options Tests
	//==========================================================================

	describe("Synthesizer Options", () => {
		it("should use default module name when not specified", () => {
			const result = synthesizeTypeScript(airArithmeticDoc);
			assert.ok(result.includes("// Module: spiral_generated"));
		});

		it("should use custom module name when provided", () => {
			const opts: TypeScriptSynthOptions = { moduleName: "my_custom_module" };
			const result = synthesizeTypeScript(airArithmeticDoc, opts);
			assert.ok(result.includes("// Module: my_custom_module"));
		});

		it("should include document version in header", () => {
			const result = synthesizeTypeScript(airArithmeticDoc);
			assert.ok(result.includes("// Document version: 1.0.0"));
		});

		it("should include custom header when provided", () => {
			const opts: TypeScriptSynthOptions = { header: "// Custom header line" };
			const result = synthesizeTypeScript(airArithmeticDoc, opts);
			assert.ok(result.startsWith("// Custom header line"));
		});
	});

	//==========================================================================
	// Error Handling Tests
	//==========================================================================

	describe("Error Handling", () => {
		it("should throw on unrecognized document format", () => {
			const invalidDoc = { version: "1.0.0" } as unknown as AIRDocument;
			assert.throws(
				() => synthesizeTypeScript(invalidDoc),
				/Error: Unrecognized document format/,
			);
		});

		it("should throw on unsupported operator", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "result", expr: { kind: "call", ns: "unknown", name: "op", args: [] } },
				],
				result: "result",
			};
			assert.throws(
				() => synthesizeTypeScript(doc),
				/Unsupported operator/,
			);
		});

		it("should throw on unsupported expression kind", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "result", expr: { kind: "unsupported" } as unknown as Node },
				],
				result: "result",
			};
			assert.throws(
				() => synthesizeTypeScript(doc),
				/Unsupported expression kind/,
			);
		});
	});

	//==========================================================================
	// Code Structure Tests
	//==========================================================================

	describe("Generated Code Structure", () => {
		it("should include header comments", () => {
			const result = synthesizeTypeScript(airArithmeticDoc);
			assert.ok(result.includes("// Generated by SPIRAL TypeScript Synthesizer"));
			assert.ok(result.includes("// Module:"));
			assert.ok(result.includes("// Document version:"));
		});

		it("should include node bindings section", () => {
			const result = synthesizeTypeScript(airArithmeticDoc);
			assert.ok(result.includes("// Node bindings"));
		});

		it("should include result output", () => {
			const result = synthesizeTypeScript(airArithmeticDoc);
			assert.ok(result.includes("// Result"));
			assert.ok(result.includes("console.log(v_sum)"));
		});

		it("should produce valid syntax (balanced brackets)", () => {
			const result = synthesizeTypeScript(airArithmeticDoc);
			const openParens = (result.match(/\(/g) || []).length;
			const closeParens = (result.match(/\)/g) || []).length;
			assert.strictEqual(openParens, closeParens, "Unbalanced parentheses");

			const openBrackets = (result.match(/\[/g) || []).length;
			const closeBrackets = (result.match(/\]/g) || []).length;
			assert.strictEqual(openBrackets, closeBrackets, "Unbalanced brackets");

			const openBraces = (result.match(/\{/g) || []).length;
			const closeBraces = (result.match(/\}/g) || []).length;
			assert.strictEqual(openBraces, closeBraces, "Unbalanced braces");
		});

		it("should use const for bindings", () => {
			const result = synthesizeTypeScript(airArithmeticDoc);
			assert.ok(result.includes("const v_x"));
			assert.ok(result.includes("const v_y"));
		});
	});

	//==========================================================================
	// Edge Cases
	//==========================================================================

	describe("Edge Cases", () => {
		it("should handle empty AIR defs", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "x", expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 1 } } },
				],
				result: "x",
			};
			const result = synthesizeTypeScript(doc);
			assert.ok(result.includes("// Generated by SPIRAL TypeScript Synthesizer"));
		});

		it("should handle single node document", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "only", expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 42 } } },
				],
				result: "only",
			};
			const result = synthesizeTypeScript(doc);
			assert.ok(result.includes("console.log(v_only)"));
		});

		it("should handle void values as null", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "voidVal", expr: { kind: "lit", type: { kind: "void" }, value: { kind: "void" } } },
					{ id: "result", expr: { kind: "ref", id: "voidVal" } },
				],
				result: "result",
			};
			const result = synthesizeTypeScript(doc);
			assert.ok(result.includes("null"));
		});

		it("should handle complex nested expressions", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "a", expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 1 } } },
					{ id: "b", expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 2 } } },
					{ id: "c", expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 3 } } },
					{ id: "sum1", expr: { kind: "call", ns: "core", name: "add", args: ["a", "b"] } },
					{ id: "result", expr: { kind: "call", ns: "core", name: "add", args: ["sum1", "c"] } },
				],
				result: "result",
			};
			const result = synthesizeTypeScript(doc);
			assert.ok(result.includes("v_sum1"));
			assert.ok(result.includes("v_result"));
		});
	});
});
