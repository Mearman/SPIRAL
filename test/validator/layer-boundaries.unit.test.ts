// SPDX-License-Identifier: MIT
// SPIRAL Validator - Layer Boundary Tests
//
// Verifies that each layer's Zod schema rejects expressions from higher layers.
// Each test creates a minimal valid document for the target layer, injects one
// forbidden expression kind at node level, and asserts valid === false.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	validateAIR,
	validateCIR,
	validateLIR,
} from "../../src/validator.js";

//==============================================================================
// Helpers
//==============================================================================

/** Build a minimal AIR document with a single expression node. */
function airDoc(expr: Record<string, unknown>) {
	return {
		version: "1.0.0",
		airDefs: [],
		nodes: [
			{ id: "n1", expr },
			{ id: "result", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
		],
		result: "result",
	};
}

/** Build a minimal CIR document with a single expression node. */
function cirDoc(expr: Record<string, unknown>) {
	return {
		version: "1.0.0",
		airDefs: [],
		nodes: [
			{ id: "n1", expr },
			{ id: "result", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
		],
		result: "result",
	};
}

/** Build a minimal LIR document with an expression node (LIR supports hybrid nodes). */
function lirDoc(expr: Record<string, unknown>) {
	return {
		version: "1.0.0",
		nodes: [
			{ id: "n1", expr },
			{
				id: "main",
				blocks: [
					{
						id: "entry",
						instructions: [],
						terminator: { kind: "return" },
					},
				],
				entry: "entry",
			},
		],
		result: "main",
	};
}

//==============================================================================
// Expression Fixtures
//==============================================================================

const fnType = { kind: "fn", params: [{ kind: "int" }], returns: { kind: "int" } };

// CIR expressions (forbidden in AIR)
const lambdaExpr = { kind: "lambda", params: ["x"], body: "x", type: fnType };
const fixExpr = { kind: "fix", fn: "n1", type: fnType };
const callExprExpr = { kind: "callExpr", fn: "n1", args: ["n1"] };
const doExpr = { kind: "do", exprs: ["n1"] };

// EIR expressions (forbidden in AIR, CIR)
const seqExpr = { kind: "seq", first: "n1", then: "n1" };
const assignExpr = { kind: "assign", target: "x", value: "n1" };
const whileExpr = { kind: "while", cond: "n1", body: "n1" };
const forExpr = { kind: "for", var: "i", init: "n1", cond: "n1", update: "n1", body: "n1" };
const iterExpr = { kind: "iter", var: "x", iter: "n1", body: "n1" };
const effectExpr = { kind: "effect", op: "io:print", args: ["n1"] };
const refCellExpr = { kind: "refCell", target: "n1" };
const derefExpr = { kind: "deref", target: "n1" };
const tryExpr = { kind: "try", tryBody: "n1", catchParam: "e", catchBody: "n1" };

// Async expressions (forbidden in AIR, CIR, LIR)
const spawnExpr = { kind: "spawn", task: "n1" };
const awaitExpr = { kind: "await", future: "n1" };
const parExpr = { kind: "par", branches: ["n1"] };
const channelExpr = { kind: "channel", channelType: "mpsc" };
const sendExpr = { kind: "send", channel: "n1", value: "n1" };
const recvExpr = { kind: "recv", channel: "n1" };
const selectExpr = { kind: "select", futures: ["n1"] };
const raceExpr = { kind: "race", tasks: ["n1"] };

//==============================================================================
// Test Suite
//==============================================================================

describe("Layer Boundaries - Unit Tests", () => {

	//==========================================================================
	// AIR rejects CIR expressions
	//==========================================================================

	describe("AIR rejects CIR expressions", () => {
		it("AIR should reject lambda expression", () => {
			const result = validateAIR(airDoc(lambdaExpr));
			assert.strictEqual(result.valid, false);
		});

		it("AIR should reject fix expression", () => {
			const result = validateAIR(airDoc(fixExpr));
			assert.strictEqual(result.valid, false);
		});

		it("AIR should reject callExpr expression", () => {
			const result = validateAIR(airDoc(callExprExpr));
			assert.strictEqual(result.valid, false);
		});

		it("AIR should reject do expression", () => {
			const result = validateAIR(airDoc(doExpr));
			assert.strictEqual(result.valid, false);
		});
	});

	//==========================================================================
	// AIR rejects EIR expressions
	//==========================================================================

	describe("AIR rejects EIR expressions", () => {
		it("AIR should reject seq expression", () => {
			const result = validateAIR(airDoc(seqExpr));
			assert.strictEqual(result.valid, false);
		});

		it("AIR should reject assign expression", () => {
			const result = validateAIR(airDoc(assignExpr));
			assert.strictEqual(result.valid, false);
		});

		it("AIR should reject while expression", () => {
			const result = validateAIR(airDoc(whileExpr));
			assert.strictEqual(result.valid, false);
		});
	});

	//==========================================================================
	// AIR rejects async expressions
	//==========================================================================

	describe("AIR rejects async expressions", () => {
		it("AIR should reject spawn expression", () => {
			const result = validateAIR(airDoc(spawnExpr));
			assert.strictEqual(result.valid, false);
		});

		it("AIR should reject await expression", () => {
			const result = validateAIR(airDoc(awaitExpr));
			assert.strictEqual(result.valid, false);
		});

		it("AIR should reject par expression", () => {
			const result = validateAIR(airDoc(parExpr));
			assert.strictEqual(result.valid, false);
		});

		it("AIR should reject channel expression", () => {
			const result = validateAIR(airDoc(channelExpr));
			assert.strictEqual(result.valid, false);
		});
	});

	//==========================================================================
	// CIR rejects EIR expressions
	//==========================================================================

	describe("CIR rejects EIR expressions", () => {
		it("CIR should reject seq expression", () => {
			const result = validateCIR(cirDoc(seqExpr));
			assert.strictEqual(result.valid, false);
		});

		it("CIR should reject assign expression", () => {
			const result = validateCIR(cirDoc(assignExpr));
			assert.strictEqual(result.valid, false);
		});

		it("CIR should reject while expression", () => {
			const result = validateCIR(cirDoc(whileExpr));
			assert.strictEqual(result.valid, false);
		});

		it("CIR should reject for expression", () => {
			const result = validateCIR(cirDoc(forExpr));
			assert.strictEqual(result.valid, false);
		});

		it("CIR should reject iter expression", () => {
			const result = validateCIR(cirDoc(iterExpr));
			assert.strictEqual(result.valid, false);
		});

		it("CIR should reject effect expression", () => {
			const result = validateCIR(cirDoc(effectExpr));
			assert.strictEqual(result.valid, false);
		});

		it("CIR should reject refCell expression", () => {
			const result = validateCIR(cirDoc(refCellExpr));
			assert.strictEqual(result.valid, false);
		});

		it("CIR should reject deref expression", () => {
			const result = validateCIR(cirDoc(derefExpr));
			assert.strictEqual(result.valid, false);
		});

		it("CIR should reject try expression", () => {
			const result = validateCIR(cirDoc(tryExpr));
			assert.strictEqual(result.valid, false);
		});
	});

	//==========================================================================
	// CIR rejects async expressions
	//==========================================================================

	describe("CIR rejects async expressions", () => {
		it("CIR should reject spawn expression", () => {
			const result = validateCIR(cirDoc(spawnExpr));
			assert.strictEqual(result.valid, false);
		});

		it("CIR should reject await expression", () => {
			const result = validateCIR(cirDoc(awaitExpr));
			assert.strictEqual(result.valid, false);
		});

		it("CIR should reject par expression", () => {
			const result = validateCIR(cirDoc(parExpr));
			assert.strictEqual(result.valid, false);
		});

		it("CIR should reject channel expression", () => {
			const result = validateCIR(cirDoc(channelExpr));
			assert.strictEqual(result.valid, false);
		});

		it("CIR should reject send expression", () => {
			const result = validateCIR(cirDoc(sendExpr));
			assert.strictEqual(result.valid, false);
		});

		it("CIR should reject recv expression", () => {
			const result = validateCIR(cirDoc(recvExpr));
			assert.strictEqual(result.valid, false);
		});

		it("CIR should reject select expression", () => {
			const result = validateCIR(cirDoc(selectExpr));
			assert.strictEqual(result.valid, false);
		});

		it("CIR should reject race expression", () => {
			const result = validateCIR(cirDoc(raceExpr));
			assert.strictEqual(result.valid, false);
		});
	});

	//==========================================================================
	// LIR expression nodes reject async expressions
	//
	// LIR expression nodes use CirExprSchema, so they should reject both
	// EIR-specific and async expression kinds.
	//==========================================================================

	describe("LIR expression nodes reject async expressions", () => {
		it("LIR should reject spawn expression", () => {
			const result = validateLIR(lirDoc(spawnExpr));
			assert.strictEqual(result.valid, false);
		});

		it("LIR should reject await expression", () => {
			const result = validateLIR(lirDoc(awaitExpr));
			assert.strictEqual(result.valid, false);
		});

		it("LIR should reject par expression", () => {
			const result = validateLIR(lirDoc(parExpr));
			assert.strictEqual(result.valid, false);
		});

		it("LIR should reject channel expression", () => {
			const result = validateLIR(lirDoc(channelExpr));
			assert.strictEqual(result.valid, false);
		});

		it("LIR should reject send expression", () => {
			const result = validateLIR(lirDoc(sendExpr));
			assert.strictEqual(result.valid, false);
		});

		it("LIR should reject recv expression", () => {
			const result = validateLIR(lirDoc(recvExpr));
			assert.strictEqual(result.valid, false);
		});

		it("LIR should reject select expression", () => {
			const result = validateLIR(lirDoc(selectExpr));
			assert.strictEqual(result.valid, false);
		});

		it("LIR should reject race expression", () => {
			const result = validateLIR(lirDoc(raceExpr));
			assert.strictEqual(result.valid, false);
		});
	});
});
