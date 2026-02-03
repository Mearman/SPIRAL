// SPDX-License-Identifier: MIT
// Enhanced Error Messages for SPIRAL $ref Resolution
//
// This module provides formatted error messages with suggestions for
// common resolution failures, helping users quickly identify and fix issues.

import type { Result } from "../utils/json-pointer.js";

//==============================================================================
// Error Message Formatting
//==============================================================================

/**
 * Format a JSON Pointer resolution error with context and suggestions.
 */
export function formatJsonPointerError(
	ref: string,
	result: Result<never>,
	context: ErrorContext,
): FormattedError {
	const message = result.success ? "" : result.error;

	const baseError: FormattedError = {
		reference: ref,
		message,
		code: "RESOLUTION_FAILED",
		suggestions: [],
	};

	// Provide specific suggestions based on error patterns
	if (message.includes("not found")) {
		baseError.code = "POINTER_NOT_FOUND";
		baseError.suggestions = getSuggestionsForNotFound(ref, context);
	} else if (message.includes("invalid")) {
		baseError.code = "INVALID_POINTER";
		baseError.suggestions = getSuggestionsForInvalidPointer();
	}

	return baseError;
}

/**
 * Format an import resolution error with context.
 */
export function formatImportError(
	uri: string,
	error: string,
	context: ErrorContext,
): FormattedError {
	const baseError: FormattedError = {
		reference: uri,
		message: error,
		code: "IMPORT_LOAD_FAILED",
		suggestions: [],
	};

	// Check for specific error patterns
	if (error.includes("404") || error.includes("not found")) {
		baseError.code = "IMPORT_NOT_FOUND";
		baseError.suggestions = getSuggestionsForImportNotFound(uri, context);
	} else if (error.includes("circular") || error.includes("cycle")) {
		baseError.code = "CIRCULAR_REFERENCE";
		baseError.suggestions = getSuggestionsForCircularReference(context);
	} else if (error.includes("depth")) {
		baseError.code = "MAX_DEPTH_EXCEEDED";
		baseError.suggestions = getSuggestionsForMaxDepth(context);
	}

	return baseError;
}

/**
 * Format a namespace not found error for $imports.
 */
export function formatNamespaceNotFoundError(
	namespace: string,
	availableNamespaces: string[],
): FormattedError {
	// Use Levenshtein distance to find similar namespaces
	const suggestions = getSimilarNamespaces(namespace, availableNamespaces);

	const formattedError: FormattedError = {
		reference: `$imports:${namespace}`,
		message: `Import namespace "${namespace}" not found in $imports`,
		code: "MISSING_IMPORT_NAMESPACE",
		suggestions: suggestions.length > 0
			? [`Did you mean "${suggestions[0]}"?`, `Available namespaces: ${availableNamespaces.join(", ")}`]
			: [`Available namespaces: ${availableNamespaces.join(", ")}`],
	};

	return formattedError;
}

//==============================================================================
// Context Types
//==============================================================================

/** Context for error formatting */
export interface ErrorContext {
	/** Current document URI */
	documentUri?: string;
	/** Available import namespaces */
	availableNamespaces?: string[];
	/** Known definition names */
	knownDefs?: string[];
	/** Whether this is in an AIR document (no recursion allowed) */
	isAIR?: boolean;
}

/** A formatted error with suggestions */
export interface FormattedError {
	/** The reference that failed */
	reference: string;
	/** Human-readable error message */
	message: string;
	/** Error code */
	code: string;
	/** Suggestions for fixing the error */
	suggestions: string[];
}

//==============================================================================
// Suggestion Generators
//==============================================================================

/**
 * Get suggestions for "not found" errors.
 */
function getSuggestionsForNotFound(ref: string, context: ErrorContext): string[] {
	const suggestions: string[] = [];

	// Check if it looks like a typo
	const segments = ref.split("/").filter(Boolean);
	if (segments.length > 0) {
		const lastSegment = segments[segments.length - 1];
		if (lastSegment) {
			// Suggest similar definition names
			if (context.knownDefs && context.knownDefs.length > 0) {
				const similar = getSimilarNamespaces(lastSegment, context.knownDefs);
				if (similar.length > 0) {
					suggestions.push(`Did you mean "${similar[0]}"?`);
					suggestions.push(`Available definitions: ${context.knownDefs.join(", ")}`);
				}
			}

			// Suggest checking $defs vs nodes
			if (ref.includes("/nodes/")) {
				suggestions.push("Did you mean to reference a definition in $defs instead of a node?");
			}
			if (ref.includes("/$defs/")) {
				suggestions.push("Did you mean to reference a node instead of a definition in $defs?");
			}
		}
	}

	// General suggestions
	suggestions.push("Check that the referenced identifier exists in the document");
	suggestions.push("Verify the JSON Pointer path is correct");

	if (context.documentUri) {
		suggestions.push(`In document: ${context.documentUri}`);
	}

	return suggestions;
}

/**
 * Get suggestions for invalid pointer errors.
 */
function getSuggestionsForInvalidPointer(): string[] {
	return [
		"JSON Pointer must start with '#/' for local references",
		"Use '#' to reference the document root",
		"Escape '~' as '~0' and '/' as '~1' in pointer segments",
		`Examples: "#/$defs/foo", "#/nodes/bar", "#/nodes/0/expr"`,
	];
}

/**
 * Get suggestions for import not found errors.
 */
function getSuggestionsForImportNotFound(uri: string, context: ErrorContext): string[] {
	const suggestions: string[] = [];

	// Check URI scheme
	if (uri.startsWith("stdlib:")) {
		suggestions.push("Check stdlib documentation for available modules");
		if (uri.length > 7) {
			suggestions.push(`Ensure "${uri.slice(7)}" is a valid stdlib module`);
		}
	} else if (uri.startsWith("file://")) {
		suggestions.push("Check that the file path is correct");
		suggestions.push("Use absolute paths or paths relative to the current document");
	} else if (uri.startsWith("http://") || uri.startsWith("https://")) {
		suggestions.push("Check that the URL is accessible");
		suggestions.push("Ensure the server is running and the resource exists");
	}

	suggestions.push("Verify the URI is spelled correctly");

	if (context.availableNamespaces && context.availableNamespaces.length > 0) {
		suggestions.push(`Available import namespaces: ${context.availableNamespaces.join(", ")}`);
	}

	return suggestions;
}

/**
 * Get suggestions for circular reference errors.
 */
function getSuggestionsForCircularReference(context: ErrorContext): string[] {
	const suggestions: string[] = [
		"Break the cycle by removing or restructuring one of the circular references",
		"Consider using the 'fix' combinator for explicit recursion instead of circular $refs",
	];

	if (context.isAIR) {
		suggestions.push("AIR does not allow recursive references - use CIR/EIR/LIR for recursive algorithms");
	}

	return suggestions;
}

/**
 * Get suggestions for max depth exceeded errors.
 */
function getSuggestionsForMaxDepth(_context: ErrorContext): string[] {
	return [
		"This may indicate a circular reference that wasn't directly detected",
		"Consider restructuring imports to reduce nesting depth",
		"If this is not a circular reference, you can increase maxDepth in ResolutionContext",
	];
}

//==============================================================================
// Similarity Helpers
//==============================================================================

/**
 * Find namespace names similar to the given name using Levenshtein distance.
 */
function getSimilarNamespaces(name: string, candidates: string[]): string[] {
	const threshold = 3; // Maximum edit distance for "similar"
	const similar: Array<{ name: string; distance: number }> = [];

	for (const candidate of candidates) {
		const distance = levenshteinDistance(name, candidate);
		if (distance <= threshold && distance < name.length) {
			similar.push({ name: candidate, distance });
		}
	}

	// Sort by distance and return names
	return similar
		.sort((a, b) => a.distance - b.distance)
		.map((s) => s.name)
		.slice(0, 3); // Top 3 matches
}

/**
 * Calculate Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
	const aLen = a.length;
	const bLen = b.length;

	// Handle empty strings
	if (aLen === 0) return bLen;
	if (bLen === 0) return aLen;

	// Use a 2-row matrix to save space
	// Initialize with explicit length tracking for type safety
	const prevRowInit: number[] = [];
	for (let i = 0; i <= aLen; i++) {
		prevRowInit.push(i);
	}
	let prevRow = prevRowInit;

	const currRowInit: number[] = [];
	for (let i = 0; i <= aLen; i++) {
		currRowInit.push(0);
	}
	let currRow = currRowInit;

	for (let i = 1; i <= bLen; i++) {
		// currRow[0] is always valid since we initialized with length aLen + 1
		if (currRow[0] !== undefined) {
			currRow[0] = i;
		}
		for (let j = 1; j <= aLen; j++) {
			const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
			// All indices are valid due to explicit initialization above
			const substitution = (prevRow[j - 1] ?? 0) + cost;
			const insertion = (currRow[j - 1] ?? 0) + 1;
			const deletion = (prevRow[j] ?? 0) + 1;
			currRow[j] = Math.min(substitution, insertion, deletion);
		}
		// Swap rows using temp variable
		const temp = prevRow;
		prevRow = currRow;
		currRow = temp;
	}

	// Return the final result with fallback for type safety
	return prevRow[aLen] ?? aLen;
}

//==============================================================================
// Default Error Context
//==============================================================================

/** Default error context with common values */
export const defaultErrorContext: ErrorContext = {
	documentUri: "",
	availableNamespaces: [],
	knownDefs: [],
	isAIR: false,
};
