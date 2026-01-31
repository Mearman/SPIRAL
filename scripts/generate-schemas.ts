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

function writeSchema(name: string, schema: Record<string, unknown>): void {
	const filePath = resolve(repoRoot, `${name}.schema.json`);
	writeFileSync(filePath, JSON.stringify(schema, null, 2) + "\n");
	console.log(`Generated ${name}.schema.json`);
}

// --- Phase 1: Generate spiral.schema.json (the authority for shared $defs) ---

const spiralSchema = generateSchema(SPIRALDocument, "spiral", "SPIRAL Document");
writeSchema("spiral", spiralSchema);

const spiralDefs = (spiralSchema.$defs ?? {}) as Record<
	string,
	unknown
>;

// --- Phase 2: Generate layer schemas with $defs deduplication ---

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

for (const layer of layers) {
	const output = generateSchema(layer.schema, layer.name, layer.title);

	const localDefs = (output.$defs ?? {}) as Record<string, unknown>;
	const externalizedKeys = new Set<string>();

	// Find $defs entries identical to spiral.schema.json's
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
