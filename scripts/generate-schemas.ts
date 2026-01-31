// Generate JSON Schema files from Zod schemas
// Usage: tsx scripts/generate-schemas.ts

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod/v4";
import {
	AIRDocumentSchema,
	CIRDocumentSchema,
	EIRDocumentSchema,
	LIRDocumentSchema,
	SPIRALDocument,
} from "../src/zod-schemas.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// --- Helpers for $defs deduplication ---

/**
 * Recursively rewrite $ref strings in a JSON schema object.
 * Replaces "#/$defs/<key>" with "spiral.schema.json#/$defs/<key>"
 * for each key in the provided set.
 */
function rewriteRefs(
	obj: unknown,
	externalizedKeys: Set<string>,
): unknown {
	if (obj === null || typeof obj !== "object") return obj;

	if (Array.isArray(obj)) {
		return obj.map((item) => rewriteRefs(item, externalizedKeys));
	}

	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
		if (
			key === "$ref" &&
			typeof value === "string" &&
			value.startsWith("#/$defs/")
		) {
			const defName = value.slice("#/$defs/".length);
			if (externalizedKeys.has(defName)) {
				result[key] = `spiral.schema.json${value}`;
				continue;
			}
		}
		result[key] = rewriteRefs(value, externalizedKeys);
	}
	return result;
}

function generateSchema(
	schema: z.ZodType,
	name: string,
	title: string,
): Record<string, unknown> {
	const jsonSchema = z.toJSONSchema(schema, {
		target: "draft-2020-12",
	}) as Record<string, unknown>;

	return {
		$schema: jsonSchema.$schema,
		$id: `https://raw.githubusercontent.com/Mearman/SPIRAL/refs/heads/main/${name}.schema.json`,
		title,
		...jsonSchema,
	};
}

/**
 * JSON Schema key priority order.
 * Mirrors jsonSchemaKeyOrder from eslint.config.ts for *.schema.json files.
 */
const jsonSchemaKeyOrder = [
	"$schema", "$id", "$ref", "$defs",
	"title", "description", "type", "const", "enum", "default",
	"properties", "patternProperties", "additionalProperties", "required",
	"items", "additionalItems", "contains", "minItems", "maxItems", "uniqueItems",
	"oneOf", "anyOf", "allOf", "not", "if", "then", "else", "discriminator",
	"minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
	"minLength", "maxLength", "pattern", "format",
];

/**
 * Sort keys within a JSON Schema object according to the priority rules
 * from eslint.config.ts for *.schema.json files:
 * 1. Objects with "$ref" → "$ref" first, then alphabetical
 * 2. Objects with "type" or any jsonSchemaKeyOrder key → jsonSchemaKeyOrder, then alphabetical
 * 3. Default → alphabetical
 */
function sortObjectKeys(record: Record<string, unknown>): string[] {
	const keys = Object.keys(record);

	let priorityOrder: string[];
	if ("$ref" in record) {
		priorityOrder = ["$ref"];
	} else if ("type" in record || "$schema" in record) {
		priorityOrder = jsonSchemaKeyOrder;
	} else {
		priorityOrder = [];
	}

	const prioritySet = new Set(priorityOrder);
	const priorityKeys = priorityOrder.filter(k => keys.includes(k));
	const remainingKeys = keys.filter(k => !prioritySet.has(k)).sort();
	return [...priorityKeys, ...remainingKeys];
}

/** Recursively sort object keys for deterministic, lint-compliant output. */
function sortKeys(obj: unknown): unknown {
	if (obj === null || typeof obj !== "object") return obj;
	if (Array.isArray(obj)) return obj.map(sortKeys);

	const record = obj as Record<string, unknown>;
	const sorted: Record<string, unknown> = {};
	for (const key of sortObjectKeys(record)) {
		sorted[key] = sortKeys(record[key]);
	}
	return sorted;
}

function writeSchema(name: string, schema: Record<string, unknown>): void {
	const filePath = resolve(repoRoot, `${name}.schema.json`);
	writeFileSync(filePath, JSON.stringify(sortKeys(schema), null, "\t") + "\n");
	console.log(`Generated ${name}.schema.json`);
}

// --- Layer definitions ---

const layers = [
	{
		name: "air",
		title: "AIR (Algebraic IR)",
		schema: AIRDocumentSchema,
	},
	{
		name: "cir",
		title: "CIR (Computational IR)",
		schema: CIRDocumentSchema,
	},
	{
		name: "eir",
		title: "EIR (Execution IR)",
		schema: EIRDocumentSchema,
	},
	{
		name: "lir",
		title: "LIR (Low-Level IR)",
		schema: LIRDocumentSchema,
	},
];

// --- Phase 1: Pre-scan layers to count $defs usage across layers ---

const layerDefUsage = new Map<string, number>();
for (const layer of layers) {
	const schema = z.toJSONSchema(layer.schema, {
		target: "draft-2020-12",
	}) as Record<string, unknown>;
	const defs = (schema.$defs ?? {}) as Record<string, unknown>;
	for (const key of Object.keys(defs)) {
		layerDefUsage.set(key, (layerDefUsage.get(key) ?? 0) + 1);
	}
}

// --- Phase 2: Generate spiral.schema.json, keeping only shared $defs (used by 2+ layers) ---

const spiralSchema = generateSchema(SPIRALDocument, "spiral", "SPIRAL Document");

const spiralDefs = (spiralSchema.$defs ?? {}) as Record<
	string,
	unknown
>;

// Remove layer-unique $defs from spiral.schema.json
const removedFromSpiral: string[] = [];
for (const key of Object.keys(spiralDefs)) {
	if ((layerDefUsage.get(key) ?? 0) < 2) {
		delete spiralDefs[key];
		removedFromSpiral.push(key);
	}
}
if (removedFromSpiral.length > 0) {
	console.log(
		`  Kept layer-unique $defs out of spiral.schema.json: ${removedFromSpiral.join(", ")}`,
	);
}

writeSchema("spiral", spiralSchema);

// --- Phase 3: Generate layer schemas with $defs deduplication ---

for (const layer of layers) {
	const output = generateSchema(layer.schema, layer.name, layer.title);

	const localDefs = (output.$defs ?? {}) as Record<string, unknown>;
	const externalizedKeys = new Set<string>();

	// Find $defs entries identical to spiral.schema.json's (only shared defs remain there)
	for (const [key, value] of Object.entries(localDefs)) {
		if (
			key in spiralDefs &&
			JSON.stringify(value) === JSON.stringify(spiralDefs[key])
		) {
			externalizedKeys.add(key);
		}
	}

	if (externalizedKeys.size > 0) {
		// Remove externalized $defs
		for (const key of externalizedKeys) {
			delete localDefs[key];
		}

		// Remove $defs entirely if empty
		if (Object.keys(localDefs).length === 0) {
			delete output.$defs;
		}

		// Rewrite $ref pointers to point to spiral.schema.json
		const rewritten = rewriteRefs(output, externalizedKeys) as Record<
			string,
			unknown
		>;
		Object.assign(output, rewritten);

		console.log(
			`  Externalized $defs: ${[...externalizedKeys].join(", ")}`,
		);
	}

	writeSchema(layer.name, output);
}
