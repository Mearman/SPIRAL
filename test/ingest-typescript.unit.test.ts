import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ingestTypeScript } from "../src/ingest/typescript.js";
import { evaluateProgram } from "../src/evaluator.js";
import { createCoreRegistry } from "../src/domains/core.js";
import { createBoolRegistry } from "../src/domains/bool.js";
import { createStringRegistry } from "../src/domains/string.js";
import { emptyDefs } from "../src/env.js";
import { intVal, stringVal, boolVal } from "../src/types.js";
import type { AIRDocument } from "../src/types.js";
import type { OperatorRegistry } from "../src/domains/registry.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function evalTS(source: string) {
	const doc = ingestTypeScript(source);
	return evaluateProgram(doc as AIRDocument, registry, defs);
}

// ===========================================================================
// 1. Simple arithmetic
// ===========================================================================
describe("ingestTypeScript", () => {
	it("simple arithmetic: 2 + 3", () => {
		const result = evalTS("const x = 2 + 3;");
		assert.deepEqual(result, intVal(5));
	});

	// ===========================================================================
	// 2. String literal
	// ===========================================================================
	it("string literal", () => {
		const result = evalTS('const x = "hello";');
		assert.deepEqual(result, stringVal("hello"));
	});

	// ===========================================================================
	// 3. Boolean literal
	// ===========================================================================
	it("boolean literal true", () => {
		const result = evalTS("const x = true;");
		assert.deepEqual(result, boolVal(true));
	});

	// ===========================================================================
	// 4. Ternary / conditional
	// ===========================================================================
	it("ternary expression", () => {
		const result = evalTS("const x = true ? 1 : 2;");
		assert.deepEqual(result, intVal(1));
	});

	// ===========================================================================
	// 5. Arrow function call
	// ===========================================================================
	it("arrow function", () => {
		const result = evalTS(
			"const f = (x: number) => x + 1; const y = f(5);",
		);
		assert.deepEqual(result, intVal(6));
	});

	// ===========================================================================
	// 6. Layer detection: AIR
	// ===========================================================================
	it("layer detection: AIR for pure expressions", () => {
		const doc = ingestTypeScript("const x = 1 + 2;");
		assert.equal(doc.version, "1.0.0");
		// AIR has no lambda/callExpr/assign nodes
		const hasLambda = doc.nodes.some(
			(n: { expr?: unknown }) =>
				n.expr && (n.expr as { kind: string }).kind === "lambda",
		);
		assert.equal(hasLambda, false);
	});

	// ===========================================================================
	// 7. Layer detection: CIR
	// ===========================================================================
	it("layer detection: CIR for arrow functions", () => {
		const doc = ingestTypeScript("const f = (x: number) => x;");
		// CIR should have lambda nodes
		const hasLambda = doc.nodes.some(
			(n: { expr?: unknown }) =>
				n.expr && (n.expr as { kind: string }).kind === "lambda",
		);
		assert.equal(hasLambda, true);
	});

	// ===========================================================================
	// 8. Layer detection: EIR
	// ===========================================================================
	it("layer detection: EIR for let reassignment", () => {
		const doc = ingestTypeScript("let x = 1; x = 2;");
		// Should have assign node
		const hasAssign = doc.nodes.some(
			(n: { expr?: unknown }) =>
				n.expr && (n.expr as { kind: string }).kind === "assign",
		);
		assert.equal(hasAssign, true);
	});

	// ===========================================================================
	// 9. Force layer
	// ===========================================================================
	it("force layer CIR", () => {
		const doc = ingestTypeScript("const x = 1;", { forceLayer: "cir" });
		assert.equal(doc.version, "1.0.0");
	});

	it("force layer PIR sets version 2.0.0", () => {
		const doc = ingestTypeScript("const x = 1;", { forceLayer: "pir" });
		assert.equal(doc.version, "2.0.0");
		assert.deepEqual(doc.capabilities, ["async"]);
	});

	// ===========================================================================
	// 10. Multiple statements
	// ===========================================================================
	it("multiple statements: last value", () => {
		const result = evalTS("const a = 1; const b = 2; const c = a;");
		assert.deepEqual(result, intVal(1));
	});

	// ===========================================================================
	// 11. Nested arithmetic
	// ===========================================================================
	it("nested arithmetic: (2 + 3) * 4", () => {
		const result = evalTS("const x = (2 + 3) * 4;");
		assert.deepEqual(result, intVal(20));
	});

	// ===========================================================================
	// 12. String concat
	// ===========================================================================
	it("string concatenation", () => {
		const result = evalTS('const x = "hello" + " world";');
		assert.deepEqual(result, stringVal("hello world"));
	});

	// ===========================================================================
	// 13. Comparison
	// ===========================================================================
	it("comparison: 5 > 3", () => {
		const result = evalTS("const x = 5 > 3;");
		assert.deepEqual(result, boolVal(true));
	});

	// ===========================================================================
	// 14. Template literal
	// ===========================================================================
	it("template literal", () => {
		const result = evalTS("const x = `hello ${'world'}`;");
		assert.deepEqual(result, stringVal("hello world"));
	});

	// ===========================================================================
	// Additional tests
	// ===========================================================================
	it("boolean false", () => {
		const result = evalTS("const x = false;");
		assert.deepEqual(result, boolVal(false));
	});

	it("subtraction", () => {
		const result = evalTS("const x = 10 - 3;");
		assert.deepEqual(result, intVal(7));
	});

	it("multiplication", () => {
		const result = evalTS("const x = 6 * 7;");
		assert.deepEqual(result, intVal(42));
	});

	it("division", () => {
		const result = evalTS("const x = 10 / 2;");
		assert.deepEqual(result, intVal(5));
	});

	it("modulo", () => {
		const result = evalTS("const x = 10 % 3;");
		assert.deepEqual(result, intVal(1));
	});

	it("equality comparison", () => {
		const result = evalTS("const x = 5 === 5;");
		assert.deepEqual(result, boolVal(true));
	});

	it("inequality comparison", () => {
		const result = evalTS("const x = 5 !== 3;");
		assert.deepEqual(result, boolVal(true));
	});

	it("less than", () => {
		const result = evalTS("const x = 3 < 5;");
		assert.deepEqual(result, boolVal(true));
	});

	it("negation: -5", () => {
		const result = evalTS("const x = -5;");
		assert.deepEqual(result, intVal(-5));
	});

	it("logical not", () => {
		const result = evalTS("const x = !false;");
		assert.deepEqual(result, boolVal(true));
	});

	it("document structure", () => {
		const doc = ingestTypeScript("const x = 42;");
		assert.equal(typeof doc.version, "string");
		assert.ok(Array.isArray(doc.airDefs));
		assert.ok(Array.isArray(doc.nodes));
		assert.equal(typeof doc.result, "string");
		assert.ok(doc.nodes.length > 0);
	});

	it("custom version option", () => {
		const doc = ingestTypeScript("const x = 1;", { version: "3.0.0" });
		assert.equal(doc.version, "3.0.0");
	});
});
