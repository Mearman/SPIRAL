/* eslint-disable no-undef */
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
} from "../src/zod-schemas.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

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
	const jsonSchema = z.toJSONSchema(layer.schema, { target: "draft-2020-12" });

	// Add metadata to match existing conventions
	const output = {
		$schema: jsonSchema.$schema,
		$id: `https://raw.githubusercontent.com/Mearman/SPIRAL/refs/heads/main/${layer.name}.schema.json`,
		title: layer.title,
		...jsonSchema,
	};

	const filePath = resolve(repoRoot, `${layer.name}.schema.json`);
	writeFileSync(filePath, JSON.stringify(output, null, 2) + "\n");
	console.log(`Generated ${layer.name}.schema.json`);
}
