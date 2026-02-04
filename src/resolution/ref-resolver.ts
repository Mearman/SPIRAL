// SPDX-License-Identifier: MIT
// RFC 6901 JSON Pointer Reference Resolution
//
// This module implements full URI reference resolution for SPIRAL documents.
// Supports:
// - Local references: #/$defs/foo/expr
// - File references: file:///path/to/doc.cir.json#/$defs/bar/expr
// - HTTP references: https://example.com/doc.cir.json#/$defs/baz/expr
// - Custom schemes: stdlib:core-types#/$defs/optionType/expr

import { navigate } from "../utils/json-pointer.ts";
import type { Result } from "../utils/json-pointer.ts";
import type { ResolutionContext } from "../types/resolution.ts";

//==============================================================================
// Resolution Errors
//==============================================================================

/** Error thrown when reference resolution fails */
export class ResolutionError extends Error {
	constructor(message: string, public override cause?: unknown) {
		super(message);
		this.name = "ResolutionError";
	}
}

/** Error thrown when circular references are detected */
export class CircularReferenceError extends ResolutionError {
	constructor(public readonly path: string[]) {
		super(`Circular reference detected: ${path.join(" -> ")}`);
		this.name = "CircularReferenceError";
	}
}

//==============================================================================
// Resolution Context
//==============================================================================

/** Create a new resolution context with defaults */
export function createResolutionContext(baseUri: string): ResolutionContext {
	return {
		baseUri,
		documentCache: new Map<string, unknown>(),
		resolutionStack: [],
		maxDepth: 10,
		currentDepth: 0,
	};
}

//==============================================================================
// URI Parsing
//==============================================================================

interface ParsedURI {
	scheme: string;
	path: string;
	fragment?: string | undefined;
}

/** Parse a URI into scheme, path, and optional fragment */
function parseURI(uri: string): ParsedURI {
	// Handle JSON Pointer fragments (starts with #)
	if (uri.startsWith("#")) {
		return { scheme: "local", path: "", fragment: uri };
	}

	// Find fragment separator
	const fragmentIndex = uri.indexOf("#");
	const fragment = fragmentIndex >= 0 ? uri.slice(fragmentIndex) : undefined;
	const withoutFragment = fragmentIndex >= 0 ? uri.slice(0, fragmentIndex) : uri;

	// Find scheme separator (:)
	const schemeIndex = withoutFragment.indexOf(":");
	if (schemeIndex >= 0) {
		return {
			scheme: withoutFragment.slice(0, schemeIndex),
			path: withoutFragment.slice(schemeIndex + 1),
			fragment,
		};
	}

	// No scheme - treat as local file path
	return { scheme: "file", path: withoutFragment, fragment };
}

//==============================================================================
// Document Loading
//==============================================================================

/** Load a document from a URI */
async function loadDocument(
	uri: string,
	ctx: ResolutionContext,
): Promise<unknown> {
	// Check cache first
	const cached = ctx.documentCache.get(uri);
	if (cached !== undefined) {
		return cached;
	}

	// Check depth limit
	if (ctx.currentDepth >= ctx.maxDepth) {
		throw new ResolutionError(
			`Maximum import depth exceeded (limit: ${ctx.maxDepth}). Possible circular import.`,
		);
	}

	// Parse URI to determine loading strategy
	const parsed = parseURI(uri);

	let document: unknown;

	switch (parsed.scheme) {
		case "local":
		case "":
			// Local reference - should be resolved by navigate, not loadDocument
			throw new ResolutionError(`Cannot load local reference as document: ${uri}`);

		case "file":
			// Load from file system
			document = await loadFileDocument(parsed.path);
			break;

		case "http":
		case "https":
			// Load from HTTP/HTTPS
			document = await loadHTTPDocument(uri);
			break;

		case "stdlib":
			// Load from stdlib (custom scheme)
			document = await loadStdlibDocument(parsed.path);
			break;

		default:
			throw new ResolutionError(`Unsupported URI scheme: ${parsed.scheme}`);
	}

	// Cache the document
	ctx.documentCache.set(uri, document);

	return document;
}

/** Load a document from the file system */
async function loadFileDocument(path: string): Promise<unknown> {
	// Use fetch for file:// URLs (Node.js 18+ supports this)
	try {
		const response = await fetch(`file://${path}`);
		if (!response.ok) {
			throw new ResolutionError(`Failed to load file://${path}: ${response.statusText}`);
		}
		return await response.json();
	} catch {
		throw new ResolutionError(`Failed to load file://${path}`);
	}
}

/** Load a document from HTTP/HTTPS */
async function loadHTTPDocument(uri: string): Promise<unknown> {
	try {
		const response = await fetch(uri);
		if (!response.ok) {
			throw new ResolutionError(`Failed to load ${uri}: ${response.statusText}`);
		}
		return await response.json();
	} catch {
		throw new ResolutionError(`Failed to load ${uri}`);
	}
}

/** Load a document from the stdlib (custom scheme) */
async function loadStdlibDocument(path: string): Promise<unknown> {
	// stdlib: URIs map to files in the stdlib directory
	// For now, we'll use a simple mapping: stdlib:name -> ./stdlib/name.cir.json
	// In a real implementation, this would be configurable
	try {
		const response = await fetch(`file://${process.cwd()}/stdlib/${path}.cir.json`);
		if (!response.ok) {
			throw new ResolutionError(`Failed to load stdlib:${path}: ${response.statusText}`);
		}
		return await response.json();
	} catch {
		throw new ResolutionError(`Failed to load stdlib:${path}`);
	}
}

//==============================================================================
// Reference Resolution
//==============================================================================

/**
 * Resolve a $ref URI to its target value.
 *
 * @param ref - The $ref URI to resolve
 * @param ctx - The resolution context
 * @returns The resolved value
 * @throws ResolutionError if resolution fails
 */
export async function resolveRef(
	ref: string,
	ctx: ResolutionContext,
): Promise<unknown> {
	// Check for circular references
	if (ctx.resolutionStack.includes(ref)) {
		throw new CircularReferenceError([...ctx.resolutionStack, ref]);
	}

	// Parse the reference URI
	const parsed = parseURI(ref);

	// If it's a local reference (no scheme or starts with #), use navigate on docRoot
	if (parsed.scheme === "local" || parsed.scheme === "") {
		// Local reference - navigate from the base document
		const docRoot = ctx.documentCache.get(ctx.baseUri);
		if (!docRoot) {
			throw new ResolutionError(`Base document not loaded: ${ctx.baseUri}`);
		}

		const result = navigate(docRoot, ref);
		if (!result.success) {
			throw new ResolutionError(`JSON Pointer resolution failed: ${result.error}`);
		}

		return result.value;
	}

	// External reference - load document and navigate
	const loadURI = parsed.fragment ? ref.slice(0, ref.indexOf("#")) : ref;
	const fragment = parsed.fragment ?? "";

	// Increment depth for external references
	const childCtx: ResolutionContext = {
		...ctx,
		currentDepth: ctx.currentDepth + 1,
		resolutionStack: [...ctx.resolutionStack, ref],
	};

	// Load the external document
	const doc = await loadDocument(loadURI, childCtx);

	// If there's a fragment, navigate within the loaded document
	if (fragment) {
		// Cache the loaded document for fragment resolution
		childCtx.documentCache.set(loadURI, doc);

		const result = navigate(doc, fragment);
		if (!result.success) {
			throw new ResolutionError(`JSON Pointer resolution failed: ${result.error}`);
		}

		return result.value;
	}

	// No fragment - return the entire document
	return doc;
}

//==============================================================================
// Result Type Helpers
//==============================================================================

/** Create a successful result */
export function successResult<T>(value: T): Result<T> {
	return { success: true, value };
}

/** Create a failed result */
export function errorResult(error: string): Result<never> {
	return { success: false, error };
}
