// SPIRAL TypeScript Synthesizer
// Translates SPIRAL documents (AIR/CIR/EIR/LIR) to executable TypeScript code

import type {
	AIRDocument, CIRDocument, EIRDocument,
	LIRDocument,
} from "../types.ts";
import type { TypeScriptSynthOptions } from "./ts-synth-shared.ts";
import { synthesizeExprBased } from "./ts-synth-expr.ts";
import { synthesizeLIR } from "./ts-synth-lir.ts";

export type { TypeScriptSynthOptions } from "./ts-synth-shared.ts";

type Document = AIRDocument | CIRDocument | EIRDocument | LIRDocument;

/**
 * Type guard: checks whether a Document is a LIR document
 * by verifying it has nodes with block structure.
 */
function isLIRDocument(doc: Document): doc is LIRDocument {
	return "nodes" in doc && doc.nodes.some((n) => "blocks" in n && "entry" in n);
}

/**
 * Type guard: checks whether a Document is an expression-based document (AIR/CIR/EIR).
 */
function isExprBasedDocument(doc: Document): doc is AIRDocument | CIRDocument | EIRDocument {
	return "nodes" in doc && doc.nodes.some((n) => "expr" in n);
}

/**
 * Main entry point for TypeScript synthesis
 */
export function synthesizeTypeScript(doc: Document, opts: TypeScriptSynthOptions = {}): string {
	const { moduleName = "spiral_generated" } = opts;

	if (isLIRDocument(doc)) {
		return synthesizeLIR(doc, { moduleName, header: opts.header });
	}
	if (isExprBasedDocument(doc)) {
		return synthesizeExprBased(doc, { moduleName, header: opts.header });
	}

	throw new Error("Unrecognized document format");
}
