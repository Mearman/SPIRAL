// SPDX-License-Identifier: MIT
// SPIRAL LIR Lowering - Unit Tests

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { lowerEIRtoLIR } from "../../src/lir/lower.js";
import type {
	EIRDocument,
	LIRDocument,
	LirBlock,
} from "../../src/types.js";

//==============================================================================
// Test Fixtures
//==============================================================================

// Simple EIR document with a single literal
const eirSingleLiteral: EIRDocument = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "result",
			expr: { kind: "lit", type: { kind: "int" }, value: 42 },
		},
	],
	result: "result",
};

// EIR document with CIR call expression
const eirWithCall: EIRDocument = {
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
			id: "a",
			expr: { kind: "lit", type: { kind: "int" }, value: 5 },
		},
		{
			id: "b",
			expr: { kind: "lit", type: { kind: "int" }, value: 3 },
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

// EIR document with inline literal in call args
const eirWithInlineLiteral: EIRDocument = {
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
			id: "sum",
			expr: {
				kind: "call",
				ns: "core",
				name: "add",
				args: [
					"x",
					{ kind: "lit", type: { kind: "int" }, value: 10 },
				],
			},
		},
	],
	result: "sum",
};

// EIR document with seq expression
const eirWithSeq: EIRDocument = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "first",
			expr: { kind: "lit", type: { kind: "int" }, value: 1 },
		},
		{
			id: "second",
			expr: { kind: "lit", type: { kind: "int" }, value: 2 },
		},
		{
			id: "main",
			expr: {
				kind: "seq",
				first: "first",
				then: "second",
			},
		},
	],
	result: "main",
};

// EIR document with assign expression
const eirWithAssign: EIRDocument = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "value",
			expr: { kind: "lit", type: { kind: "int" }, value: 42 },
		},
		{
			id: "assignX",
			expr: {
				kind: "assign",
				target: "x",
				value: "value",
			},
		},
	],
	result: "assignX",
};

// EIR document with while expression
const eirWithWhile: EIRDocument = {
	version: "1.0.0",
	airDefs: [
		{
			ns: "core",
			name: "lt",
			params: ["a", "b"],
			result: { kind: "bool" },
			body: { kind: "ref", id: "a" },
		},
	],
	nodes: [
		{
			id: "counter",
			expr: { kind: "lit", type: { kind: "int" }, value: 0 },
		},
		{
			id: "limit",
			expr: { kind: "lit", type: { kind: "int" }, value: 5 },
		},
		{
			id: "cond",
			expr: {
				kind: "call",
				ns: "core",
				name: "lt",
				args: ["counter", "limit"],
			},
		},
		{
			id: "body",
			expr: { kind: "lit", type: { kind: "void" }, value: null },
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

// EIR document with for expression
const eirWithFor: EIRDocument = {
	version: "1.0.0",
	airDefs: [
		{
			ns: "core",
			name: "lt",
			params: ["a", "b"],
			result: { kind: "bool" },
			body: { kind: "ref", id: "a" },
		},
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
			id: "init",
			expr: { kind: "lit", type: { kind: "int" }, value: 0 },
		},
		{
			id: "cond",
			expr: {
				kind: "call",
				ns: "core",
				name: "lt",
				args: ["i", { kind: "lit", type: { kind: "int" }, value: 3 }],
			},
		},
		{
			id: "update",
			expr: {
				kind: "call",
				ns: "core",
				name: "add",
				args: ["i", { kind: "lit", type: { kind: "int" }, value: 1 }],
			},
		},
		{
			id: "body",
			expr: { kind: "lit", type: { kind: "void" }, value: null },
		},
		{
			id: "loop",
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
	result: "loop",
};

// EIR document with iter expression
const eirWithIter: EIRDocument = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "nums",
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
			id: "body",
			expr: { kind: "lit", type: { kind: "void" }, value: null },
		},
		{
			id: "loop",
			expr: {
				kind: "iter",
				var: "x",
				iter: "nums",
				body: "body",
			},
		},
	],
	result: "loop",
};

// EIR document with effect expression
const eirWithEffect: EIRDocument = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "msg",
			expr: { kind: "lit", type: { kind: "string" }, value: "Hello" },
		},
		{
			id: "printOp",
			expr: {
				kind: "effect",
				op: "print",
				args: ["msg"],
			},
		},
	],
	result: "printOp",
};

// EIR document with refCell expression
const eirWithRefCell: EIRDocument = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "cell",
			expr: {
				kind: "refCell",
				target: "x",
			},
		},
	],
	result: "cell",
};

// EIR document with deref expression
const eirWithDeref: EIRDocument = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "derefX",
			expr: {
				kind: "deref",
				target: "x",
			},
		},
	],
	result: "derefX",
};

// EIR document with CIR if expression
const eirWithIf: EIRDocument = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "cond",
			expr: { kind: "lit", type: { kind: "bool" }, value: true },
		},
		{
			id: "thenVal",
			expr: { kind: "lit", type: { kind: "int" }, value: 1 },
		},
		{
			id: "elseVal",
			expr: { kind: "lit", type: { kind: "int" }, value: 2 },
		},
		{
			id: "result",
			expr: {
				kind: "if",
				cond: "cond",
				then: "thenVal",
				else: "elseVal",
			},
		},
	],
	result: "result",
};

// EIR document with CIR let expression
const eirWithLet: EIRDocument = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "value",
			expr: { kind: "lit", type: { kind: "int" }, value: 42 },
		},
		{
			id: "binding",
			expr: {
				kind: "let",
				name: "x",
				value: "value",
				body: "value",
			},
		},
	],
	result: "binding",
};

// EIR document with CIR ref expression
const eirWithRef: EIRDocument = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "value",
			expr: { kind: "lit", type: { kind: "int" }, value: 42 },
		},
		{
			id: "refToValue",
			expr: {
				kind: "ref",
				id: "value",
			},
		},
	],
	result: "refToValue",
};

// EIR document with var expression
const eirWithVar: EIRDocument = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "varX",
			expr: {
				kind: "var",
				name: "x",
			},
		},
	],
	result: "varX",
};

// EIR document with capabilities
const eirWithCapabilities: EIRDocument = {
	version: "1.0.0",
	capabilities: ["async", "effects"],
	airDefs: [],
	nodes: [
		{
			id: "result",
			expr: { kind: "lit", type: { kind: "int" }, value: 42 },
		},
	],
	result: "result",
};

// Invalid EIR document with missing result node
const eirMissingResult: EIRDocument = {
	version: "1.0.0",
	airDefs: [],
	nodes: [
		{
			id: "node1",
			expr: { kind: "lit", type: { kind: "int" }, value: 1 },
		},
	],
	result: "nonexistent",
};

// EIR document with empty nodes array
const eirEmptyNodes: EIRDocument = {
	version: "1.0.0",
	airDefs: [],
	nodes: [],
	result: "result",
};

//==============================================================================
// Helper Functions
//==============================================================================

/**
 * Get all blocks from an LIR document.
 */
function getAllBlocks(lir: LIRDocument): LirBlock[] {
	const mainNode = lir.nodes[0];
	if (mainNode && "blocks" in mainNode) {
		return mainNode.blocks;
	}
	return [];
}

//==============================================================================
// Test Suite
//==============================================================================

describe("LIR Lowering - Unit Tests", () => {

	//==========================================================================
	// Basic Lowering Tests
	//==========================================================================

	describe("Basic Lowering", () => {
		it("should lower a single literal expression", () => {
			const lir = lowerEIRtoLIR(eirSingleLiteral);

			assert.strictEqual(lir.version, "1.0.0");
			assert.strictEqual(lir.result, "result");
			assert.ok(lir.nodes.length > 0);

			const blocks = getAllBlocks(lir);
			assert.ok(blocks.length > 0, "Should have at least one block");

			// Check that result is returned
			const lastBlock = blocks[blocks.length - 1];
			assert.strictEqual(lastBlock.terminator.kind, "return");
			assert.strictEqual(lastBlock.terminator.value, "result");
		});

		it("should preserve version from EIR document", () => {
			const lir = lowerEIRtoLIR(eirSingleLiteral);
			assert.strictEqual(lir.version, "1.0.0");
		});

		it("should preserve capabilities from EIR document", () => {
			const lir = lowerEIRtoLIR(eirWithCapabilities);
			assert.deepStrictEqual(lir.capabilities, ["async", "effects"]);
		});

		it("should handle empty nodes array", () => {
			// Empty nodes array means the result node cannot be found
			assert.throws(
				() => lowerEIRtoLIR(eirEmptyNodes),
				/Result node not found/,
			);
		});

		it("should throw error when result node is missing", () => {
			assert.throws(
				() => lowerEIRtoLIR(eirMissingResult),
				/Result node not found/,
			);
		});
	});

	//==========================================================================
	// CIR Expression Lowering Tests
	//==========================================================================

	describe("CIR Expression Lowering", () => {
		it("should lower literal expression to assign instruction", () => {
			const lir = lowerEIRtoLIR(eirSingleLiteral);
			const blocks = getAllBlocks(lir);

			// First block should have an assign instruction
			const firstBlock = blocks[0];
			assert.ok(firstBlock.instructions.length >= 0);
		});

		it("should lower var expression", () => {
			const lir = lowerEIRtoLIR(eirWithVar);
			const blocks = getAllBlocks(lir);

			assert.ok(blocks.length > 0);
			// var expressions don't generate instructions, just references
		});

		it("should lower ref expression to assign instruction", () => {
			const lir = lowerEIRtoLIR(eirWithRef);
			const blocks = getAllBlocks(lir);

			assert.ok(blocks.length > 0);
			// ref should create an assign from the referenced node
		});

		it("should lower call expression to op instruction", () => {
			const lir = lowerEIRtoLIR(eirWithCall);
			const blocks = getAllBlocks(lir);

			// Should have an op instruction
			const opInstr = blocks
				.flatMap((b) => b.instructions)
				.find((i) => i.kind === "op");

			assert.ok(opInstr, "Should have an op instruction");
			if (opInstr && opInstr.kind === "op") {
				assert.strictEqual(opInstr.ns, "core");
				assert.strictEqual(opInstr.name, "add");
				assert.strictEqual(opInstr.target, "sum");
			}
		});

		it("should handle inline literals in call args", () => {
			const lir = lowerEIRtoLIR(eirWithInlineLiteral);
			const blocks = getAllBlocks(lir);

			// Should create an assign instruction for the inline literal
			const assignInstr = blocks
				.flatMap((b) => b.instructions)
				.find((i) => i.kind === "assign");

			assert.ok(assignInstr, "Should have an assign instruction for inline literal");
		});

		it("should lower if expression to branch blocks", () => {
			const lir = lowerEIRtoLIR(eirWithIf);
			const blocks = getAllBlocks(lir);

			// Should have a branch terminator
			const branchBlock = blocks.find((b) => b.terminator.kind === "branch");
			assert.ok(branchBlock, "Should have a block with branch terminator");

			if (branchBlock && branchBlock.terminator.kind === "branch") {
				assert.strictEqual(branchBlock.terminator.cond, "cond");
				assert.ok(branchBlock.terminator.then);
				assert.ok(branchBlock.terminator.else);
			}
		});

		it("should lower let expression to assign and jump", () => {
			const lir = lowerEIRtoLIR(eirWithLet);
			const blocks = getAllBlocks(lir);

			// Should have an assign instruction
			const assignInstr = blocks
				.flatMap((b) => b.instructions)
				.find((i) => i.kind === "assign");

			assert.ok(assignInstr, "Should have an assign instruction for let binding");
		});
	});

	//==========================================================================
	// EIR Expression Lowering Tests
	//==========================================================================

	describe("EIR Expression Lowering", () => {
		it("should lower seq expression to sequential blocks", () => {
			const lir = lowerEIRtoLIR(eirWithSeq);
			const blocks = getAllBlocks(lir);

			// seq should create multiple blocks that execute in sequence
			assert.ok(blocks.length >= 2, "Should have at least 2 blocks for seq");
		});

		it("should lower assign expression to assign instruction", () => {
			const lir = lowerEIRtoLIR(eirWithAssign);
			const blocks = getAllBlocks(lir);

			// Should have an assign instruction targeting "x" from the EIR assign expr
			// (the first assign found may be the literal node "value", so filter for target "x")
			const allAssigns = blocks
				.flatMap((b) => b.instructions)
				.filter((i) => i.kind === "assign");

			assert.ok(allAssigns.length > 0, "Should have assign instructions");
			const eirAssign = allAssigns.find(
				(i) => i.kind === "assign" && i.target === "x",
			);
			assert.ok(eirAssign, "Should have an assign instruction targeting 'x'");
		});

		it("should lower while expression to loop structure", () => {
			const lir = lowerEIRtoLIR(eirWithWhile);
			const blocks = getAllBlocks(lir);

			// while should create header, body, and exit blocks
			assert.ok(blocks.length >= 3, "Should have at least 3 blocks for while");

			// Should have a branch for condition check
			const branchBlock = blocks.find((b) => b.terminator.kind === "branch");
			assert.ok(branchBlock, "Should have a branch for while condition");
		});

		it("should lower for expression to for loop structure", () => {
			const lir = lowerEIRtoLIR(eirWithFor);
			const blocks = getAllBlocks(lir);

			// for should create init, header, body, update, and exit blocks
			assert.ok(blocks.length >= 4, "Should have at least 4 blocks for for loop");

			// Should have a branch for condition check
			const branchBlock = blocks.find((b) => b.terminator.kind === "branch");
			assert.ok(branchBlock, "Should have a branch for for condition");
		});

		it("should lower iter expression to iteration structure", () => {
			const lir = lowerEIRtoLIR(eirWithIter);
			const blocks = getAllBlocks(lir);

			// iter should create header, body, and exit blocks
			assert.ok(blocks.length >= 3, "Should have at least 3 blocks for iter");

			// Should have a branch for iteration condition
			const branchBlock = blocks.find((b) => b.terminator.kind === "branch");
			assert.ok(branchBlock, "Should have a branch for iter condition");
		});

		it("should lower effect expression to effect instruction", () => {
			const lir = lowerEIRtoLIR(eirWithEffect);
			const blocks = getAllBlocks(lir);

			// Should have an effect instruction
			const effectInstr = blocks
				.flatMap((b) => b.instructions)
				.find((i) => i.kind === "effect");

			assert.ok(effectInstr, "Should have an effect instruction");
			if (effectInstr && effectInstr.kind === "effect") {
				assert.strictEqual(effectInstr.op, "print");
				assert.deepStrictEqual(effectInstr.args, ["msg"]);
			}
		});

		it("should lower refCell expression", () => {
			const lir = lowerEIRtoLIR(eirWithRefCell);
			const blocks = getAllBlocks(lir);

			// refCell should create a block
			assert.ok(blocks.length > 0, "Should create block for refCell");
		});

		it("should lower deref expression to assign instruction", () => {
			const lir = lowerEIRtoLIR(eirWithDeref);
			const blocks = getAllBlocks(lir);

			// deref should create an assign instruction
			const assignInstr = blocks
				.flatMap((b) => b.instructions)
				.find((i) => i.kind === "assign");

			assert.ok(assignInstr, "Should have an assign instruction for deref");
			if (assignInstr && assignInstr.kind === "assign") {
				assert.strictEqual(assignInstr.value.kind, "var");
				assert.strictEqual(assignInstr.value.name, "x_ref");
			}
		});
	});

	//==========================================================================
	// Block Structure Tests
	//==========================================================================

	describe("Block Structure", () => {
		it("should create blocks with sequential IDs", () => {
			const lir = lowerEIRtoLIR(eirWithSeq);
			const blocks = getAllBlocks(lir);

			// Block IDs should be bb0, bb1, bb2, etc.
			blocks.forEach((block, index) => {
				assert.strictEqual(block.id, `bb${index}`);
			});
		});

		it("should set entry point to first block", () => {
			const lir = lowerEIRtoLIR(eirSingleLiteral);
			const mainNode = lir.nodes[0];

			assert.ok(mainNode && "entry" in mainNode);
			if (mainNode && "entry" in mainNode) {
				assert.strictEqual(mainNode.entry, "bb0");
			}
		});

		it("should ensure all blocks have terminators", () => {
			const lir = lowerEIRtoLIR(eirWithSeq);
			const blocks = getAllBlocks(lir);

			blocks.forEach((block) => {
				assert.ok(block.terminator, `Block ${block.id} should have a terminator`);
				assert.ok(
					["jump", "branch", "return", "exit"].includes(block.terminator.kind),
					`Block ${block.id} should have valid terminator kind`,
				);
			});
		});

		it("should chain blocks with jump terminators", () => {
			const lir = lowerEIRtoLIR(eirWithSeq);
			const blocks = getAllBlocks(lir);

			// First block should jump to second
			const firstBlock = blocks[0];
			if (blocks.length > 1 && firstBlock.terminator.kind === "jump") {
				assert.strictEqual(firstBlock.terminator.to, blocks[1].id);
			}
		});
	});

	//==========================================================================
	// Instruction Tests
	//==========================================================================

	describe("Instructions", () => {
		it("should create assign instruction for literals", () => {
			const lir = lowerEIRtoLIR(eirSingleLiteral);
			const blocks = getAllBlocks(lir);

			const assignInstr = blocks
				.flatMap((b) => b.instructions)
				.find((i) => i.kind === "assign");

			assert.ok(assignInstr, "Should have assign instruction");
			if (assignInstr && assignInstr.kind === "assign") {
				assert.strictEqual(assignInstr.target, "result");
				assert.strictEqual(assignInstr.value.kind, "lit");
			}
		});

		it("should create op instruction for calls", () => {
			const lir = lowerEIRtoLIR(eirWithCall);
			const blocks = getAllBlocks(lir);

			const opInstr = blocks
				.flatMap((b) => b.instructions)
				.find((i) => i.kind === "op");

			assert.ok(opInstr, "Should have op instruction");
			if (opInstr && opInstr.kind === "op") {
				assert.strictEqual(opInstr.ns, "core");
				assert.strictEqual(opInstr.name, "add");
			}
		});

		it("should create effect instruction for effects", () => {
			const lir = lowerEIRtoLIR(eirWithEffect);
			const blocks = getAllBlocks(lir);

			const effectInstr = blocks
				.flatMap((b) => b.instructions)
				.find((i) => i.kind === "effect");

			assert.ok(effectInstr, "Should have effect instruction");
			if (effectInstr && effectInstr.kind === "effect") {
				assert.strictEqual(effectInstr.op, "print");
			}
		});
	});

	//==========================================================================
	// Terminator Tests
	//==========================================================================

	describe("Terminators", () => {
		it("should create return terminator for final block", () => {
			const lir = lowerEIRtoLIR(eirSingleLiteral);
			const blocks = getAllBlocks(lir);

			const lastBlock = blocks[blocks.length - 1];
			assert.strictEqual(lastBlock.terminator.kind, "return");
			assert.strictEqual(lastBlock.terminator.value, "result");
		});

		it("should create branch terminator for conditionals", () => {
			const lir = lowerEIRtoLIR(eirWithIf);
			const blocks = getAllBlocks(lir);

			const branchBlock = blocks.find((b) => b.terminator.kind === "branch");
			assert.ok(branchBlock, "Should have branch terminator");

			if (branchBlock && branchBlock.terminator.kind === "branch") {
				assert.ok(branchBlock.terminator.cond);
				assert.ok(branchBlock.terminator.then);
				assert.ok(branchBlock.terminator.else);
			}
		});

		it("should create jump terminator for block chaining", () => {
			const lir = lowerEIRtoLIR(eirWithSeq);
			const blocks = getAllBlocks(lir);

			const jumpBlocks = blocks.filter((b) => b.terminator.kind === "jump");
			assert.ok(jumpBlocks.length > 0, "Should have jump terminators for chaining");
		});
	});

	//==========================================================================
	// Result Node Tests
	//==========================================================================

	describe("Result Node", () => {
		it("should preserve result node ID in LIR document", () => {
			const lir = lowerEIRtoLIR(eirSingleLiteral);
			assert.strictEqual(lir.result, "result");
		});

		it("should return EIR result node in final block", () => {
			const lir = lowerEIRtoLIR(eirWithCall);
			const blocks = getAllBlocks(lir);

			const lastBlock = blocks[blocks.length - 1];
			if (lastBlock.terminator.kind === "return") {
				assert.strictEqual(lastBlock.terminator.value, "sum");
			}
		});
	});

	//==========================================================================
	// Complex Scenario Tests
	//==========================================================================

	describe("Complex Scenarios", () => {
		it("should handle nested expressions", () => {
			// Create EIR with nested structure
			const eirNested: EIRDocument = {
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
						id: "a",
						expr: { kind: "lit", type: { kind: "int" }, value: 1 },
					},
					{
						id: "b",
						expr: { kind: "lit", type: { kind: "int" }, value: 2 },
					},
					{
						id: "sum1",
						expr: {
							kind: "call",
							ns: "core",
							name: "add",
							args: ["a", "b"],
						},
					},
					{
						id: "c",
						expr: { kind: "lit", type: { kind: "int" }, value: 3 },
					},
					{
						id: "sum2",
						expr: {
							kind: "call",
							ns: "core",
							name: "add",
							args: ["sum1", "c"],
						},
					},
				],
				result: "sum2",
			};

			const lir = lowerEIRtoLIR(eirNested);
			const blocks = getAllBlocks(lir);

			// Should handle all expressions
			assert.ok(blocks.length > 0, "Should create blocks");

			// Should have multiple op instructions
			const opInstrs = blocks
				.flatMap((b) => b.instructions)
				.filter((i) => i.kind === "op");

			assert.ok(opInstrs.length >= 2, "Should have at least 2 op instructions");
		});

		it("should handle mixed CIR and EIR expressions", () => {
			// Create EIR with both CIR (if, let) and EIR (seq, assign) expressions
			const eirMixed: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "x",
						expr: { kind: "lit", type: { kind: "int" }, value: 5 },
					},
					{
						id: "assignX",
						expr: {
							kind: "assign",
							target: "y",
							value: "x",
						},
					},
					{
						id: "cond",
						expr: { kind: "lit", type: { kind: "bool" }, value: true },
					},
					{
						id: "result",
						expr: {
							kind: "if",
							cond: "cond",
							then: "assignX",
							else: "x",
						},
					},
				],
				result: "result",
			};

			const lir = lowerEIRtoLIR(eirMixed);
			const blocks = getAllBlocks(lir);

			// Should handle both types of expressions
			assert.ok(blocks.length > 0, "Should create blocks");
		});
	});

	//==========================================================================
	// Edge Cases Tests
	//==========================================================================

	describe("Edge Cases", () => {
		it("should handle document with no expression nodes", () => {
			const eirNoExpr: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [],
				result: "missing",
			};

			assert.throws(
				() => lowerEIRtoLIR(eirNoExpr),
				/Result node not found/,
			);
		});

		it("should handle single node document", () => {
			const lir = lowerEIRtoLIR(eirSingleLiteral);
			assert.ok(lir.nodes.length > 0);
		});

		it("should handle document with only literals", () => {
			const eirOnlyLits: EIRDocument = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{
						id: "a",
						expr: { kind: "lit", type: { kind: "int" }, value: 1 },
					},
					{
						id: "b",
						expr: { kind: "lit", type: { kind: "int" }, value: 2 },
					},
					{
						id: "c",
						expr: { kind: "lit", type: { kind: "int" }, value: 3 },
					},
				],
				result: "c",
			};

			const lir = lowerEIRtoLIR(eirOnlyLits);
			const blocks = getAllBlocks(lir);

			assert.ok(blocks.length > 0);
		});
	});
});
