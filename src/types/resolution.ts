// SPIRAL Reference Resolution Types
// Types for JSON Pointer-based reference resolution and import system

//==============================================================================
// Resolution Context
//==============================================================================

/**
 * Context for resolving $ref references across documents
 */
export interface ResolutionContext {
	/** Base URI for resolving relative references */
	baseUri: string;
	/** Cache of loaded documents to avoid redundant fetches */
	documentCache: Map<string, unknown>;
	/** Stack of currently resolving URIs for cycle detection */
	resolutionStack: string[];
	/** Maximum depth for import resolution (prevents infinite recursion) */
	maxDepth: number;
	/** Current resolution depth */
	currentDepth: number;
}

/**
 * Create a new resolution context with default values
 */
export function createResolutionContext(baseUri = ""): ResolutionContext {
	return {
		baseUri,
		documentCache: new Map(),
		resolutionStack: [],
		maxDepth: 10,
		currentDepth: 0,
	};
}

//==============================================================================
// Import Entry Types
//==============================================================================

/**
 * Single entry in $imports object
 */
export interface ImportEntry {
	/** URI of the document to import */
	$ref: string;
}

/**
 * $imports object - maps namespace to import entry
 * Each key becomes a namespace under $defs after transpilation
 */
export type ImportsObject = Record<string, ImportEntry>;

//==============================================================================
// Reference Types
//==============================================================================

/**
 * A JSON Pointer reference expression
 * Can reference local or external definitions
 */
export interface RefExpr {
	/** Kind discriminator for JSON Pointer reference */
	kind: "$ref";
	/** JSON Pointer URI (may include fragment) */
	$ref: string;
}

/**
 * Reference to an entire node (for node-level aliasing)
 */
export interface NodeRef {
	/** Reference to another node by JSON Pointer */
	$ref: string;
}

//==============================================================================
// Resolved Definition
//==============================================================================

/**
 * A successfully resolved definition from a $ref
 */
export interface ResolvedDefinition {
	/** The URI that was resolved */
	uri: string;
	/** The resolved value (expression, node, or type) */
	value: unknown;
	/** Source document URI (for external refs) */
	sourceUri?: string;
	/** Whether this is a local reference (same document) */
	isLocal: boolean;
}

/**
 * Resolution error details
 */
export interface ResolutionError {
	/** Error code */
	code: ResolutionErrorCode;
	/** Human-readable error message */
	message: string;
	/** The reference that failed to resolve */
	reference: string;
	/** Source document URI */
	sourceUri?: string;
	/** Suggested fixes (when available) */
	suggestions?: string[];
}

/**
 * Error codes for reference resolution
 */
export type ResolutionErrorCode =
	| "INVALID_POINTER"
	| "POINTER_NOT_FOUND"
	| "CIRCULAR_REFERENCE"
	| "IMPORT_DEPTH_EXCEEDED"
	| "IMPORT_LOAD_FAILED"
	| "INVALID_IMPORT_URI"
	| "MISSING_IMPORT_NAMESPACE";

//==============================================================================
// Transpilation Types
//==============================================================================

/**
 * Transpilation result from $imports to pure $defs
 */
export interface TranspilationResult {
	/** The transpiled document */
	document: unknown;
	/** Number of imports transpiled */
	importCount: number;
	/** Namespaces that were transpiled */
	namespaces: string[];
}

//==============================================================================
// Definition Types (for $defs)
//==============================================================================

/**
 * A definition in $defs - can be an expression or a node
 */
export interface Definition {
	/** Optional: definition is an expression */
	expr?: unknown;
	/** Optional: definition is a node */
	node?: unknown;
	/** Optional: definition is a type */
	type?: unknown;
}

/**
 * $defs object - maps definition names to their content
 */
export type DefsObject = Record<string, Definition>;

//==============================================================================
// JSON Pointer Parts
//==============================================================================

/**
 * Parsed JSON Pointer with URI and fragment
 */
export interface ParsedRef {
	/** Full URI including fragment */
	fullUri: string;
	/** Base document URI (without fragment) */
	docUri: string;
	/** Fragment identifier (JSON Pointer without #) */
	fragment: string;
	/** Whether this is a local reference (same document) */
	isLocal: boolean;
}

/**
 * Parse a reference URI into its components
 */
export function parseRef(ref: string, baseUri = ""): ParsedRef {
	const hashIndex = ref.indexOf("#");
	const fragment = hashIndex >= 0 ? ref.slice(hashIndex) : "#";

	// Resolve base URI
	let docUri: string;
	if (hashIndex >= 0) {
		docUri = ref.slice(0, hashIndex);
	} else {
		docUri = ref;
	}

	// Empty docUri means local reference
	const isLocal = docUri === "" || docUri === baseUri;

	// If docUri is relative and not empty, resolve against base
	if (!isLocal && docUri && !isAbsoluteUri(docUri)) {
		docUri = resolveUri(baseUri, docUri);
	}

	return {
		fullUri: ref,
		docUri,
		fragment,
		isLocal,
	};
}

/**
 * Check if a URI is absolute (has a scheme)
 */
function isAbsoluteUri(uri: string): boolean {
	return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(uri);
}

/**
 * Resolve a relative URI against a base URI
 * Simple implementation for file:// and stdlib: schemes
 */
function resolveUri(base: string, relative: string): string {
	if (!base) return relative;

	// If relative is already absolute, return as-is
	if (isAbsoluteUri(relative)) return relative;

	// Handle stdlib: scheme
	if (relative.startsWith("stdlib:")) return relative;
	if (base.startsWith("stdlib:")) {
		return base.includes("/") ? base : base + "/" + relative;
	}

	// Simple path resolution for file:// URIs
	if (base.startsWith("file://")) {
		const basePath = base.replace(/^file:\/\//, "");
		const relativePath = relative.replace(/^file:\/\//, "");
		const baseDir = basePath.includes("/")
			? basePath.substring(0, basePath.lastIndexOf("/"))
			: "";
		return "file://" + (baseDir ? baseDir + "/" : "") + relativePath;
	}

	// For http/https, join paths
	if (base.startsWith("http://") || base.startsWith("https://")) {
		const baseUrl = new URL(base);
		const baseDir = baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf("/"));
		return baseUrl.origin + (baseDir ? baseDir + "/" : "") + relative;
	}

	return relative;
}
