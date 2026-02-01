// SPIRAL JSON Canonicalization (JCS Profile)
// Reference implementation of Section 16 of the SPIRAL specification.
// Implements RFC 8785 (JSON Canonicalization Scheme) with SPIRAL-specific
// field filtering to produce deterministic byte-level serialization.

import { createHash, type Hash } from "node:crypto";

//==============================================================================
// Recognized Document Fields
//==============================================================================

/** Top-level fields recognized by the SPIRAL schema (plus $schema). */
const DOCUMENT_FIELDS = new Set([
	"$schema",
	"version",
	"capabilities",
	"functionSigs",
	"airDefs",
	"nodes",
	"result",
]);

//==============================================================================
// JCS Serialization (RFC 8785)
//==============================================================================

/** Serialize a number per RFC 8785 / ECMAScript Number.toString(). */
function jcsNumber(value: number): string {
	if (!Number.isFinite(value)) {
		throw new Error(`JCS: non-finite number ${value} cannot be serialized`);
	}
	if (Object.is(value, -0)) return "0";
	return JSON.stringify(value);
}

function isRecord(val: unknown): val is Record<string, unknown> {
	return val !== null && typeof val === "object" && !Array.isArray(val);
}

/** Serialize an object with keys sorted by UTF-16 code unit comparison. */
function jcsObject(obj: Record<string, unknown>): string {
	const keys = Object.keys(obj).sort();
	const entries: string[] = [];
	for (const key of keys) {
		const val = obj[key];
		if (val === undefined) continue;
		entries.push(JSON.stringify(key) + ":" + jcsSerialize(val));
	}
	return "{" + entries.join(",") + "}";
}

/**
 * Serialize a JSON value to its RFC 8785 canonical form.
 *
 * - Objects: keys sorted by UTF-16 code unit lexicographic order
 * - Arrays: element order preserved
 * - Strings: ECMAScript escaping
 * - Numbers: ECMAScript Number.toString()
 * - No whitespace between tokens
 */
function jcsSerialize(value: unknown): string {
	if (value === null || value === undefined) return "null";
	if (typeof value === "boolean") return value ? "true" : "false";
	if (typeof value === "number") return jcsNumber(value);
	if (typeof value === "string") return JSON.stringify(value);
	if (Array.isArray(value)) return "[" + value.map(jcsSerialize).join(",") + "]";
	if (isRecord(value)) return jcsObject(value);
	throw new Error(`JCS: unsupported type ${typeof value}`);
}

//==============================================================================
// Metadata Stripping
//==============================================================================

/**
 * Strip non-semantic metadata fields from a SPIRAL document.
 *
 * Retains only recognized schema fields and `$schema`.
 * Returns a new object; the input is not mutated.
 */
export function stripMetadata(doc: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const key of Object.keys(doc)) {
		if (DOCUMENT_FIELDS.has(key)) {
			result[key] = doc[key];
		}
	}
	return result;
}

//==============================================================================
// Public API
//==============================================================================

/**
 * Produce the RFC 8785 canonical JSON string of a SPIRAL document.
 *
 * Strips non-semantic metadata fields, then applies JCS serialization.
 * The result is a deterministic string suitable for hashing or comparison.
 */
export function canonicalize(doc: Record<string, unknown>): string {
	return jcsSerialize(stripMetadata(doc));
}

/**
 * Produce the RFC 8785 canonical JSON string of a single SPIRAL node.
 *
 * No document-level metadata stripping is performed; the node is serialized as-is.
 */
export function canonicalizeNode(node: Record<string, unknown>): string {
	return jcsSerialize(node);
}

/**
 * Compute the content digest of a SPIRAL document.
 *
 * @param doc - Parsed SPIRAL document
 * @param algorithm - Hash algorithm (default: "sha256")
 * @returns Digest string in the format `spiral-{algorithm}:{hex}`
 */
export function documentDigest(
	doc: Record<string, unknown>,
	algorithm = "sha256",
): string {
	const canonical = canonicalize(doc);
	const hash: Hash = createHash(algorithm);
	hash.update(canonical, "utf8");
	return `spiral-${algorithm}:${hash.digest("hex")}`;
}

/**
 * Compute the content digest of a single SPIRAL node.
 *
 * @param node - Parsed SPIRAL node
 * @param algorithm - Hash algorithm (default: "sha256")
 * @returns Digest string in the format `spiral-{algorithm}:{hex}`
 */
export function nodeDigest(
	node: Record<string, unknown>,
	algorithm = "sha256",
): string {
	const canonical = canonicalizeNode(node);
	const hash: Hash = createHash(algorithm);
	hash.update(canonical, "utf8");
	return `spiral-${algorithm}:${hash.digest("hex")}`;
}
