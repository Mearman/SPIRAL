// SPDX-License-Identifier: MIT
// Transpilation Pipeline for $imports to $defs
//
// This module transforms the user-facing $imports object syntax into pure
// JSON Schema $defs with $ref. The transpilation rule is:
//   $imports: { namespace: { $ref: uri } }  -->  $defs: { namespace: { $ref: uri#/$defs } }
//
// This maintains ergonomics (short, namespace-based imports) while ensuring
// the transpiled form is 100% compliant with JSON Schema.

import type { AIRDocument, CIRDocument, EIRDocument, LIRDocument } from "../types.ts";
import type { ImportsObject } from "../types/resolution.ts";

//==============================================================================
// Types
//==============================================================================

/** Any SPIRAL document type that can have $imports */
type SPIRALDocument = AIRDocument | CIRDocument | EIRDocument | LIRDocument;

/** Document with optional $imports field - use intersection type */
type DocumentWithImports = SPIRALDocument & { $imports?: ImportsObject };

/** Transpiled $defs entry - a reference to external document's $defs */
interface TranspiledDefEntry {
	$ref: string;
}

/** Transpiled $defs object - maps namespace to reference entry */
type TranspiledDefsObject = Record<string, TranspiledDefEntry>;

/** Any defs object type (from existing documents) */
type AnyDefsObject = Record<string, unknown>;

//==============================================================================
// Transpilation
//==============================================================================

/**
 * Transpile $imports object to $defs with $ref#/$defs.
 *
 * Each entry in $imports:
 *   { namespace: { $ref: uri } }
 *
 * Becomes a $def entry:
 *   { namespace: { $ref: uri#/$defs } }
 *
 * The #/$defs suffix is appended to each URI to reference the $defs
 * object at the root of the imported document.
 *
 * @param doc - The document to transpile
 * @returns The transpiled document with $defs (no $imports)
 */
export function transpileImports<T extends SPIRALDocument>(doc: T): T {
	// Type assertion: doc as DocumentWithImports for accessing $imports
	const docWithImports = doc as unknown as DocumentWithImports;

	// If no $imports, return document unchanged
	if (!docWithImports.$imports || Object.keys(docWithImports.$imports).length === 0) {
		return doc;
	}

	// Merge existing $defs with transpiled $imports
	const existingDefs = (doc as unknown as { $defs?: AnyDefsObject }).$defs ?? {};
	const transpiledDefs = transpileImportsToDefs(docWithImports.$imports);
	const mergedDefs = { ...existingDefs, ...transpiledDefs };

	// Create new document without $imports property
	// Destructure to exclude $imports, then add $defs
	const { $imports, ...rest } = doc as unknown as { $imports?: ImportsObject; [key: string]: unknown };
	return {
		...rest,
		$defs: mergedDefs,
	} as T;
}

/**
 * Convert $imports object to $defs object with #/$defs appended.
 *
 * Each import entry:
 *   { namespace: { $ref: uri } }
 *
 * Becomes:
 *   { namespace: { $ref: uri#/$defs } }
 *
 * @param imports - The $imports object to transpile
 * @returns The transpiled $defs object
 */
function transpileImportsToDefs(imports: ImportsObject): TranspiledDefsObject {
	const defs: TranspiledDefsObject = {};

	for (const [namespace, entry] of Object.entries(imports)) {
		const uri = entry.$ref;

		// Append #/$defs to the URI to reference the $defs object
		// Handle URIs that already have a fragment
		let refUri: string;
		if (uri.includes("#")) {
			// URI already has a fragment - replace it with #/$defs
			const baseUri = uri.split("#")[0] ?? uri;
			refUri = `${baseUri}#/$defs`;
		} else {
			// No fragment - append #/$defs
			refUri = `${uri}#/$defs`;
		}

		defs[namespace] = { $ref: refUri };
	}

	return defs;
}
