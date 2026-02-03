// SPIRAL JSON Pointer Utilities
// RFC 6901 compliant JSON Pointer implementation for document deduplication
// See: https://www.rfc-editor.org/rfc/rfc6901.html

//==============================================================================
// Types
//==============================================================================

/**
 * A parsed JSON Pointer with decoded segments
 */
export interface ParsedPointer {
	/** The original pointer string */
	original: string;
	/** Decoded reference tokens (after ~1 and ~0 unescaping) */
	tokens: string[];
}

/**
 * Result type for fallible operations
 */
export type Result<T> =
	| { success: true; value: T }
	| { success: false; error: string };

//==============================================================================
// Constants
//==============================================================================

/** Empty string represents the root document in JSON Pointer */
const ROOT_POINTER = "";

/** Prefix for JSON Pointer fragment identifiers */
const FRAGMENT_PREFIX = "#";

//==============================================================================
// JSON Pointer Escaping (RFC 6901)
//==============================================================================

/**
 * Escape a reference token for use in a JSON Pointer
 * Replaces: ~ → ~0, / → ~1
 */
export function escapeToken(token: string): string {
	return token.replace(/~/g, "~0").replace(/\//g, "~1");
}

/**
 * Unescape a reference token from a JSON Pointer
 * Replaces: ~0 → ~, ~1 → /
 */
export function unescapeToken(token: string): string {
	return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

//==============================================================================
// JSON Pointer Parsing
//==============================================================================

/**
 * Parse a JSON Pointer string into its component tokens
 *
 * @param ptr - The JSON Pointer string (with or without # prefix)
 * @returns Result with parsed tokens or error message
 *
 * @example
 * parseJsonPointer("#/foo/bar") // { success: true, tokens: ["foo", "bar"] }
 * parseJsonPointer("#/foo~1baz") // { success: true, tokens: ["foo/baz"] }
 * parseJsonPointer("#") // { success: true, tokens: [] }
 */
export function parseJsonPointer(ptr: string): Result<ParsedPointer> {
	// Remove fragment prefix if present
	let workingPtr = ptr;
	if (workingPtr.startsWith(FRAGMENT_PREFIX)) {
		workingPtr = workingPtr.slice(1);
	}

	// Empty string or just "#" means root document
	if (workingPtr === "" || workingPtr === ROOT_POINTER) {
		return {
			success: true,
			value: { original: ptr, tokens: [] },
		};
	}

	// Must start with /
	if (!workingPtr.startsWith("/")) {
		return {
			success: false,
			error: `Invalid JSON Pointer "${ptr}": must start with "/" or "#"`,
		};
	}

	// Split by / and unescape each token
	const rawTokens = workingPtr.split("/");
	const tokens: string[] = [];

	// First token is empty due to leading /
	for (let i = 1; i < rawTokens.length; i++) {
		const token = unescapeToken(rawTokens[i]);
		tokens.push(token);
	}

	return {
		success: true,
		value: { original: ptr, tokens },
	};
}

/**
 * Check if a string is a valid JSON Pointer
 *
 * @param ptr - The string to validate
 * @returns true if the pointer is syntactically valid
 */
export function isValidJsonPointer(ptr: string): boolean {
	const result = parseJsonPointer(ptr);
	return result.success;
}

//==============================================================================
// Helper Functions for Navigation
//==============================================================================

/**
 * Navigate array index safely
 */
function navigateArray(
	arr: unknown[],
	token: string,
	pointer: string,
): Result<unknown> {
	const index = parseInt(token, 10);
	if (isNaN(index)) {
		return {
			success: false,
			error: `Invalid array index "${token}" in pointer "${pointer}"`,
		};
	}
	if (index < 0 || index >= arr.length) {
		return {
			success: false,
			error: `Array index ${index} out of bounds [0, ${arr.length}) in pointer "${pointer}"`,
		};
	}
	return { success: true, value: arr[index] };
}

/**
 * Check if value is a plain object
 */
function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Navigate object property safely
 */
function navigateObject(
	obj: Record<string, unknown>,
	token: string,
	pointer: string,
): Result<unknown> {
	if (!(token in obj)) {
		return {
			success: false,
			error: `Property "${token}" not found in pointer "${pointer}"`,
		};
	}
	return { success: true, value: obj[token] };
}

/**
 * Navigate a single token in a value
 */
function navigateToken(
	current: unknown,
	token: string,
	pointer: string,
): Result<unknown> {
	if (Array.isArray(current)) {
		return navigateArray(current, token, pointer);
	}
	if (isObject(current)) {
		return navigateObject(current, token, pointer);
	}
	return {
		success: false,
		error: `Cannot navigate into primitive value at token "${token}" in pointer "${pointer}"`,
	};
}

//==============================================================================
// JSON Pointer Navigation
//==============================================================================

/**
 * Navigate through an object using a JSON Pointer
 *
 * @param obj - The root object to navigate
 * @param pointer - The JSON Pointer string
 * @returns Result with the found value or error message
 *
 * @example
 * const obj = { foo: { bar: 42 } };
 * navigate(obj, "#/foo/bar") // { success: true, value: 42 }
 * navigate(obj, "#/foo/baz") // { success: false, error: "..." }
 */
export function navigate(obj: unknown, pointer: string): Result<unknown> {
	const parseResult = parseJsonPointer(pointer);
	if (!parseResult.success) {
		return parseResult;
	}

	const { tokens } = parseResult.value;
	let current: unknown = obj;

	for (const token of tokens) {
		const result = navigateToken(current, token, pointer);
		if (!result.success) {
			return result;
		}
		current = result.value;
	}

	return { success: true, value: current };
}

/**
 * Get property value from parent object/array
 */
function getPropertyValue(
	parent: unknown,
	finalKey: string,
	pointer: string,
): Result<unknown> {
	if (Array.isArray(parent)) {
		const index = parseInt(finalKey, 10);
		if (isNaN(index) || index < 0 || index >= parent.length) {
			return {
				success: false,
				error: `Array index ${index} out of bounds in pointer "${pointer}"`,
			};
		}
		return { success: true, value: parent[index] };
	}
	if (isObject(parent)) {
		if (!(finalKey in parent)) {
			return {
				success: false,
				error: `Property "${finalKey}" not found in pointer "${pointer}"`,
			};
		}
		return { success: true, value: parent[finalKey] };
	}
	return {
		success: false,
		error: `Parent is not an object or array in pointer "${pointer}"`,
	};
}

/**
 * Navigate to a parent location and return both parent and final key
 *
 * @param obj - The root object to navigate
 * @param pointer - The JSON Pointer string
 * @returns Result with parent object, final key, and value, or error
 *
 * @example
 * const obj = { foo: { bar: 42 } };
 * navigateWithParent(obj, "#/foo/bar")
 * // { success: true, parent: { bar: 42 }, key: "bar", value: 42 }
 */
export function navigateWithParent(
	obj: unknown,
	pointer: string,
): Result<{ parent: Record<string, unknown> | unknown[]; key: string; value: unknown }> {
	const parseResult = parseJsonPointer(pointer);
	if (!parseResult.success) {
		return parseResult;
	}

	const { tokens } = parseResult.value;

	// Root pointer has no parent
	if (tokens.length === 0) {
		return {
			success: false,
			error: `Cannot get parent of root pointer "${pointer}"`,
		};
	}

	// Navigate to parent (all but last token)
	const parentTokens = tokens.slice(0, -1);
	const parentPointer = `#/${parentTokens.map(escapeToken).join("/")}`;
	const parentResult = navigate(obj, parentPointer);
	if (!parentResult.success) {
		return parentResult;
	}

	const parent = parentResult.value;
	const finalKey = tokens[tokens.length - 1];

	// Verify parent is valid type (object or array) and get its value
	if (Array.isArray(parent)) {
		const valueResult = getPropertyValue(parent, finalKey, pointer);
		if (!valueResult.success) {
			return valueResult;
		}
		return {
			success: true,
			value: { parent, key: finalKey, value: valueResult.value },
		};
	}

	if (isObject(parent)) {
		const valueResult = getPropertyValue(parent, finalKey, pointer);
		if (!valueResult.success) {
			return valueResult;
		}
		return {
			success: true,
			value: { parent, key: finalKey, value: valueResult.value },
		};
	}

	return {
		success: false,
		error: `Parent is not an object or array in pointer "${pointer}"`,
	};
}

//==============================================================================
// Utility Functions
//==============================================================================

/**
 * Build a JSON Pointer string from tokens
 *
 * @param tokens - Array of unescaped tokens
 * @param includePrefix - Whether to include the # prefix (default: true)
 * @returns A valid JSON Pointer string
 *
 * @example
 * buildPointer(["foo", "bar"]) // "#/foo/bar"
 * buildPointer(["foo", "bar baz"]) // "#/foo/bar~1baz"
 * buildPointer(["foo", "bar"], false) // "/foo/bar"
 */
export function buildPointer(tokens: string[], includePrefix = true): string {
	const escaped = tokens.map(escapeToken);
	const ptr = escaped.length === 0 ? ROOT_POINTER : `/${escaped.join("/")}`;
	return includePrefix ? FRAGMENT_PREFIX + ptr : ptr;
}

/**
 * Join two JSON Pointers
 *
 * @param base - The base pointer
 * @param relative - The relative pointer to append
 * @returns A combined JSON Pointer
 *
 * @example
 * joinPointers("#/foo", "/bar") // "#/foo/bar"
 */
export function joinPointers(base: string, relative: string): string {
	const baseResult = parseJsonPointer(base);
	if (!baseResult.success) {
		return base;
	}

	const relativeResult = parseJsonPointer(relative);
	if (!relativeResult.success) {
		// Return base if relative is invalid
		return base;
	}

	const combinedTokens = [...baseResult.value.tokens, ...relativeResult.value.tokens];
	return buildPointer(combinedTokens);
}

/**
 * Get the parent pointer of a given JSON Pointer
 *
 * @param pointer - The pointer to get the parent of
 * @returns The parent pointer, or root if already at root
 *
 * @example
 * getParentPointer("#/foo/bar") // "#/foo"
 * getParentPointer("#/foo") // "#"
 * getParentPointer("#") // "#"
 */
export function getParentPointer(pointer: string): string {
	const result = parseJsonPointer(pointer);
	if (!result.success) {
		return pointer;
	}

	const { tokens } = result.value;
	if (tokens.length === 0) {
		return FRAGMENT_PREFIX;
	}

	return buildPointer(tokens.slice(0, -1));
}
