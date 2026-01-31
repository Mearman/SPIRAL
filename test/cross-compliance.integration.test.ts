// SPIRAL Cross-Implementation Compliance Tests
// Tests that TypeScript and Python implementations produce identical results

import { describe, it } from "node:test";
import * as assert from "node:assert";
import { evaluateProgram, evaluateEIR } from "../src/evaluator.js";
import { evaluateLIR as evaluateLIRSync } from "../src/lir/evaluator.js";
import { evaluateLIRAsync } from "../src/lir/async-evaluator.js";
import { emptyDefs } from "../src/env.js";
import { emptyEffectRegistry } from "../src/effects.js";
import { createCoreRegistry } from "../src/domains/core.js";
import { createBoolRegistry } from "../src/domains/bool.js";
import { createListRegistry } from "../src/domains/list.js";
import { createSetRegistry } from "../src/domains/set.js";
import type { Value } from "../src/types.js";
import {
	COMPLIANCE_FIXTURES,
	getFixturesByLayer,
	loadFixtureDocument,
	loadFixtureInputs,
	type ComplianceFixture,
} from "./fixtures/cross-compliance.fixtures.js";

//==============================================================================
// Value Comparison Utilities
//==============================================================================

/**
 * Deep compare two values for structural equality
 * Handles floating-point tolerance and set ordering
 */
function deepEqual(actual: unknown, expected: unknown, tolerance = 0): boolean {
	// Handle null/undefined
	if (actual === null || actual === undefined) {
		return actual === expected;
	}
	if (expected === null || expected === undefined) {
		return false;
	}

	// Primitive values
	if (typeof actual !== "object" || typeof expected !== "object") {
		return actual === expected;
	}

	const actualObj = actual as Record<string, unknown>;
	const expectedObj = expected as Record<string, unknown>;

	// Compare by kind
	if ("kind" in actualObj && "kind" in expectedObj && actualObj.kind !== expectedObj.kind) {
		return false;
	}

	const kind = actualObj.kind as string;

	switch (kind) {
	case "int":
	case "bool":
	case "string":
		return actualObj.value === expectedObj.value;

	case "float": {
		const actualValue = typeof actualObj.value === "number" ? actualObj.value : 0;
		const expectedValue = typeof expectedObj.value === "number" ? expectedObj.value : 0;
		if (tolerance > 0) {
			return Math.abs(actualValue - expectedValue) <= tolerance;
		}
		return actualValue === expectedValue;
	}

	case "list": {
		const actualList = actualObj.value as unknown[];
		const expectedList = expectedObj.value as unknown[];
		if (!Array.isArray(actualList) || !Array.isArray(expectedList)) {
			return false;
		}
		if (actualList.length !== expectedList.length) {
			return false;
		}
		for (let i = 0; i < actualList.length; i++) {
			if (!deepEqual(actualList[i]!, expectedList[i], tolerance)) {
				return false;
			}
		}
		return true;
	}

	case "set": {
		const actualList = actualObj.value as unknown[];
		const expectedList = expectedObj.value as unknown[];
		if (!Array.isArray(actualList) || !Array.isArray(expectedList)) {
			return false;
		}
		if (actualList.length !== expectedList.length) {
			return false;
		}
		// Sets are unordered - compare as sets
		const actualItems = new Set();
		const expectedItems = new Set();
		for (const item of actualList) {
			actualItems.add(JSON.stringify(item));
		}
		for (const item of expectedList) {
			expectedItems.add(JSON.stringify(item));
		}
		// Check all expected items are in actual
		for (const item of expectedItems) {
			if (!actualItems.has(item)) {
				return false;
			}
		}
		return true;
	}

	case "void":
		return kind === expectedObj.kind;

	case "error":
		return actualObj.code === expectedObj.code;

	default:
		// For unknown types, fall back to JSON comparison
		return JSON.stringify(actual) === JSON.stringify(expected);
	}
}

/**
 * Normalize a value for cross-implementation comparison
 * Removes implementation-specific artifacts (e.g., closure IDs, task IDs)
 */
function normalizeValue(value: unknown): unknown {
	if (typeof value !== "object" || value === null) {
		return value;
	}

	const obj = value as Record<string, unknown>;

	// Remove closure function IDs (implementation-specific)
	if (obj.kind === "closure") {
		return {
			kind: "closure",
			params: obj.params,
			body: obj.body,
			env: "<env>", // Don't compare env contents
		};
	}

	// Remove task IDs from futures (implementation-specific)
	if (obj.kind === "future") {
		return {
			kind: "future",
			of: normalizeValue(obj.of),
			status: obj.status,
		};
	}

	// Recursively normalize nested values
	if ("value" in obj && typeof obj.value === "object") {
		if (Array.isArray(obj.value)) {
			return {
				kind: obj.kind,
				value: obj.value.map(normalizeValue),
			};
		}
		if (obj.value !== null) {
			const normalized: Record<string, unknown> = {};
			for (const [key, val] of Object.entries(obj.value)) {
				normalized[key] = normalizeValue(val);
			}
			return {
				kind: obj.kind,
				value: normalized,
			};
		}
	}

	return value;
}

//==============================================================================
// Fixture Execution
//==============================================================================

/**
 * Execute a fixture using the TypeScript implementation
 */
async function executeFixture(fixture: ComplianceFixture): Promise<Value> {
	const doc = loadFixtureDocument(fixture) as {
		version: string;
		layer?: string;
		nodes?: unknown[];
		blocks?: unknown[];
		entry?: string;
		[key: string]: unknown;
	};
	const inputs = loadFixtureInputs(fixture);

	const layer = fixture.metadata.layer;
	// Build a complete registry with all domain operators
	const registry = new Map();
	// Merge core registry
	for (const [key, op] of createCoreRegistry()) {
		registry.set(key, op);
	}
	// Merge bool registry
	for (const [key, op] of createBoolRegistry()) {
		registry.set(key, op);
	}
	// Merge list registry
	for (const [key, op] of createListRegistry()) {
		registry.set(key, op);
	}
	// Merge set registry
	for (const [key, op] of createSetRegistry()) {
		registry.set(key, op);
	}
	const defs = emptyDefs();
	const effects = emptyEffectRegistry();

	// Parse inputs if provided
	const inputMap: Map<string, Value> = new Map();
	if (inputs && typeof inputs === "object") {
		for (const [key, val] of Object.entries(inputs)) {
			inputMap.set(key, val as Value);
		}
	}

	switch (layer) {
	case "AIR":
	case "CIR": {
		// AIR/CIR uses evaluateProgram
		return evaluateProgram(doc as never, registry, defs, inputMap);
	}

	case "EIR": {
		// EIR uses evaluateEIR
		const { result } = evaluateEIR(doc as never, registry, defs, inputMap);
		return result;
	}

	case "LIR": {
		// Check if this is an async LIR document (has fork terminator)
		const isAsync = JSON.stringify(doc).includes('"kind": "fork"');
		if (isAsync) {
			const { result } = await evaluateLIRAsync(doc as never, registry, effects, inputMap, undefined, defs);
			return result;
		}
		const { result } = evaluateLIRSync(doc as never, registry, effects, inputMap, undefined, defs);
		return result;
	}

	default:
		throw new Error(`Unknown layer: ${layer}`);
	}
}

/**
 * Verify a fixture's result matches expected output
 */
function verifyFixtureResult(fixture: ComplianceFixture, result: Value): void {
	const expected = fixture.expected;

	// Check for error expectation
	if (expected.error) {
		if (result.kind !== "error") {
			assert.fail(`Expected error with code ${expected.error.code}, got ${result.kind}`);
		}
		const errorResult = result as { code: string; message: string };
		if (errorResult.code !== expected.error.code) {
			assert.fail(`Expected error code ${expected.error.code}, got ${errorResult.code}`);
		}
		if (expected.error.messagePattern && errorResult.message) {
			const regex = new RegExp(expected.error.messagePattern);
			if (!regex.test(errorResult.message)) {
				assert.fail(`Error message "${errorResult.message}" does not match pattern ${expected.error.messagePattern}`);
			}
		}
		return;
	}

	// Check value matches expected
	const normalizedResult = normalizeValue(result);
	const tolerance = expected.tolerance ?? 0;

	if (expected.structural) {
		if (!deepEqual(normalizedResult, expected.value, tolerance)) {
			assert.fail(
				"Value mismatch:\n" +
					`  Expected: ${JSON.stringify(expected.value, null, 2)}\n` +
					`  Actual:   ${JSON.stringify(normalizedResult, null, 2)}`
			);
		}
	} else {
		// String comparison
		const actualString = JSON.stringify(normalizedResult);
		const expectedString = JSON.stringify(expected.value);
		if (actualString !== expectedString) {
			assert.fail(
				"String representation mismatch:\n" +
					`  Expected: ${expectedString}\n` +
					`  Actual:   ${actualString}`
			);
		}
	}
}

//==============================================================================
// Test Suites
//==============================================================================

describe("Cross-Implementation Compliance Tests", () => {
	// Run all fixtures
	for (const fixture of COMPLIANCE_FIXTURES) {
		it(`[${fixture.metadata.layer}] ${fixture.id}: ${fixture.metadata.description}`, async () => {
			const result = await executeFixture(fixture);
			verifyFixtureResult(fixture, result);
		});
	}
});

describe("Compliance by Layer", () => {
	const layers = ["AIR", "CIR", "EIR", "LIR"] as const;

	for (const layer of layers) {
		describe(`${layer} Compliance`, () => {
			const fixtures = getFixturesByLayer(layer);

			it(`should pass all ${layer} fixtures (${fixtures.length} tests)`, async () => {
				const failed: string[] = [];

				for (const fixture of fixtures) {
					try {
						const result = await executeFixture(fixture);
						verifyFixtureResult(fixture, result);
					} catch (error) {
						failed.push(fixture.id);
						console.error(`  ✗ ${fixture.id}: ${error}`);
					}
				}

				if (failed.length > 0) {
					assert.fail(`Failed ${failed.length}/${fixtures.length} ${layer} fixtures: ${failed.join(", ")}`);
				}
			});
		});
	}
});

describe("Value Normalization", () => {
	it("should normalize closure values (remove implementation details)", () => {
		const closure = {
			kind: "closure",
			params: ["x"],
			body: { kind: "var", name: "x" },
			env: { x: { kind: "int", value: 42 } },
		};
		const normalized = normalizeValue(closure);
		assert.strictEqual((normalized as { kind: string }).kind, "closure");
		assert.ok((normalized as { env: unknown }).env === "<env>");
	});

	it("should normalize future values (remove task IDs)", () => {
		const future = {
			kind: "future",
			taskId: "task_123",
			of: { kind: "int", value: 0 },
			status: "pending" as const,
		};
		const normalized = normalizeValue(future);
		assert.ok("taskId" in (normalized as { taskId?: string }) === false);
	});
});
