// SPIRAL JSON Schemas
// Generated from Zod schemas via z.toJSONSchema()

import { z } from "zod/v4";
import {
	AIRDocumentSchema,
	CIRDocumentSchema,
	EIRDocumentSchema,
	LIRDocumentSchema,
} from "./zod-schemas.js";

//==============================================================================
// Generated JSON Schemas
//==============================================================================

export const airSchema = z.toJSONSchema(AIRDocumentSchema, { target: "draft-07" });
export const cirSchema = z.toJSONSchema(CIRDocumentSchema, { target: "draft-07" });
export const eirSchema = z.toJSONSchema(EIRDocumentSchema, { target: "draft-07" });
export const lirSchema = z.toJSONSchema(LIRDocumentSchema, { target: "draft-07" });

//==============================================================================
// Schema Type Guards
//==============================================================================

function isSchemaWithDescription(obj: unknown, description: string): obj is Record<string, unknown> {
	return typeof obj === "object" && obj !== null && "$schema" in obj && "description" in obj && obj.description === description;
}

export function isAIRSchema(obj: unknown): obj is Record<string, unknown> {
	return isSchemaWithDescription(obj, "AIRDocument");
}

export function isCIRSchema(obj: unknown): obj is Record<string, unknown> {
	return isSchemaWithDescription(obj, "CIRDocument");
}

export function isEIRSchema(obj: unknown): obj is Record<string, unknown> {
	return isSchemaWithDescription(obj, "EIRDocument");
}

export function isLIRSchema(obj: unknown): obj is Record<string, unknown> {
	return isSchemaWithDescription(obj, "LIRDocument");
}
