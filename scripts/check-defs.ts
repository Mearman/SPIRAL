// Check $defs overlap between SPIRAL and per-layer JSON Schemas
// Usage: tsx scripts/check-defs.ts

import { z } from "zod/v4";
import type { ZodType } from "zod/v4";
import {
	AIRDocumentSchema,
	CIRDocumentSchema,
	EIRDocumentSchema,
	LIRDocumentSchema,
	SPIRALDocument,
} from "../src/zod-schemas.js";

const spiralJs = z.toJSONSchema(SPIRALDocument, { target: "draft-2020-12" });
const spiralDefs = new Set(Object.keys((spiralJs as Record<string, unknown>).$defs as Record<string, unknown> ?? {}));

console.log("SPIRAL $defs (" + spiralDefs.size + "):", [...spiralDefs].sort().join(", "));
console.log("");

const layers: [string, ZodType][] = [
	["AIR", AIRDocumentSchema],
	["CIR", CIRDocumentSchema],
	["EIR", EIRDocumentSchema],
	["LIR", LIRDocumentSchema],
];

for (const [name, schema] of layers) {
	const js = z.toJSONSchema(schema, { target: "draft-2020-12" });
	const layerDefs = Object.keys((js as Record<string, unknown>).$defs as Record<string, unknown> ?? {});
	const unique = layerDefs.filter(k => !spiralDefs.has(k));
	const notUsed = [...spiralDefs].filter(k => !layerDefs.includes(k));
	console.log(name + ": " + layerDefs.length + " $defs | " + (layerDefs.length - unique.length) + " shared | " + unique.length + " unique");
	if (unique.length) console.log("  unique:", unique.join(", "));
	if (notUsed.length) console.log("  not present:", notUsed.join(", "));
}
