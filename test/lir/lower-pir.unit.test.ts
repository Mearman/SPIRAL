// SPDX-License-Identifier: MIT
// SPIRAL PIR to LIR Lowering - Unit Tests

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { lowerPIRtoLIR } from "../../src/lir/lower-pir-doc.js";
import type {
	PIRDocument,
	LIRDocument,
	LirBlock,
} from "../../src/types.js";

//==============================================================================
// Test Fixtures
//==============================================================================

// PIR document with spawn expression
const pirWithSpawn: PIRDocument = {
	version: "2.0.0",
	nodes: [
		{
			id: "taskBody",
			expr: { kind: "lit", type: { kind: "int" }, value: 42 },
		},
		{
			id: "spawned",
			expr: { kind: "spawn", task: "taskBody" },
		},
	],
	result: "spawned",
};

// PIR document with await expression
const pirWithAwait: PIRDocument = {
	version: "2.0.0",
	nodes: [
		{
			id: "taskBody",
			expr: { kind: "lit", type: { kind: "int" }, value: 42 },
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

// PIR document with par expression
const pirWithPar: PIRDocument = {
	version: "2.0.0",
	nodes: [
		{
			id: "branchA",
			expr: { kind: "lit", type: { kind: "int" }, value: 1 },
		},
		{
			id: "branchB",
			expr: { kind: "lit", type: { kind: "int" }, value: 2 },
		},
		{
			id: "parallel",
			expr: { kind: "par", branches: ["branchA", "branchB"] },
		},
	],
	result: "parallel",
};

// PIR document with channel, send, and recv expressions
const pirWithChannel: PIRDocument = {
	version: "2.0.0",
	nodes: [
		{
			id: "ch",
			expr: { kind: "channel", channelType: "mpsc" },
		},
		{
			id: "msg",
			expr: { kind: "lit", type: { kind: "string" }, value: "hello" },
		},
		{
			id: "sendOp",
			expr: { kind: "send", channel: "ch", value: "msg" },
		},
		{
			id: "recvOp",
			expr: { kind: "recv", channel: "ch" },
		},
	],
	result: "recvOp",
};

// PIR document with select expression
const pirWithSelect: PIRDocument = {
	version: "2.0.0",
	nodes: [
		{
			id: "futA",
			expr: { kind: "lit", type: { kind: "int" }, value: 1 },
		},
		{
			id: "futB",
			expr: { kind: "lit", type: { kind: "int" }, value: 2 },
		},
		{
			id: "selected",
			expr: { kind: "select", futures: ["futA", "futB"] },
		},
	],
	result: "selected",
};

// PIR document with race expression
const pirWithRace: PIRDocument = {
	version: "2.0.0",
	nodes: [
		{
			id: "taskA",
			expr: { kind: "lit", type: { kind: "int" }, value: 1 },
		},
		{
			id: "taskB",
			expr: { kind: "lit", type: { kind: "int" }, value: 2 },
		},
		{
			id: "raced",
			expr: { kind: "race", tasks: ["taskA", "taskB"] },
		},
	],
	result: "raced",
};

// PIR document with capabilities
const pirWithCapabilities: PIRDocument = {
	version: "2.0.0",
	capabilities: ["async", "parallel"],
	nodes: [
		{
			id: "result",
			expr: { kind: "lit", type: { kind: "int" }, value: 42 },
		},
	],
	result: "result",
};

// Invalid PIR document with missing result node
const pirMissingResult: PIRDocument = {
	version: "2.0.0",
	nodes: [
		{
			id: "node1",
			expr: { kind: "lit", type: { kind: "int" }, value: 1 },
		},
	],
	result: "nonexistent",
};

// PIR document with empty nodes array
const pirEmptyNodes: PIRDocument = {
	version: "2.0.0",
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

describe("PIR to LIR Lowering - Unit Tests", () => {

	//==========================================================================
	// Basic Lowering Tests
	//==========================================================================

	describe("Basic Lowering", () => {
		it("should preserve version from PIR document", () => {
			const lir = lowerPIRtoLIR(pirWithSpawn);
			assert.strictEqual(lir.version, "2.0.0");
		});

		it("should preserve capabilities from PIR document", () => {
			const lir = lowerPIRtoLIR(pirWithCapabilities);
			assert.deepStrictEqual(lir.capabilities, ["async", "parallel"]);
		});

		it("should produce a result property", () => {
			const lir = lowerPIRtoLIR(pirWithSpawn);
			assert.ok(lir.result);
		});

		it("should produce nodes array", () => {
			const lir = lowerPIRtoLIR(pirWithSpawn);
			assert.ok(Array.isArray(lir.nodes));
			assert.ok(lir.nodes.length > 0);
		});

		it("should handle empty nodes array", () => {
			assert.throws(
				() => lowerPIRtoLIR(pirEmptyNodes),
				/Result node not found/,
			);
		});

		it("should throw error when result node is missing", () => {
			assert.throws(
				() => lowerPIRtoLIR(pirMissingResult),
				/Result node not found/,
			);
		});
	});

	//==========================================================================
	// PIR Spawn Expression Lowering
	//==========================================================================

	describe("Spawn Expression Lowering", () => {
		it("should lower a PIR doc with spawn to a valid LIR document", () => {
			const lir = lowerPIRtoLIR(pirWithSpawn);

			assert.ok(lir.version);
			assert.ok(lir.nodes);
			assert.ok(lir.result);

			const blocks = getAllBlocks(lir);
			assert.ok(blocks.length > 0, "Should have at least one block");
		});

		it("should produce effect instruction with op 'spawn'", () => {
			const lir = lowerPIRtoLIR(pirWithSpawn);
			const blocks = getAllBlocks(lir);

			const spawnInstr = blocks
				.flatMap((b) => b.instructions)
				.find((i) => i.kind === "effect" && "op" in i && i.op === "spawn");

			assert.ok(spawnInstr, "Should have an effect instruction with op 'spawn'");
		});
	});

	//==========================================================================
	// PIR Await Expression Lowering
	//==========================================================================

	describe("Await Expression Lowering", () => {
		it("should lower a PIR doc with await to a valid LIR document", () => {
			const lir = lowerPIRtoLIR(pirWithAwait);

			assert.ok(lir.version);
			assert.ok(lir.nodes);
			assert.ok(lir.result);

			const blocks = getAllBlocks(lir);
			assert.ok(blocks.length > 0, "Should have at least one block");
		});

		it("should produce effect instruction with op 'await'", () => {
			const lir = lowerPIRtoLIR(pirWithAwait);
			const blocks = getAllBlocks(lir);

			const awaitInstr = blocks
				.flatMap((b) => b.instructions)
				.find((i) => i.kind === "effect" && "op" in i && i.op === "await");

			assert.ok(awaitInstr, "Should have an effect instruction with op 'await'");
		});
	});

	//==========================================================================
	// PIR Par Expression Lowering
	//==========================================================================

	describe("Par Expression Lowering", () => {
		it("should lower a PIR doc with par to a valid LIR document", () => {
			const lir = lowerPIRtoLIR(pirWithPar);

			assert.ok(lir.version);
			assert.ok(lir.nodes);
			assert.ok(lir.result);

			const blocks = getAllBlocks(lir);
			assert.ok(blocks.length > 0, "Should have at least one block");
		});

		it("should produce effect instruction with op 'par'", () => {
			const lir = lowerPIRtoLIR(pirWithPar);
			const blocks = getAllBlocks(lir);

			const parInstr = blocks
				.flatMap((b) => b.instructions)
				.find((i) => i.kind === "effect" && "op" in i && i.op === "par");

			assert.ok(parInstr, "Should have an effect instruction with op 'par'");
		});
	});

	//==========================================================================
	// PIR Channel/Send/Recv Expression Lowering
	//==========================================================================

	describe("Channel/Send/Recv Expression Lowering", () => {
		it("should lower a PIR doc with channel/send/recv to a valid LIR document", () => {
			const lir = lowerPIRtoLIR(pirWithChannel);

			assert.ok(lir.version);
			assert.ok(lir.nodes);
			assert.ok(lir.result);

			const blocks = getAllBlocks(lir);
			assert.ok(blocks.length > 0, "Should have at least one block");
		});

		it("should produce effect instructions for channel, send, and recv ops", () => {
			const lir = lowerPIRtoLIR(pirWithChannel);
			const blocks = getAllBlocks(lir);

			const allEffects = blocks
				.flatMap((b) => b.instructions)
				.filter((i) => i.kind === "effect" && "op" in i);

			const ops = allEffects.map((i) => "op" in i ? i.op : undefined);

			assert.ok(ops.includes("channel"), "Should have a channel effect");
			assert.ok(ops.includes("send"), "Should have a send effect");
			assert.ok(ops.includes("recv"), "Should have a recv effect");
		});
	});

	//==========================================================================
	// PIR Select Expression Lowering
	//==========================================================================

	describe("Select Expression Lowering", () => {
		it("should lower a PIR doc with select to a valid LIR document", () => {
			const lir = lowerPIRtoLIR(pirWithSelect);

			assert.ok(lir.version);
			assert.ok(lir.nodes);
			assert.ok(lir.result);

			const blocks = getAllBlocks(lir);
			assert.ok(blocks.length > 0, "Should have at least one block");
		});

		it("should produce effect instruction with op 'select'", () => {
			const lir = lowerPIRtoLIR(pirWithSelect);
			const blocks = getAllBlocks(lir);

			const selectInstr = blocks
				.flatMap((b) => b.instructions)
				.find((i) => i.kind === "effect" && "op" in i && i.op === "select");

			assert.ok(selectInstr, "Should have an effect instruction with op 'select'");
		});
	});

	//==========================================================================
	// PIR Race Expression Lowering
	//==========================================================================

	describe("Race Expression Lowering", () => {
		it("should lower a PIR doc with race to a valid LIR document", () => {
			const lir = lowerPIRtoLIR(pirWithRace);

			assert.ok(lir.version);
			assert.ok(lir.nodes);
			assert.ok(lir.result);

			const blocks = getAllBlocks(lir);
			assert.ok(blocks.length > 0, "Should have at least one block");
		});

		it("should produce effect instruction with op 'race'", () => {
			const lir = lowerPIRtoLIR(pirWithRace);
			const blocks = getAllBlocks(lir);

			const raceInstr = blocks
				.flatMap((b) => b.instructions)
				.find((i) => i.kind === "effect" && "op" in i && i.op === "race");

			assert.ok(raceInstr, "Should have an effect instruction with op 'race'");
		});
	});

	//==========================================================================
	// Block Structure Tests
	//==========================================================================

	describe("Block Structure", () => {
		it("should create blocks with sequential IDs", () => {
			const lir = lowerPIRtoLIR(pirWithPar);
			const blocks = getAllBlocks(lir);

			blocks.forEach((block, index) => {
				assert.strictEqual(block.id, `bb${index}`);
			});
		});

		it("should set entry point to first block", () => {
			const lir = lowerPIRtoLIR(pirWithSpawn);
			const mainNode = lir.nodes[0];

			assert.ok(mainNode && "entry" in mainNode);
			if (mainNode && "entry" in mainNode) {
				assert.strictEqual(mainNode.entry, "bb0");
			}
		});

		it("should ensure all blocks have terminators", () => {
			const lir = lowerPIRtoLIR(pirWithAwait);
			const blocks = getAllBlocks(lir);

			blocks.forEach((block) => {
				assert.ok(block.terminator, `Block ${block.id} should have a terminator`);
				assert.ok(
					["jump", "branch", "return", "exit"].includes(block.terminator.kind),
					`Block ${block.id} should have valid terminator kind, got: ${block.terminator.kind}`,
				);
			});
		});

		it("should have a return terminator on the final block", () => {
			const lir = lowerPIRtoLIR(pirWithSpawn);
			const blocks = getAllBlocks(lir);

			const lastBlock = blocks[blocks.length - 1];
			assert.strictEqual(lastBlock.terminator.kind, "return");
		});
	});
});
