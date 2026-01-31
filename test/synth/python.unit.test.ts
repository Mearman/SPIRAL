// SPDX-License-Identifier: MIT
// SPIRAL Python Synthesizer - Unit Tests

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	synthesizePython,
	type PythonSynthOptions,
} from "../../src/synth/python.js";
import type {
	AIRDocument,
	CIRDocument,
	EIRDocument,
	LIRDocument,
	PIRDocument,
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

describe("Python Synthesizer - Unit Tests", () => {

	//==========================================================================
	// AIR Document Tests
	//==========================================================================

	describe("AIR Documents", () => {
		it("should synthesize simple arithmetic", () => {
			const result = synthesizePython(airArithmeticDoc);
			assert.ok(result.includes("v_x = 5"));
			assert.ok(result.includes("v_y = 3"));
			assert.ok(result.includes("air_core_add"));
			assert.ok(result.includes("print(v_sum)"));
		});

		it("should include module name in header", () => {
			const opts: PythonSynthOptions = { moduleName: "test_module" };
			const result = synthesizePython(airArithmeticDoc, opts);
			assert.ok(result.includes("# Module: test_module"));
		});

		it("should handle boolean operations", () => {
			const result = synthesizePython(airBooleanDoc);
			assert.ok(result.includes("v_a = True"));
			assert.ok(result.includes("v_b = False"));
			assert.ok(result.includes("and"));
		});

		it("should handle AIR definitions", () => {
			const result = synthesizePython(airArithmeticDoc);
			assert.ok(result.includes("# AIR definitions"));
			assert.ok(result.includes("def air_core_add(a, b):"));
		});

		it("should sanitize IDs with special characters", () => {
			const result = synthesizePython(specialCharsDoc);
			assert.ok(result.includes("v_node_with_dashes"));
			assert.ok(result.includes("v_node_with_dots"));
		});
	});

	//==========================================================================
	// CIR Document Tests
	//==========================================================================

	describe("CIR Documents", () => {
		it("should synthesize lambda expressions", () => {
			const result = synthesizePython(cirLambdaDoc);
			assert.ok(result.includes("lambda"));
		});

		it("should synthesize fix combinator", () => {
			const result = synthesizePython(cirFixDoc);
			assert.ok(result.includes("lambda"));
		});

		it("should handle call expressions", () => {
			const result = synthesizePython(cirLambdaDoc);
			assert.ok(result.includes("v_increment("));
		});
	});

	//==========================================================================
	// EIR Document Tests
	//==========================================================================

	describe("EIR Documents", () => {
		it("should synthesize assignment with mutable cells", () => {
			const result = synthesizePython(eirMutationDoc);
			assert.ok(result.includes("# Mutable cells"));
			assert.ok(result.includes("_cell_"));
		});

		it("should synthesize while loops", () => {
			const result = synthesizePython(eirWhileDoc);
			assert.ok(result.includes("if"));
		});

		it("should synthesize iter expressions", () => {
			const result = synthesizePython(eirIterDoc);
			assert.ok(result.includes("for item in"));
			assert.ok(result.includes("["));
		});

		it("should synthesize effect operations", () => {
			const result = synthesizePython(eirEffectDoc);
			assert.ok(result.includes('print("print"'));
		});
	});

	//==========================================================================
	// LIR Document Tests
	//==========================================================================

	describe("LIR Documents", () => {
		it("should synthesize CFG-based documents", () => {
			const result = synthesizePython(lirDoc);
			assert.ok(result.includes("# IR Layer: LIR (CFG-based)"));
			assert.ok(result.includes("def execute_lir(blocks, entry):"));
			assert.ok(result.includes("blocks = {"));
		});

		it("should include LIR execution engine", () => {
			const result = synthesizePython(lirDoc);
			assert.ok(result.includes("while True:"));
			assert.ok(result.includes("kind == 'assign'"));
			assert.ok(result.includes("kind == 'op'"));
			assert.ok(result.includes("kind == 'phi'"));
		});

		it("should handle LIR terminators", () => {
			const result = synthesizePython(lirDoc);
			assert.ok(result.includes("term['kind'] == 'jump'"));
			assert.ok(result.includes("term['kind'] == 'branch'"));
			assert.ok(result.includes("term['kind'] == 'return'"));
			assert.ok(result.includes("term['kind'] == 'exit'"));
		});
	});

	//==========================================================================
	// Literal Tests
	//==========================================================================

	describe("Literal Values", () => {
		it("should synthesize integer literals", () => {
			const result = synthesizePython(allLiteralsDoc);
			assert.ok(result.includes("v_intVal = 42"));
		});

		it("should synthesize boolean literals (True/False)", () => {
			const result = synthesizePython(allLiteralsDoc);
			assert.ok(result.includes("v_boolVal = True"));
		});

		it("should synthesize string literals", () => {
			const result = synthesizePython(allLiteralsDoc);
			assert.ok(result.includes('v_stringVal = "hello"'));
		});

		it("should synthesize list literals", () => {
			const result = synthesizePython(allLiteralsDoc);
			assert.ok(result.includes("v_listVal = [1, 2]"));
		});

		it("should synthesize None/null values", () => {
			const result = synthesizePython(allLiteralsDoc);
			assert.ok(result.includes("v_noneVal = None"));
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
					{
						id: "a",
						expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 1 } },
					},
					{
						id: "b",
						expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 2 } },
					},
					{
						id: "result",
						expr: { kind: "call", ns: "core", name: "add", args: ["a", "b"] },
					},
				],
				result: "result",
			};
			const result = synthesizePython(doc);
			assert.ok(result.includes("+"));
		});

		it("should map core:sub to -", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "a",
						expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 5 } },
					},
					{
						id: "b",
						expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 3 } },
					},
					{
						id: "result",
						expr: { kind: "call", ns: "core", name: "sub", args: ["a", "b"] },
					},
				],
				result: "result",
			};
			const result = synthesizePython(doc);
			assert.ok(result.includes("-"));
		});

		it("should map core:mul to *", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "a",
						expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 2 } },
					},
					{
						id: "b",
						expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 3 } },
					},
					{
						id: "result",
						expr: { kind: "call", ns: "core", name: "mul", args: ["a", "b"] },
					},
				],
				result: "result",
			};
			const result = synthesizePython(doc);
			assert.ok(result.includes("*"));
		});

		it("should map core:div to //", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "a",
						expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 10 } },
					},
					{
						id: "b",
						expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 3 } },
					},
					{
						id: "result",
						expr: { kind: "call", ns: "core", name: "div", args: ["a", "b"] },
					},
				],
				result: "result",
			};
			const result = synthesizePython(doc);
			assert.ok(result.includes("//"));
		});

		it("should map comparison operators", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "a",
						expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 1 } },
					},
					{
						id: "b",
						expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 2 } },
					},
					{
						id: "eq",
						expr: { kind: "call", ns: "core", name: "eq", args: ["a", "b"] },
					},
					{
						id: "lt",
						expr: { kind: "call", ns: "core", name: "lt", args: ["a", "b"] },
					},
					{
						id: "result",
						expr: { kind: "ref", id: "lt" },
					},
				],
				result: "result",
			};
			const result = synthesizePython(doc);
			assert.ok(result.includes("=="));
			assert.ok(result.includes("<"));
		});

		it("should map boolean operators", () => {
			const result = synthesizePython(airBooleanDoc);
			assert.ok(result.includes(" and "));
			assert.ok(result.includes(" or "));
		});

		it("should map list operators", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "lst",
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
						id: "result",
						expr: { kind: "call", ns: "list", name: "length", args: ["lst"] },
					},
				],
				result: "result",
			};
			const result = synthesizePython(doc);
			assert.ok(result.includes("len("));
		});
	});

	//==========================================================================
	// Expression Tests
	//==========================================================================

	describe("Expression Types", () => {
		it("should synthesize if expressions", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "cond",
						expr: { kind: "lit", type: { kind: "bool" }, value: { kind: "bool", value: true } },
					},
					{
						id: "then",
						expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 1 } },
					},
					{
						id: "else",
						expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 2 } },
					},
					{
						id: "result",
						expr: { kind: "if", cond: "cond", then: "then", else: "else" },
					},
				],
				result: "result",
			};
			const result = synthesizePython(doc);
			assert.ok(result.includes(" if "));
			assert.ok(result.includes(" else "));
		});

		it("should synthesize let expressions", () => {
			const doc: CIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "val",
						expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 5 } },
					},
					{
						id: "body",
						expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 10 } },
					},
					{
						id: "result",
						expr: { kind: "let", name: "x", value: "val", body: "body" },
					},
				],
				result: "result",
			};
			const result = synthesizePython(doc);
			assert.ok(result.includes("lambda"));
		});

		it("should synthesize airRef expressions", () => {
			const result = synthesizePython(airArithmeticDoc);
			assert.ok(result.includes("air_core_add("));
		});

		it("should synthesize var expressions", () => {
			const doc: CIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "result",
						expr: { kind: "var", name: "my_var" },
					},
				],
				result: "result",
			};
			const result = synthesizePython(doc);
			assert.ok(result.includes("my_var"));
		});

		it("should synthesize ref expressions", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "x",
						expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 42 } },
					},
					{
						id: "result",
						expr: { kind: "ref", id: "x" },
					},
				],
				result: "result",
			};
			const result = synthesizePython(doc);
			assert.ok(result.includes("v_result = v_x"));
		});

		it("should synthesize seq expressions", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "first",
						expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 1 } },
					},
					{
						id: "then",
						expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 2 } },
					},
					{
						id: "result",
						expr: { kind: "seq", first: "first", then: "then" },
					},
				],
				result: "result",
			};
			const result = synthesizePython(doc);
			assert.ok(result.includes("lambda _:"));
		});
	});

	//==========================================================================
	// Options Tests
	//==========================================================================

	describe("Synthesizer Options", () => {
		it("should use default module name when not specified", () => {
			const result = synthesizePython(airArithmeticDoc);
			assert.ok(result.includes("# Module: spiral_generated"));
		});

		it("should use custom module name when provided", () => {
			const opts: PythonSynthOptions = { moduleName: "my_custom_module" };
			const result = synthesizePython(airArithmeticDoc, opts);
			assert.ok(result.includes("# Module: my_custom_module"));
		});

		it("should include document version in header", () => {
			const result = synthesizePython(airArithmeticDoc);
			assert.ok(result.includes("# Document version: 1.0.0"));
		});
	});

	//==========================================================================
	// Error Handling Tests
	//==========================================================================

	describe("Error Handling", () => {
		it("should throw on unrecognized document format", () => {
			const invalidDoc = { version: "1.0.0" } as unknown as AIRDocument;
			assert.throws(
				() => synthesizePython(invalidDoc),
				/Error: Unrecognized document format/,
			);
		});

		it("should throw on unsupported operator", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "result",
						expr: { kind: "call", ns: "unknown", name: "op", args: [] },
					},
				],
				result: "result",
			};
			assert.throws(
				() => synthesizePython(doc),
				/Unsupported operator/,
			);
		});

		it("should throw on unsupported expression kind", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "result",
						expr: { kind: "unsupported" } as unknown as Node,
					},
				],
				result: "result",
			};
			assert.throws(
				() => synthesizePython(doc),
				/Unsupported expression kind/,
			);
		});
	});

	//==========================================================================
	// Code Structure Tests
	//==========================================================================

	describe("Generated Code Structure", () => {
		it("should include header comments", () => {
			const result = synthesizePython(airArithmeticDoc);
			assert.ok(result.includes("# Generated by SPIRAL Python Synthesizer"));
			assert.ok(result.includes("# Module:"));
			assert.ok(result.includes("# Document version:"));
		});

		it("should include node bindings section", () => {
			const result = synthesizePython(airArithmeticDoc);
			assert.ok(result.includes("# Node bindings"));
		});

		it("should include result output", () => {
			const result = synthesizePython(airArithmeticDoc);
			assert.ok(result.includes("# Result"));
			assert.ok(result.includes("print(v_sum)"));
		});

		it("should produce valid Python syntax", () => {
			const result = synthesizePython(airArithmeticDoc);
			// Check for balanced parentheses in function calls
			const openParens = (result.match(/\(/g) || []).length;
			const closeParens = (result.match(/\)/g) || []).length;
			assert.strictEqual(openParens, closeParens, "Unbalanced parentheses");

			// Check for balanced brackets in list literals
			const openBrackets = (result.match(/\[/g) || []).length;
			const closeBrackets = (result.match(/\]/g) || []).length;
			assert.strictEqual(openBrackets, closeBrackets, "Unbalanced brackets");
		});
	});

	//==========================================================================
	// PIR Document Tests
	//==========================================================================

	describe("PIR Documents", () => {
		it("should synthesize par expression with asyncio.gather", () => {
			const doc: PIRDocument = {
				version: "2.0.0",
				nodes: [
					{
						id: "branchA",
						expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 1 } },
					},
					{
						id: "branchB",
						expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 2 } },
					},
					{
						id: "result",
						expr: { kind: "par", branches: ["branchA", "branchB"] },
					},
				],
				result: "result",
			};
			const result = synthesizePython(doc);
			assert.ok(result.includes("asyncio"), "Should contain asyncio for par expression");
			assert.ok(result.includes("asyncio.gather"), "Should contain asyncio.gather for par expression");
		});

		it("should synthesize spawn expression with asyncio.create_task", () => {
			const doc: PIRDocument = {
				version: "2.0.0",
				nodes: [
					{
						id: "taskBody",
						expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 42 } },
					},
					{
						id: "result",
						expr: { kind: "spawn", task: "taskBody" },
					},
				],
				result: "result",
			};
			const result = synthesizePython(doc);
			assert.ok(result.includes("asyncio"), "Should contain asyncio for spawn expression");
			assert.ok(result.includes("asyncio.create_task"), "Should contain asyncio.create_task for spawn expression");
		});

		it("should synthesize await expression", () => {
			const doc: PIRDocument = {
				version: "2.0.0",
				nodes: [
					{
						id: "taskBody",
						expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 42 } },
					},
					{
						id: "spawned",
						expr: { kind: "spawn", task: "taskBody" },
					},
					{
						id: "result",
						expr: { kind: "await", future: "spawned" },
					},
				],
				result: "result",
			};
			const result = synthesizePython(doc);
			assert.ok(result.includes("await"), "Should contain await for await expression");
		});

		it("should synthesize channel expression with asyncio.Queue", () => {
			const doc: PIRDocument = {
				version: "2.0.0",
				nodes: [
					{
						id: "result",
						expr: { kind: "channel", channelType: "mpsc" },
					},
				],
				result: "result",
			};
			const result = synthesizePython(doc);
			assert.ok(result.includes("asyncio"), "Should contain asyncio for channel expression");
			assert.ok(result.includes("asyncio.Queue"), "Should contain asyncio.Queue for channel expression");
		});

		it("should synthesize send and recv expressions", () => {
			const doc: PIRDocument = {
				version: "2.0.0",
				nodes: [
					{
						id: "ch",
						expr: { kind: "channel", channelType: "mpsc" },
					},
					{
						id: "msg",
						expr: { kind: "lit", type: { kind: "string" }, value: { kind: "string", value: "hello" } },
					},
					{
						id: "sendOp",
						expr: { kind: "send", channel: "ch", value: "msg" },
					},
					{
						id: "result",
						expr: { kind: "recv", channel: "ch" },
					},
				],
				result: "result",
			};
			const result = synthesizePython(doc);
			assert.ok(result.includes(".put("), "Should contain .put() for send expression");
			assert.ok(result.includes(".get()"), "Should contain .get() for recv expression");
		});

		it("should include asyncio import for PIR documents", () => {
			const doc: PIRDocument = {
				version: "2.0.0",
				nodes: [
					{
						id: "branchA",
						expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 1 } },
					},
					{
						id: "branchB",
						expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 2 } },
					},
					{
						id: "result",
						expr: { kind: "par", branches: ["branchA", "branchB"] },
					},
				],
				result: "result",
			};
			const result = synthesizePython(doc);
			assert.ok(result.includes("import asyncio"), "Should include asyncio import for PIR documents");
		});

		it("should synthesize select expression with asyncio.wait", () => {
			const doc: PIRDocument = {
				version: "2.0.0",
				nodes: [
					{
						id: "futA",
						expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 1 } },
					},
					{
						id: "futB",
						expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 2 } },
					},
					{
						id: "result",
						expr: { kind: "select", futures: ["futA", "futB"] },
					},
				],
				result: "result",
			};
			const result = synthesizePython(doc);
			assert.ok(result.includes("asyncio.wait"), "Should contain asyncio.wait for select expression");
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
					{
						id: "x",
						expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 1 } },
					},
				],
				result: "x",
			};
			const result = synthesizePython(doc);
			assert.ok(result.includes("# Generated by SPIRAL Python Synthesizer"));
		});

		it("should handle single node document", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "only",
						expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 42 } },
					},
				],
				result: "only",
			};
			const result = synthesizePython(doc);
			assert.ok(result.includes("print(v_only)"));
		});

		it("should handle void values", () => {
			const doc: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "voidVal",
						expr: { kind: "lit", type: { kind: "void" }, value: { kind: "void" } },
					},
					{
						id: "result",
						expr: { kind: "ref", id: "voidVal" },
					},
				],
				result: "result",
			};
			const result = synthesizePython(doc);
			assert.ok(result.includes("None"));
		});

		it("should handle complex nested expressions", () => {
			const doc: AIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "a",
						expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 1 } },
					},
					{
						id: "b",
						expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 2 } },
					},
					{
						id: "c",
						expr: { kind: "lit", type: { kind: "int" }, value: { kind: "int", value: 3 } },
					},
					{
						id: "sum1",
						expr: { kind: "call", ns: "core", name: "add", args: ["a", "b"] },
					},
					{
						id: "result",
						expr: { kind: "call", ns: "core", name: "add", args: ["sum1", "c"] },
					},
				],
				result: "result",
			};
			const result = synthesizePython(doc);
			assert.ok(result.includes("v_sum1"));
			assert.ok(result.includes("v_result"));
		});
	});
});
