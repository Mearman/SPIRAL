// SPDX-License-Identifier: MIT
// Cross-File Cycle Detection for SPIRAL $ref System
//
// This module detects circular references across imported documents to prevent
// infinite recursion during evaluation. It also enforces AIR-specific restrictions
// (no recursive references) to preserve termination guarantees.

import type { AIRDocument, CIRDocument, EIRDocument, LIRDocument } from "../types.ts";
import { parseRef } from "../types/resolution.ts";

//==============================================================================
// Types
//==============================================================================

/** Document layer type */
export type DocumentLayer = "AIR" | "CIR" | "EIR" | "LIR";

/** Detected cycle in reference chain */
export interface ReferenceCycle {
	/** The circular reference path */
	path: string[];
	/** The document where the cycle was detected */
	documentUri: string;
}

/** Cycle detection result */
export interface CycleDetectionResult {
	/** Whether a cycle was detected */
	hasCycle: boolean;
	/** Detected cycles (if any) */
	cycles: ReferenceCycle[];
	/** Violations of layer-specific restrictions */
	violations: CycleViolation[];
}

/** Violation of layer-specific reference rules */
export interface CycleViolation {
	/** Type of violation */
	type: "RECURSIVE_REF_IN_AIR";
	/** The reference that caused the violation */
	reference: string;
	/** The document containing the violating reference */
	documentUri: string;
	/** Description of the violation */
	message: string;
}

/** Options for cycle detection */
export interface CycleDetectionOptions {
	/** Maximum depth for reference resolution (default: 10) */
	maxDepth?: number;
	/** Whether to check for AIR-specific restrictions */
	checkAIRRestrictions?: boolean;
}

//==============================================================================
// Cycle Detection
//==============================================================================

/**
 * Detect circular references in a SPIRAL document.
 *
 * @param doc - The document to check
 * @param layer - The document layer (AIR/CIR/EIR/LIR)
 * @param options - Detection options
 * @returns Cycle detection result
 */
export function detectCycles(
	doc: SPIRALDocument,
	layer: DocumentLayer,
	options: CycleDetectionOptions = {},
): CycleDetectionResult {
	const maxDepth = options.maxDepth ?? 10;
	const checkAIR = options.checkAIRRestrictions ?? layer === "AIR";

	// Build dependency graph from $refs in the document
	const graph = buildDependencyGraph(doc, "");
	const cycles: ReferenceCycle[] = [];
	const violations: CycleViolation[] = [];

	// Detect cycles using depth-first search
	detectCyclesInGraph(graph, maxDepth, cycles);

	// Check AIR-specific restrictions (no recursive references)
	if (checkAIR) {
		checkAIRRestrictions(graph, violations);
	}

	return {
		hasCycle: cycles.length > 0 || violations.length > 0,
		cycles,
		violations,
	};
}

/** Any SPIRAL document type */
type SPIRALDocument = AIRDocument | CIRDocument | EIRDocument | LIRDocument;

/** Node in the dependency graph */
interface GraphNode {
	/** The node's identifier (URI or reference) */
	id: string;
	/** References to other nodes (outgoing edges) */
	refs: string[];
	/** Whether this is an external reference */
	isExternal: boolean;
}

/** Dependency graph mapping node ID to node */
type DependencyGraph = Map<string, GraphNode>;

/**
 * Build a dependency graph from a document's $refs.
 */
function buildDependencyGraph(doc: SPIRALDocument, baseUri: string): DependencyGraph {
	const graph = new Map<string, GraphNode>();
	const processQueue: Array<{ id: string; obj: unknown; isExternal: boolean }> = [
		{ id: baseUri || "#", obj: doc, isExternal: false },
	];

	while (processQueue.length > 0) {
		const item = processQueue.shift();
		if (!item) break;
		const { id, obj, isExternal } = item;
		if (graph.has(id)) continue;

		const refs: string[] = [];

		// Extract $refs from the object
		extractRefs(obj, refs);

		// Create graph node
		graph.set(id, { id, refs, isExternal });

		// Queue referenced documents/nodes for processing
		for (const ref of refs) {
			const parsed = parseRef(ref, baseUri);
			if (!parsed.isLocal) {
				// External reference - would need to load document to continue
				// For now, just create a placeholder node
				const refId = parsed.docUri || ref;
				if (!graph.has(refId)) {
					processQueue.push({ id: refId, obj: null, isExternal: true });
				}
			}
		}
	}

	return graph;
}

/**
 * Extract all $ref values from an object recursively.
 */
function extractRefs(obj: unknown, refs: string[]): void {
	if (!obj || typeof obj !== "object") return;

	// Handle arrays
	if (Array.isArray(obj)) {
		for (const item of obj) {
			extractRefs(item, refs);
		}
		return;
	}

	// Check for $ref property
	if ("$ref" in obj && typeof obj.$ref === "string") {
		refs.push(obj.$ref);
	}

	// Recursively check all properties using Object.entries to avoid type issues
	for (const [_key, value] of Object.entries(obj)) {
		if (_key !== "$ref") { // Don't re-process $ref
			extractRefs(value, refs);
		}
	}
}

/**
 * Detect cycles in the dependency graph using DFS.
 */
function detectCyclesInGraph(
	graph: DependencyGraph,
	maxDepth: number,
	cycles: ReferenceCycle[],
): void {
	const visited = new Set<string>();
	const recStack = new Set<string>();

	for (const [startId, node] of graph) {
		if (!visited.has(startId)) {
			dfs(node, visited, recStack, [startId], maxDepth, 0, cycles, graph);
		}
	}
}

/**
 * Depth-first search to detect cycles.
 */
function dfs(
	node: GraphNode,
	visited: Set<string>,
	recStack: Set<string>,
	path: string[],
	maxDepth: number,
	depth: number,
	cycles: ReferenceCycle[],
	graph: DependencyGraph,
): void {
	visited.add(node.id);
	recStack.add(node.id);

	// Check depth limit
	if (depth > maxDepth) {
		recStack.delete(node.id);
		return;
	}

	for (const ref of node.refs) {
		const parsed = parseRef(ref, node.id);
		const targetId = parsed.docUri || ref;
		const targetNode = graph.get(targetId);

		// Check if target is in recursion stack (cycle detected)
		if (recStack.has(targetId)) {
			const cyclePath = [...path, targetId];
			cycles.push({
				path: cyclePath,
				documentUri: node.id,
			});
			continue;
		}

		// Continue DFS if target hasn't been visited
		if (targetNode && !visited.has(targetId)) {
			dfs(targetNode, visited, recStack, [...path, targetId], maxDepth, depth + 1, cycles, graph);
		}
	}

	recStack.delete(node.id);
}

/**
 * Check for AIR-specific restrictions (no recursive references).
 *
 * AIR must be primitive recursive (bounded), so we reject any reference
 * that could create a cycle, even within the same document.
 */
function checkAIRRestrictions(graph: DependencyGraph, violations: CycleViolation[]): void {
	for (const node of graph.values()) {
		// Check all references from this node
		for (const ref of node.refs) {
			const parsed = parseRef(ref, node.id);

			// Check if reference could create a cycle
			// For AIR, we reject any reference that points back to the same document
			if (parsed.isLocal) {
				// Local reference in AIR - check if it could be recursive
				// For now, flag all local $refs as potential AIR violations
				// (A more sophisticated check would trace the actual reference graph)
				violations.push({
					type: "RECURSIVE_REF_IN_AIR",
					reference: ref,
					documentUri: node.id,
					message: `Recursive references are not allowed in AIR (found: ${ref})`,
				});
			}
		}
	}
}

/**
 * Format a cycle as a human-readable string.
 */
export function formatCycle(cycle: ReferenceCycle): string {
	return `Circular: ${cycle.path.join(" -> ")}`;
}

/**
 * Format a violation as a human-readable string.
 */
export function formatViolation(violation: CycleViolation): string {
	return `[${violation.type}] ${violation.message} (reference: ${violation.reference})`;
}
