// SPDX-License-Identifier: MIT
// SPIRAL Round-Trip Integration Tests
// Tests semantic equivalence: TS -> Spiral -> TS and Spiral -> TS -> eval

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ingestTypeScript } from "../../src/ingest/typescript.ts";
import { synthesizeTypeScript } from "../../src/synth/typescript.ts";
import { evaluateProgram } from "../../src/evaluator.ts";
import { bootstrapRegistry } from "../../src/stdlib/bootstrap.ts";
import { emptyDefs } from "../../src/env.ts";
import type { AIRDocument, Value } from "../../src/types.ts";

//==============================================================================
// Helpers
//==============================================================================

const registry = bootstrapRegistry();
const defs = emptyDefs();

/**
 * Evaluate synthesized TypeScript code by extracting the result value.
 * Strips the final console.log and replaces with a return statement,
 * then wraps in a Function constructor.
 */
function evalSynthesizedTS(code: string): unknown {
	// Find the last console.log(...) and replace with return
	const lines = code.split("\n");
	const resultLines: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		// Match `console.log(v_...)` at the end (the result line)
		const match = line.match(/^console\.log\((.+)\);?\s*$/);
		if (match && i >= lines.length - 3) {
			// Near the end of the file — this is the result output
			resultLines.push(`return ${match[1]};`);
		} else {
			// Strip TypeScript type annotations for eval
			resultLines.push(stripTypeAnnotations(line));
		}
	}

	const body = resultLines.join("\n");
	const fn = new Function(body);
	return fn();
}

/**
 * Strip TypeScript type annotations so code can run as plain JS.
 * Handles: parameter annotations, variable annotations, generic types,
 * rest parameter annotations, and array type annotations.
 */
function stripTypeAnnotations(line: string): string {
	let result = line;
	// Remove rest parameter annotations: ...args: any[]
	result = result.replace(/(\.\.\.\w+): any\[\]/g, "$1");
	// Remove parameter type annotations like (x: any) => but preserve ternary colons
	result = result.replace(/(\w+): any/g, "$1");
	// Remove Record<string, any> type annotations
	result = result.replace(/: Record<string, any>/g, "");
	// Remove : string | null
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
		return val.value;
	case "bool":
		return val.value;
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
// Direction 1: TS -> Spiral -> TS (semantic equivalence)
//==============================================================================

describe("Round-Trip: TS -> Spiral -> TS", () => {
	const cases: Array<{ name: string; source: string; expected: unknown }> = [
		{ name: "addition", source: "2 + 3", expected: 5 },
		{ name: "subtraction", source: "10 - 3", expected: 7 },
		{ name: "multiplication", source: "(2 + 3) * 4", expected: 20 },
		{ name: "boolean and", source: "true && false", expected: false },
		{ name: "boolean not", source: "!false", expected: true },
		{ name: "comparison gt", source: "5 > 3", expected: true },
		{ name: "comparison eq", source: "5 === 5", expected: true },
		{ name: "ternary", source: "true ? 1 : 2", expected: 1 },
		{ name: "string concat", source: '"hello" + " world"', expected: "hello world" },
		{ name: "negation", source: "-5", expected: -5 },
	];

	for (const { name, source, expected } of cases) {
		it(`should round-trip: ${name}`, () => {
			// Step 1: Evaluate original TS source
			const originalFn = new Function(`return (${source});`);
			const originalResult = originalFn();

			// Step 2: Ingest to Spiral
			const doc = ingestTypeScript(source);

			// Step 3: Synthesize back to TS
			const synthesized = synthesizeTypeScript(doc);

			// Step 4: Evaluate synthesized TS
			const synthesizedResult = evalSynthesizedTS(synthesized);

			// Step 5: Compare — both should equal expected
			assert.deepStrictEqual(originalResult, expected, `Original TS should evaluate to ${expected}`);
			assert.deepStrictEqual(synthesizedResult, expected, `Synthesized TS should evaluate to ${expected}`);
		});
	}
});

//==============================================================================
// Direction 1b: TS -> Spiral -> TS with arrow functions
//==============================================================================

describe("Round-Trip: TS -> Spiral -> TS (functions)", () => {
	it("should round-trip arrow function with param reference", () => {
		const source = "const f = (x: number) => x + 1; f(5);";

		// Evaluate original
		const originalFn = new Function("const f = (x) => x + 1; return f(5);");
		const originalResult = originalFn();

		// Ingest, synthesize, evaluate
		const doc = ingestTypeScript(source);
		const synthesized = synthesizeTypeScript(doc);
		const synthesizedResult = evalSynthesizedTS(synthesized);

		assert.deepStrictEqual(originalResult, 6);
		assert.deepStrictEqual(synthesizedResult, 6);
	});

	it("should round-trip constant function application", () => {
		const source = "const f = (x: number) => 42; f(5);";

		const originalFn = new Function("const f = (x) => 42; return f(5);");
		const originalResult = originalFn();

		const doc = ingestTypeScript(source);
		const synthesized = synthesizeTypeScript(doc);
		const synthesizedResult = evalSynthesizedTS(synthesized);

		assert.deepStrictEqual(originalResult, 42);
		assert.deepStrictEqual(synthesizedResult, 42);
	});

	it("should round-trip multi-parameter function", () => {
		const source = "const add = (a: number, b: number) => a + b; add(3, 4);";

		const originalFn = new Function("const add = (a, b) => a + b; return add(3, 4);");
		const originalResult = originalFn();

		const doc = ingestTypeScript(source);
		const synthesized = synthesizeTypeScript(doc);
		const synthesizedResult = evalSynthesizedTS(synthesized);

		assert.deepStrictEqual(originalResult, 7);
		assert.deepStrictEqual(synthesizedResult, 7);
	});

	it("should round-trip higher-order function", () => {
		const source = "const apply = (f: (x: number) => number, x: number) => f(x); const inc = (n: number) => n + 1; apply(inc, 5);";

		const originalFn = new Function("const apply = (f, x) => f(x); const inc = (n) => n + 1; return apply(inc, 5);");
		const originalResult = originalFn();

		const doc = ingestTypeScript(source);
		const synthesized = synthesizeTypeScript(doc);
		const synthesizedResult = evalSynthesizedTS(synthesized);

		assert.deepStrictEqual(originalResult, 6);
		assert.deepStrictEqual(synthesizedResult, 6);
	});
});

//==============================================================================
// Direction 2: Spiral -> TS -> eval (semantic equivalence)
//==============================================================================

describe("Round-Trip: Spiral -> TS -> eval", () => {
	// Note: These fixtures use raw values (not Value objects like {kind:"int",value:5})
	// because evaluateProgram expects raw values in literal expressions.
	// The synthesizer handles both raw and Value-typed literals.

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

		const synthesized = synthesizeTypeScript(doc);
		const tsResult = evalSynthesizedTS(synthesized);

		assert.deepStrictEqual(spiralNorm, 8);
		assert.deepStrictEqual(tsResult, 8);
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

		const synthesized = synthesizeTypeScript(doc);
		const tsResult = evalSynthesizedTS(synthesized);

		assert.deepStrictEqual(spiralNorm, false);
		assert.deepStrictEqual(tsResult, false);
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

		const synthesized = synthesizeTypeScript(doc);
		const tsResult = evalSynthesizedTS(synthesized);

		assert.deepStrictEqual(spiralNorm, 1);
		assert.deepStrictEqual(tsResult, 1);
	});

	it("should match: CIR lambda application", () => {
		const doc: AIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "val", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
				{
					id: "fn",
					expr: { kind: "lambda", params: ["x"], body: "val" },
				},
				{
					id: "arg",
					expr: { kind: "lit", type: { kind: "int" }, value: 0 },
				},
				{
					id: "result",
					expr: { kind: "callExpr", fn: "fn", args: ["arg"] },
				},
			],
			result: "result",
		};

		const spiralResult = evaluateProgram(doc, registry, defs);
		const spiralNorm = normalizeValue(spiralResult);

		const synthesized = synthesizeTypeScript(doc);
		const tsResult = evalSynthesizedTS(synthesized);

		assert.deepStrictEqual(spiralNorm, 42);
		assert.deepStrictEqual(tsResult, 42);
	});

	it("should match: CIR lambda with let binding", () => {
		// Use let-binding to test closure semantics without inline var exprs
		// let x = 10 in (x + 3)
		const doc: AIRDocument = {
			version: "1.0.0",
			airDefs: [],
			nodes: [
				{ id: "val", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
				{ id: "three", expr: { kind: "lit", type: { kind: "int" }, value: 3 } },
				{
					id: "sum",
					expr: { kind: "call", ns: "core", name: "add", args: ["val", "three"] },
				},
				{
					id: "fn",
					expr: { kind: "lambda", params: ["unused"], body: "sum" },
				},
				{
					id: "arg",
					expr: { kind: "lit", type: { kind: "int" }, value: 0 },
				},
				{
					id: "result",
					expr: { kind: "callExpr", fn: "fn", args: ["arg"] },
				},
			],
			result: "result",
		};

		const spiralResult = evaluateProgram(doc, registry, defs);
		const spiralNorm = normalizeValue(spiralResult);

		const synthesized = synthesizeTypeScript(doc);
		const tsResult = evalSynthesizedTS(synthesized);

		assert.deepStrictEqual(spiralNorm, 13);
		assert.deepStrictEqual(tsResult, 13);
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

		const synthesized = synthesizeTypeScript(doc);
		const tsResult = evalSynthesizedTS(synthesized);

		assert.deepStrictEqual(spiralNorm, "hello world");
		assert.deepStrictEqual(tsResult, "hello world");
	});
});
