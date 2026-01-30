// SPIRAL Auto-Discovery Example Test Suite
// Validates and evaluates all example JSON files automatically

import { describe, it } from "node:test";
import * as assert from "node:assert";
import { readFileSync, existsSync } from "fs";
import { resolve, relative, basename } from "path";
import { globSync } from "glob";

import { evaluateProgram, evaluateEIR } from "../src/evaluator.js";
import { evaluateLIR } from "../src/lir/evaluator.js";
import { evaluateLIRAsync } from "../src/lir/async-evaluator.js";
import { AsyncEvaluator } from "../src/async-evaluator.js";
import { emptyDefs, emptyValueEnv, registerDef } from "../src/env.js";
import {
	createDefaultEffectRegistry,
	createQueuedEffectRegistry,
} from "../src/effects.js";
import { createCoreRegistry } from "../src/domains/core.js";
import { createBoolRegistry } from "../src/domains/bool.js";
import { createListRegistry } from "../src/domains/list.js";
import { createSetRegistry } from "../src/domains/set.js";
import {
	validateAIR,
	validateCIR,
	validateEIR,
	validateLIR,
	validatePIR,
} from "../src/validator.js";
import type { Value, OperatorRegistry } from "../src/types.js";

//==============================================================================
// Types
//==============================================================================

type Layer = "AIR" | "CIR" | "EIR" | "PIR" | "LIR";

interface ExampleInfo {
	path: string;
	relativePath: string;
	layer: Layer;
	doc: Record<string, unknown>;
	hasExpectedResult: boolean;
	expectedResult?: unknown;
	inputsPath?: string;
	inputs?: (string | number)[];
}

//==============================================================================
// Discovery
//==============================================================================

function discoverExamples(): ExampleInfo[] {
	const root = resolve(import.meta.dirname, "..");
	const pattern = "examples/**/*.{air,cir,eir,lir,pir}.json";
	const files = globSync(pattern, { cwd: root, absolute: true });

	return files.map((filePath) => {
		const content = readFileSync(filePath, "utf-8");
		const doc = JSON.parse(content);
		const rel = relative(root, filePath);
		const layer = detectLayer(filePath);

		// Look for companion .inputs.json
		const inputsPath = filePath.replace(
			/\.(air|cir|eir|lir|pir)\.json$/,
			".inputs.json",
		);
		const hasInputs = existsSync(inputsPath);
		let inputs: (string | number)[] | undefined;
		if (hasInputs) {
			inputs = JSON.parse(readFileSync(inputsPath, "utf-8"));
		}

		return {
			path: filePath,
			relativePath: rel,
			layer,
			doc,
			hasExpectedResult: "expected_result" in doc,
			expectedResult: doc.expected_result,
			inputsPath: hasInputs ? inputsPath : undefined,
			inputs,
		};
	});
}

function detectLayer(filePath: string): Layer {
	const name = basename(filePath);
	if (name.endsWith(".air.json")) return "AIR";
	if (name.endsWith(".cir.json")) return "CIR";
	if (name.endsWith(".eir.json")) return "EIR";
	if (name.endsWith(".lir.json")) return "LIR";
	if (name.endsWith(".pir.json")) return "PIR";
	throw new Error(`Cannot detect layer from filename: ${name}`);
}

//==============================================================================
// Registry & Execution
//==============================================================================

function buildRegistry(): OperatorRegistry {
	const registry: OperatorRegistry = new Map();
	for (const [key, op] of createCoreRegistry()) registry.set(key, op);
	for (const [key, op] of createBoolRegistry()) registry.set(key, op);
	for (const [key, op] of createListRegistry()) registry.set(key, op);
	for (const [key, op] of createSetRegistry()) registry.set(key, op);
	return registry;
}

function getValidator(layer: Layer) {
	switch (layer) {
	case "AIR":
		return validateAIR;
	case "CIR":
		return validateCIR;
	case "EIR":
		return validateEIR;
	case "LIR":
		return validateLIR;
	case "PIR":
		return validatePIR;
	}
}

function buildEffectRegistry(example: ExampleInfo) {
	if (example.inputs) {
		return createQueuedEffectRegistry(example.inputs);
	}
	return createDefaultEffectRegistry();
}

function buildDefs(doc: Record<string, unknown>) {
	let defs = emptyDefs();
	const airDefs = doc.airDefs as Array<{ ns: string; name: string; params: string[]; result: unknown; body: unknown }> | undefined;
	if (airDefs) {
		for (const def of airDefs) {
			defs = registerDef(defs, def as never);
		}
	}
	return defs;
}

async function executeExample(example: ExampleInfo): Promise<Value> {
	const registry = buildRegistry();
	const defs = buildDefs(example.doc);
	const doc = example.doc;

	switch (example.layer) {
	case "AIR":
	case "CIR": {
		return evaluateProgram(doc as never, registry, defs);
	}

	case "EIR": {
		const effects = buildEffectRegistry(example);
		const { result } = evaluateEIR(doc as never, registry, defs, undefined, {
			effects,
		});
		return result;
	}

	case "PIR": {
		const effects = buildEffectRegistry(example);
		const asyncEval = new AsyncEvaluator(registry, defs, effects);
		return asyncEval.evaluateDocument(doc as never);
	}

	case "LIR": {
		const effects = buildEffectRegistry(example);
		const isAsync = JSON.stringify(doc).includes('"kind":"fork"') ||
				JSON.stringify(doc).includes('"kind": "fork"');
		if (isAsync) {
			const { result } = await evaluateLIRAsync(
					doc as never,
					registry,
					effects,
					emptyValueEnv(),
					undefined,
					defs,
			);
			return result;
		}
		const { result } = evaluateLIR(
				doc as never,
				registry,
				effects,
				emptyValueEnv(),
				undefined,
				defs,
		);
		return result;
	}
	}
}

//==============================================================================
// Value Conversion: raw expected_result -> Value
//==============================================================================

function rawToValue(raw: unknown): Value {
	if (raw === null || raw === undefined) {
		return { kind: "void" };
	}

	// Already a Value object (has kind field)
	if (typeof raw === "object" && !Array.isArray(raw) && "kind" in (raw as Record<string, unknown>)) {
		return raw as Value;
	}

	if (typeof raw === "boolean") {
		return { kind: "bool", value: raw };
	}

	if (typeof raw === "number") {
		return Number.isInteger(raw)
			? { kind: "int", value: raw }
			: { kind: "float", value: raw };
	}

	if (typeof raw === "string") {
		return { kind: "string", value: raw };
	}

	if (Array.isArray(raw)) {
		return { kind: "list", value: raw.map(rawToValue) };
	}

	throw new Error(`Cannot convert raw value to Value: ${JSON.stringify(raw)}`);
}

//==============================================================================
// Value Comparison
//==============================================================================

function valuesEqual(actual: Value, expected: Value): boolean {
	if (actual.kind !== expected.kind) return false;

	switch (actual.kind) {
	case "int":
	case "bool":
	case "string":
		return (actual as { value: unknown }).value === (expected as { value: unknown }).value;
	case "float": {
		const a = (actual as { value: number }).value;
		const e = (expected as { value: number }).value;
		return Math.abs(a - e) < 1e-9;
	}
	case "void":
		return true;
	case "list": {
		const aList = (actual as { value: Value[] }).value;
		const eList = (expected as { value: Value[] }).value;
		if (aList.length !== eList.length) return false;
		return aList.every((v, i) => valuesEqual(v, eList[i]!));
	}
	case "set": {
		// Set values can be Set<string> or Value[]
		const aRaw = (actual as { value: unknown }).value;
		const eRaw = (expected as { value: unknown }).value;
		const aItems = aRaw instanceof Set ? Array.from(aRaw) : (aRaw as Value[]);
		const eItems = eRaw instanceof Set ? Array.from(eRaw) : (eRaw as Value[]);
		if (aItems.length !== eItems.length) return false;
		const aStrs = new Set(aItems.map((v: unknown) => JSON.stringify(v)));
		return eItems.every((v: unknown) => aStrs.has(JSON.stringify(v)));
	}
	case "error": {
		const aErr = actual as { code: string };
		const eErr = expected as { code: string };
		return aErr.code === eErr.code;
	}
	case "selectResult": {
		const aSR = actual as { index: number; value: Value };
		const eSR = expected as { index: number; value: Value };
		return aSR.index === eSR.index && valuesEqual(aSR.value, eSR.value);
	}
	default:
		return JSON.stringify(actual) === JSON.stringify(expected);
	}
}

//==============================================================================
// Test Suite
//==============================================================================

const examples = discoverExamples();

describe("Example Auto-Discovery", () => {
	it(`discovered ${examples.length} examples`, () => {
		assert.ok(examples.length > 0, "Should discover at least one example");
	});

	const withExpected = examples.filter((e) => e.hasExpectedResult);
	it(`${withExpected.length}/${examples.length} examples have expected_result`, () => {
		assert.ok(
			withExpected.length > 0,
			"At least some examples should have expected_result",
		);
	});
});

// Examples with pre-existing evaluation issues (evaluator doesn't support these constructs yet)
const KNOWN_EVALUATION_ISSUES = new Set([
	"examples/pir/io/parallel-http.pir.json", // select requires Future values not yet produced by evaluator
	"examples/lir/async/fork-join.lir.json", // fork terminator not implemented in LIR evaluator
]);

describe("Example Validation", () => {
	for (const example of examples) {
		it(`validates ${example.relativePath}`, () => {
			const validate = getValidator(example.layer);
			const result = validate(example.doc);
			assert.ok(
				result.valid,
				`Validation failed for ${example.relativePath}:\n${result.errors
					.map((e) => `  ${e.path}: ${e.message}`)
					.join("\n")}`,
			);
		});
	}
});

describe("Example Evaluation", () => {
	const evaluable = examples.filter((e) => {
		if (!e.hasExpectedResult) return false;
		const validate = getValidator(e.layer);
		return validate(e.doc).valid;
	});

	for (const example of evaluable) {
		const isKnownIssue = KNOWN_EVALUATION_ISSUES.has(example.relativePath);
		it(`evaluates ${example.relativePath} -> ${JSON.stringify(example.expectedResult)}`, { skip: isKnownIssue }, async () => {
			const actual = await executeExample(example);
			const expected = rawToValue(example.expectedResult);

			assert.ok(
				valuesEqual(actual, expected),
				`Result mismatch for ${example.relativePath}:\n` +
					`  Expected: ${JSON.stringify(expected)}\n` +
					`  Actual:   ${JSON.stringify(actual)}`,
			);
		});
	}
});
