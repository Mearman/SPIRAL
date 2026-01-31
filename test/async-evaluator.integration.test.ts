// SPDX-License-Identifier: MIT
// SPIRAL EIR Async Evaluator Tests - Simple Version

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

import {
	createAsyncEvaluator,
} from "../src/async-evaluator.js";
import {
	emptyRegistry,
	defineOperator,
	registerOperator,
	type OperatorRegistry,
} from "../src/domains/registry.js";
import { emptyDefs } from "../src/env.js";
import {
	emptyEffectRegistry,
	registerEffect,
	type EffectRegistry,
} from "../src/effects.js";
import type {
	EIRDocument,
	EirHybridNode,
	EirExpr,
	Value,
} from "../src/types.js";
import {
	intVal,
	voidVal,
} from "../src/types.js";

//==============================================================================
// Test Fixtures
//==============================================================================

let registry: OperatorRegistry;
let defs: typeof emptyDefs;
let effects: EffectRegistry;

before(() => {
	// Initialize basic math operators for tests
	registry = emptyRegistry();

	// Addition operator
	const addOp = defineOperator("core", "add")
		.setParams({ kind: "int" }, { kind: "int" })
		.setReturns({ kind: "int" })
		.setPure(true)
		.setImpl((a: Value, b: Value) => {
			const av = a as { kind: "int"; value: number };
			const bv = b as { kind: "int"; value: number };
			return intVal(av.value + bv.value);
		})
		.build();
	registry = registerOperator(registry, addOp);

	defs = emptyDefs;

	effects = emptyEffectRegistry();
	effects = registerEffect(effects, {
		name: "sleep",
		params: [{ kind: "int" }],
		returns: { kind: "void" },
		pure: false,
		fn: () => {
			return voidVal();
		},
	});
});

function createExprNode(
	id: string,
	expr: EirExpr,
): EirHybridNode {
	return {
		id,
		expr,
	};
}

function createDocument(
	nodes: EirHybridNode[],
	result: string,
): EIRDocument {
	return {
		version: "1.0.0",
		airDefs: [],
		nodes,
		result,
	};
}

//==============================================================================
// Test Suite
//==============================================================================

describe("EIR Async Evaluator - Simple Tests", () => {
	it("should evaluate simple literal", async () => {
		const evaluator = createAsyncEvaluator(registry, defs(), effects);

		const doc = createDocument(
			[
				createExprNode("n1", {
					kind: "lit",
					type: { kind: "int" },
					value: 42,
				}),
			],
			"n1",
		);

		const result = await evaluator.evaluateDocument(doc);
		assert.equal(result.kind, "int");
		assert.equal((result as { kind: "int"; value: number }).value, 42);
	});

	it("should evaluate simple parallel expression with 2 branches", async () => {
		const evaluator = createAsyncEvaluator(registry, defs(), effects);

		const doc = createDocument(
			[
				createExprNode("n1", {
					kind: "lit",
					type: { kind: "int" },
					value: 5,
				}),
				createExprNode("n2", {
					kind: "lit",
					type: { kind: "int" },
					value: 10,
				}),
				createExprNode("result", {
					kind: "par",
					branches: ["n1", "n2"],
				}),
			],
			"result",
		);

		const result = await evaluator.evaluateDocument(doc);

		assert.equal(result.kind, "list");
		assert.equal((result as { kind: "list"; value: Value[] }).value.length, 2);
		assert.equal(
			(result as { kind: "list"; value: Value[] }).value[0].kind,
			"int",
		);
		assert.equal(
			(result as { kind: "list"; value: Value[] }).value[0].value,
			5,
		);
	});

	it("should spawn and await task successfully", async () => {
		const evaluator = createAsyncEvaluator(registry, defs(), effects);

		const doc = createDocument(
			[
				createExprNode("task", {
					kind: "lit",
					type: { kind: "int" },
					value: 42,
				}),
				createExprNode("spawned", {
					kind: "spawn",
					task: "task",
				}),
				createExprNode("result", {
					kind: "await",
					future: "spawned",
				}),
			],
			"result",
		);

		const result = await evaluator.evaluateDocument(doc);
		assert.equal(result.kind, "int");
		assert.equal((result as { kind: "int"; value: number }).value, 42);
	});
});
