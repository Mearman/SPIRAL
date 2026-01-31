// SPDX-License-Identifier: MIT
// SPIRAL Python Round-Trip Integration Tests
// Tests semantic equivalence across 4 directions:
//   1. Python -> Spiral -> Python (same-language roundtrip)
//   2. Spiral -> Python -> exec (synthesizer validation)
//   3. TS -> Spiral -> Python (cross-language)
//   4. Python -> Spiral -> TS (cross-language)

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";

import { ingestPython } from "../../src/ingest/python.js";
import { ingestTypeScript } from "../../src/ingest/typescript.js";
import { synthesizePython } from "../../src/synth/python.js";
import { synthesizeTypeScript } from "../../src/synth/typescript.js";
import { evaluateProgram } from "../../src/evaluator.js";
import { createCoreRegistry } from "../../src/domains/core.js";
import { createBoolRegistry } from "../../src/domains/bool.js";
import { createStringRegistry } from "../../src/domains/string.js";
import { emptyDefs } from "../../src/env.js";
import type { AIRDocument, Value } from "../../src/types.js";
import type { OperatorRegistry } from "../../src/domains/registry.js";

//==============================================================================
// Python availability check
//==============================================================================

let pythonAvailable = false;
try {
	execSync("python3 --version", { encoding: "utf-8", timeout: 5_000 });
	pythonAvailable = true;
} catch {
	// python3 not available
}

//==============================================================================
// Helpers
//==============================================================================

function mergeRegistries(...registries: OperatorRegistry[]): OperatorRegistry {
	const merged: OperatorRegistry = new Map();
	for (const r of registries) {
		for (const [k, v] of r) {
			merged.set(k, v);
		}
	}
	return merged;
}

const registry = mergeRegistries(
	createCoreRegistry(),
	createBoolRegistry(),
	createStringRegistry(),
);
const defs = emptyDefs();

/**
 * Execute a Python expression and return its value.
 */
function execPython(source: string): unknown {
	const script = `import json\nresult = ${source}\nprint(json.dumps(result))`;
	const output = execSync("python3", {
		input: script,
		encoding: "utf-8",
		timeout: 10_000,
	}).trim();
	return JSON.parse(output);
}

/**
 * Replace the final print(v_...) in synthesized Python code with json.dumps
 * so we get JSON-parseable output (booleans as true/false, etc).
 */
function wrapOutputAsJson(code: string): string {
	return code.replace(
		/^print\((.+)\)\s*$/m,
		"import json\nprint(json.dumps($1))",
	);
}

/**
 * Execute synthesized Python code and return the result as a JS value.
 */
function evalSynthesizedPython(code: string): unknown {
	const wrapped = wrapOutputAsJson(code);
	const output = execSync("python3", {
		input: wrapped,
		encoding: "utf-8",
		timeout: 10_000,
	}).trim();
	return JSON.parse(output);
}

/**
 * Evaluate synthesized TypeScript code by extracting the result value.
 */
function evalSynthesizedTS(code: string): unknown {
	const lines = code.split("\n");
	const resultLines: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		const match = line.match(/^console\.log\((.+)\);?\s*$/);
		if (match && i >= lines.length - 3) {
			resultLines.push(`return ${match[1]};`);
		} else {
			resultLines.push(stripTypeAnnotations(line));
		}
	}

	const body = resultLines.join("\n");
	const fn = new Function(body);
	return fn();
}

function stripTypeAnnotations(line: string): string {
	let result = line;
	result = result.replace(/(\.\.\.\w+): any\[\]/g, "$1");
	result = result.replace(/(\w+): any/g, "$1");
	result = result.replace(/: Record<string, any>/g, "");
	result = result.replace(/: string \| null/g, "");
	return result;
}

/**
 * Normalize a SPIRAL Value to a JS primitive for comparison.
 */
function normalizeValue(val: Value): unknown {
	switch (val.kind) {
	case "int":
	case "float":
	case "bool":
	case "string":
		return val.value;
	case "void":
		return null;
	case "list":
		return val.value.map(normalizeValue);
	default:
		return val;
	}
}

//==============================================================================
// Direction 1: Python -> Spiral -> Python (same-language roundtrip)
//==============================================================================

describe("Round-Trip: Python -> Spiral -> Python", { skip: !pythonAvailable }, () => {
	const cases: Array<{ name: string; source: string; expected: unknown }> = [
		{ name: "addition", source: "2 + 3", expected: 5 },
		{ name: "subtraction", source: "10 - 3", expected: 7 },
		{ name: "multiplication", source: "(2 + 3) * 4", expected: 20 },
		{ name: "boolean and", source: "True and False", expected: false },
		{ name: "boolean not", source: "not False", expected: true },
		{ name: "comparison gt", source: "5 > 3", expected: true },
		{ name: "comparison eq", source: "5 == 5", expected: true },
		{ name: "ternary", source: "1 if True else 2", expected: 1 },
		{ name: "string concat", source: '"hello" + " world"', expected: "hello world" },
		{ name: "negation", source: "-5", expected: -5 },
	];

	for (const { name, source, expected } of cases) {
		it(`should round-trip: ${name}`, () => {
			// Step 1: Evaluate original Python
			const originalResult = execPython(source);

			// Step 2: Ingest to Spiral
			const doc = ingestPython(source);

			// Step 3: Synthesize back to Python
			const synthesized = synthesizePython(doc);

			// Step 4: Execute synthesized Python
			const synthesizedResult = evalSynthesizedPython(synthesized);

			// Step 5: Both should match expected
			assert.deepStrictEqual(originalResult, expected, `Original Python should evaluate to ${JSON.stringify(expected)}`);
			assert.deepStrictEqual(synthesizedResult, expected, `Synthesized Python should evaluate to ${JSON.stringify(expected)}`);
		});
	}
});

//==============================================================================
// Direction 2: Spiral -> Python -> exec (synthesizer validation)
//==============================================================================

describe("Round-Trip: Spiral -> Python -> exec", { skip: !pythonAvailable }, () => {
	it("should match: AIR arithmetic (5 + 3 = 8)", () => {
		const doc: AIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "x", expr: { kind: "lit", type: { kind: "int" }, value: 5 } },
				{ id: "y", expr: { kind: "lit", type: { kind: "int" }, value: 3 } },
				{ id: "result", expr: { kind: "call", ns: "core", name: "add", args: ["x", "y"] } },
			],
			result: "result",
		};

		const spiralResult = evaluateProgram(doc, registry, defs);
		const spiralNorm = normalizeValue(spiralResult);

		const synthesized = synthesizePython(doc);
		const pythonResult = evalSynthesizedPython(synthesized);

		assert.deepStrictEqual(spiralNorm, 8);
		assert.deepStrictEqual(pythonResult, 8);
	});

	it("should match: AIR booleans (true && false = false)", () => {
		const doc: AIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "a", expr: { kind: "lit", type: { kind: "bool" }, value: true } },
				{ id: "b", expr: { kind: "lit", type: { kind: "bool" }, value: false } },
				{ id: "result", expr: { kind: "call", ns: "bool", name: "and", args: ["a", "b"] } },
			],
			result: "result",
		};

		const spiralResult = evaluateProgram(doc, registry, defs);
		const spiralNorm = normalizeValue(spiralResult);

		const synthesized = synthesizePython(doc);
		const pythonResult = evalSynthesizedPython(synthesized);

		assert.deepStrictEqual(spiralNorm, false);
		assert.deepStrictEqual(pythonResult, false);
	});

	it("should match: AIR conditional (true ? 1 : 2 = 1)", () => {
		const doc: AIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "cond", expr: { kind: "lit", type: { kind: "bool" }, value: true } },
				{ id: "then", expr: { kind: "lit", type: { kind: "int" }, value: 1 } },
				{ id: "else", expr: { kind: "lit", type: { kind: "int" }, value: 2 } },
				{ id: "result", expr: { kind: "if", cond: "cond", then: "then", else: "else" } },
			],
			result: "result",
		};

		const spiralResult = evaluateProgram(doc, registry, defs);
		const spiralNorm = normalizeValue(spiralResult);

		const synthesized = synthesizePython(doc);
		const pythonResult = evalSynthesizedPython(synthesized);

		assert.deepStrictEqual(spiralNorm, 1);
		assert.deepStrictEqual(pythonResult, 1);
	});

	it("should match: CIR lambda application (42)", () => {
		const doc: AIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "val", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
				{ id: "fn", expr: { kind: "lambda", params: ["x"], body: "val" } },
				{ id: "arg", expr: { kind: "lit", type: { kind: "int" }, value: 0 } },
				{ id: "result", expr: { kind: "callExpr", fn: "fn", args: ["arg"] } },
			],
			result: "result",
		};

		const spiralResult = evaluateProgram(doc, registry, defs);
		const spiralNorm = normalizeValue(spiralResult);

		const synthesized = synthesizePython(doc);
		const pythonResult = evalSynthesizedPython(synthesized);

		assert.deepStrictEqual(spiralNorm, 42);
		assert.deepStrictEqual(pythonResult, 42);
	});

	it("should match: CIR lambda with let binding (13)", () => {
		const doc: AIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "val", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
				{ id: "three", expr: { kind: "lit", type: { kind: "int" }, value: 3 } },
				{ id: "sum", expr: { kind: "call", ns: "core", name: "add", args: ["val", "three"] } },
				{ id: "fn", expr: { kind: "lambda", params: ["unused"], body: "sum" } },
				{ id: "arg", expr: { kind: "lit", type: { kind: "int" }, value: 0 } },
				{ id: "result", expr: { kind: "callExpr", fn: "fn", args: ["arg"] } },
			],
			result: "result",
		};

		const spiralResult = evaluateProgram(doc, registry, defs);
		const spiralNorm = normalizeValue(spiralResult);

		const synthesized = synthesizePython(doc);
		const pythonResult = evalSynthesizedPython(synthesized);

		assert.deepStrictEqual(spiralNorm, 13);
		assert.deepStrictEqual(pythonResult, 13);
	});

	it("should match: string concat", () => {
		const doc: AIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "a", expr: { kind: "lit", type: { kind: "string" }, value: "hello" } },
				{ id: "b", expr: { kind: "lit", type: { kind: "string" }, value: " world" } },
				{ id: "result", expr: { kind: "call", ns: "string", name: "concat", args: ["a", "b"] } },
			],
			result: "result",
		};

		const spiralResult = evaluateProgram(doc, registry, defs);
		const spiralNorm = normalizeValue(spiralResult);

		const synthesized = synthesizePython(doc);
		const pythonResult = evalSynthesizedPython(synthesized);

		assert.deepStrictEqual(spiralNorm, "hello world");
		assert.deepStrictEqual(pythonResult, "hello world");
	});
});

//==============================================================================
// Direction 3: TS -> Spiral -> Python (cross-language)
//==============================================================================

describe("Round-Trip: TS -> Spiral -> Python", { skip: !pythonAvailable }, () => {
	const cases: Array<{ name: string; source: string; expected: unknown }> = [
		{ name: "addition", source: "2 + 3", expected: 5 },
		{ name: "subtraction", source: "10 - 3", expected: 7 },
		{ name: "boolean and", source: "true && false", expected: false },
		{ name: "boolean not", source: "!false", expected: true },
		{ name: "comparison gt", source: "5 > 3", expected: true },
		{ name: "ternary", source: "true ? 1 : 2", expected: 1 },
		{ name: "string concat", source: '"hello" + " world"', expected: "hello world" },
		{ name: "negation", source: "-5", expected: -5 },
	];

	for (const { name, source, expected } of cases) {
		it(`should cross-compile TS -> Python: ${name}`, () => {
			// Step 1: Ingest TS to Spiral
			const doc = ingestTypeScript(source);

			// Step 2: Evaluate via SPIRAL evaluator
			const spiralResult = evaluateProgram(doc, registry, defs);
			const spiralNorm = normalizeValue(spiralResult);

			// Step 3: Synthesize to Python and execute
			const synthesized = synthesizePython(doc);
			const pythonResult = evalSynthesizedPython(synthesized);

			// Step 4: Both should match expected
			assert.deepStrictEqual(spiralNorm, expected, `SPIRAL eval should produce ${JSON.stringify(expected)}`);
			assert.deepStrictEqual(pythonResult, expected, `Python exec should produce ${JSON.stringify(expected)}`);
		});
	}
});

//==============================================================================
// Direction 4: Python -> Spiral -> TS (cross-language)
//==============================================================================

describe("Round-Trip: Python -> Spiral -> TS", { skip: !pythonAvailable }, () => {
	const cases: Array<{ name: string; source: string; expected: unknown }> = [
		{ name: "addition", source: "2 + 3", expected: 5 },
		{ name: "subtraction", source: "10 - 3", expected: 7 },
		{ name: "boolean and", source: "True and False", expected: false },
		{ name: "boolean not", source: "not False", expected: true },
		{ name: "comparison gt", source: "5 > 3", expected: true },
		{ name: "ternary", source: "1 if True else 2", expected: 1 },
		{ name: "string concat", source: '"hello" + " world"', expected: "hello world" },
		{ name: "negation", source: "-5", expected: -5 },
	];

	for (const { name, source, expected } of cases) {
		it(`should cross-compile Python -> TS: ${name}`, () => {
			// Step 1: Ingest Python to Spiral
			const doc = ingestPython(source);

			// Step 2: Evaluate via SPIRAL evaluator
			const spiralResult = evaluateProgram(doc, registry, defs);
			const spiralNorm = normalizeValue(spiralResult);

			// Step 3: Synthesize to TypeScript and execute
			const synthesized = synthesizeTypeScript(doc);
			const tsResult = evalSynthesizedTS(synthesized);

			// Step 4: Both should match expected
			assert.deepStrictEqual(spiralNorm, expected, `SPIRAL eval should produce ${JSON.stringify(expected)}`);
			assert.deepStrictEqual(tsResult, expected, `TS exec should produce ${JSON.stringify(expected)}`);
		});
	}
});
