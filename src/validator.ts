// SPIRAL Schema Validator
// Two-phase validation: Zod safeParse for structural, then semantic checks.

import { z } from "zod/v4";
import {
	invalidResult,
	type ValidationError,
	type ValidationResult,
	validResult,
} from "./errors.js";
import type {
	AIRDocument,
	CIRDocument,
	EIRDocument,
	LIRDocument,
} from "./types.js";
import {
	AIRDocumentSchema,
	CIRDocumentSchema,
	EIRDocumentSchema,
	LIRDocumentSchema,
} from "./zod-schemas.js";

//==============================================================================
// Zod-to-ValidationError Conversion
//==============================================================================

function zodToValidationErrors(error: z.ZodError): ValidationError[] {
	return error.issues.map(issue => ({
		path: issue.path.map(String).join(".") || "$",
		message: issue.message,
	}));
}

//==============================================================================
// Validation State (for semantic checks)
//==============================================================================

interface ValidationState {
	errors: ValidationError[];
	path: string[];
}

function pushPath(state: ValidationState, segment: string): void {
	state.path.push(segment);
}

function popPath(state: ValidationState): void {
	state.path.pop();
}

function currentPath(state: ValidationState): string {
	return state.path.length > 0 ? state.path.join(".") : "$";
}

function addError(
	state: ValidationState,
	message: string,
	value?: unknown,
): void {
	state.errors.push({
		path: currentPath(state),
		message,
		value,
	});
}

//==============================================================================
// Helper: Record<string, unknown> type guard
//==============================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

//==============================================================================
// Acyclic Reference Checking
//==============================================================================

type NodeMap = Map<string, { expr?: Record<string, unknown> }>;

interface RefsAndBindings {
	refs: string[];
	letBindings: Set<string>;
}

function checkAcyclic(
	state: ValidationState,
	nodes: NodeMap,
	startId: string,
	visited: Set<string>,
	path: string[],
	lambdaParams?: Set<string>,
): void {
	if (visited.has(startId)) {
		// Check if any node in the path is a lambda - if so, this is valid recursion
		let hasLambda = false;
		for (const nodeId of path) {
			const node = nodes.get(nodeId);
			if (node && "expr" in node && node.expr?.kind === "lambda") {
				hasLambda = true;
				break;
			}
		}
		if (hasLambda) {
			return;
		}
		addError(state, "Reference cycle detected: " + path.join(" -> "));
		return;
	}

	const node = nodes.get(startId);
	if (!node) {
		if (lambdaParams?.has(startId)) {
			return;
		}
		addError(state, "Reference to non-existent node: " + startId);
		return;
	}

	visited.add(startId);

	// Skip block nodes - they don't have expressions to analyze
	if (!("expr" in node)) {
		return;
	}

	// If this node is a lambda, collect its parameters for nested checks
	if (node.expr?.kind === "lambda") {
		const params = node.expr.params;
		if (Array.isArray(params)) {
			const paramSet = new Set<string>();
			if (lambdaParams) {
				for (const p of lambdaParams) {
					paramSet.add(p);
				}
			}
			for (const p of params) {
				if (typeof p === "string") {
					paramSet.add(p);
				} else if (isRecord(p) && typeof p.name === "string") {
					paramSet.add(p.name);
				}
			}
			const result = collectRefsAndLetBindings(node.expr, paramSet);
			for (const b of result.letBindings) paramSet.add(b);

			for (const refId of result.refs) {
				const newPath = [...path, refId];
				checkAcyclic(state, nodes, refId, new Set(visited), newPath, paramSet);
			}
			return;
		}
	}

	const result = collectRefsAndLetBindings(node.expr, lambdaParams);
	const combinedParams = new Set<string>(lambdaParams);
	for (const b of result.letBindings) combinedParams.add(b);

	for (const refId of result.refs) {
		if (result.letBindings.has(refId)) {
			continue;
		}
		if (lambdaParams?.has(refId)) {
			continue;
		}
		const newPath = [...path, refId];
		checkAcyclic(state, nodes, refId, new Set(visited), newPath, combinedParams);
	}
}

function collectRefsAndLetBindings(
	expr: Record<string, unknown>,
	params?: Set<string>,
	letBindings?: Set<string>,
): RefsAndBindings {
	const refs: string[] = [];
	const bindings = new Set(letBindings);

	if (expr.kind === "ref") {
		const id = expr.id;
		if (typeof id === "string") {
			if (!params?.has(id) && !bindings.has(id)) refs.push(id);
		}
	} else if (expr.kind === "if") {
		const cond = expr.cond,
			then = expr.then,
			els = expr.else;
		if (typeof cond === "string") {
			if (!params?.has(cond) && !bindings.has(cond)) refs.push(cond);
		} else if (isRecord(cond)) {
			const result = collectRefsAndLetBindings(cond, params, bindings);
			refs.push(...result.refs);
			for (const b of result.letBindings) bindings.add(b);
		}

		if (typeof then === "string") {
			if (!params?.has(then) && !bindings.has(then)) refs.push(then);
		} else if (isRecord(then)) {
			const result = collectRefsAndLetBindings(then, params, bindings);
			refs.push(...result.refs);
			for (const b of result.letBindings) bindings.add(b);
		}

		if (typeof els === "string") {
			if (!params?.has(els) && !bindings.has(els)) refs.push(els);
		} else if (isRecord(els)) {
			const result = collectRefsAndLetBindings(els, params, bindings);
			refs.push(...result.refs);
			for (const b of result.letBindings) bindings.add(b);
		}
	} else if (expr.kind === "let") {
		const value = expr.value,
			body = expr.body;
		const letName = expr.name;
		if (typeof letName === "string") {
			bindings.add(letName);
		}

		if (typeof value === "string") {
			if (!params?.has(value) && !bindings.has(value)) refs.push(value);
		} else if (isRecord(value)) {
			const result = collectRefsAndLetBindings(value, params, bindings);
			refs.push(...result.refs);
			for (const b of result.letBindings) bindings.add(b);
		}

		if (typeof body === "string") {
			if (!params?.has(body) && !bindings.has(body)) refs.push(body);
		} else if (isRecord(body)) {
			const result = collectRefsAndLetBindings(body, params, bindings);
			refs.push(...result.refs);
			for (const b of result.letBindings) bindings.add(b);
		}
	} else if (expr.kind === "call") {
		const args = expr.args;
		if (Array.isArray(args)) {
			for (const arg of args) {
				if (typeof arg === "string") {
					if (!params?.has(arg) && !bindings.has(arg)) {
						refs.push(arg);
					}
				}
			}
		}
	} else if (expr.kind === "lambda") {
		const lambdaParams = expr.params;
		if (Array.isArray(lambdaParams)) {
			const paramSet = new Set(params ?? []);
			for (const p of lambdaParams) {
				if (typeof p === "string") {
					paramSet.add(p);
				} else if (isRecord(p) && typeof p.name === "string") {
					paramSet.add(p.name);
				}
			}
			const body = expr.body;
			if (typeof body === "string") {
				if (!paramSet.has(body) && !bindings.has(body)) refs.push(body);
			} else if (isRecord(body)) {
				const result = collectRefsAndLetBindings(body, paramSet, bindings);
				refs.push(...result.refs);
				for (const b of result.letBindings) bindings.add(b);
			}
		}
	} else if (expr.kind === "callExpr") {
		const fn = expr.fn,
			args = expr.args;
		if (typeof fn === "string" && !params?.has(fn) && !bindings.has(fn)) {
			refs.push(fn);
		}
		if (Array.isArray(args)) {
			for (const arg of args) {
				if (typeof arg === "string") {
					if (!params?.has(arg) && !bindings.has(arg)) {
						refs.push(arg);
					}
				}
			}
		}
	} else if (expr.kind === "fix") {
		const fn = expr.fn;
		if (typeof fn === "string") refs.push(fn);
	} else if (expr.kind === "do") {
		const exprs = expr.exprs;
		if (Array.isArray(exprs)) {
			for (const e of exprs) {
				if (typeof e === "string") {
					if (!params?.has(e) && !bindings.has(e)) refs.push(e);
				} else if (isRecord(e)) {
					const result = collectRefsAndLetBindings(e, params, bindings);
					refs.push(...result.refs);
					for (const b of result.letBindings) bindings.add(b);
				}
			}
		}
	}

	return { refs, letBindings: bindings };
}

//==============================================================================
// Topological Sort
//==============================================================================

/**
 * Topologically sort nodes by their dependency order.
 * Returns sorted nodes if acyclic, or null if a true cycle exists.
 * Lambda bodies are excluded from dependencies (lazy evaluation).
 */
function topologicalSortNodes(
	nodes: { id: string; expr?: Record<string, unknown> }[],
): { id: string; expr?: Record<string, unknown> }[] | null {
	const nodeIds = new Set(nodes.map(n => n.id));
	const deps = new Map<string, Set<string>>();

	for (const node of nodes) {
		const nodeDeps = new Set<string>();
		if (node.expr) {
			collectNodeDeps(node.expr, nodeDeps, nodeIds);
		}
		deps.set(node.id, nodeDeps);
	}

	// Kahn's algorithm
	const inDegree = new Map<string, number>();
	for (const node of nodes) {
		inDegree.set(node.id, 0);
	}
	for (const [, nodeDeps] of deps) {
		for (const dep of nodeDeps) {
			inDegree.set(dep, (inDegree.get(dep) ?? 0) + 1);
		}
	}

	const queue: string[] = [];
	for (const [id, degree] of inDegree) {
		if (degree === 0) queue.push(id);
	}

	const sorted: string[] = [];
	while (queue.length > 0) {
		const id = queue.shift();
		if (id === undefined) break;
		sorted.push(id);
		const nodeDeps = deps.get(id);
		if (nodeDeps) {
			for (const dep of nodeDeps) {
				const newDegree = (inDegree.get(dep) ?? 1) - 1;
				inDegree.set(dep, newDegree);
				if (newDegree === 0) {
					queue.push(dep);
				}
			}
		}
	}

	if (sorted.length !== nodes.length) {
		return null; // Cycle detected
	}

	const nodeMap = new Map(nodes.map(n => [n.id, n]));
	return sorted.map(id => nodeMap.get(id)).filter((n): n is typeof nodes[number] => n !== undefined);
}

/**
 * Collect node ID dependencies from an expression.
 * Excludes lambda bodies (lazy evaluation) and let binding names.
 */
function collectNodeDeps(
	expr: Record<string, unknown>,
	deps: Set<string>,
	validNodeIds: Set<string>,
	params?: Set<string>,
): void {
	const kind = expr.kind;
	if (typeof kind !== "string") return;

	const addIfNode = (val: unknown) => {
		if (typeof val === "string" && validNodeIds.has(val) && !params?.has(val)) {
			deps.add(val);
		}
	};

	switch (kind) {
	case "ref":
		addIfNode(expr.id);
		break;
	case "call":
		if (Array.isArray(expr.args)) {
			for (const arg of expr.args) {
				if (typeof arg === "string") addIfNode(arg);
				else if (isRecord(arg)) {
					collectNodeDeps(arg, deps, validNodeIds, params);
				}
			}
		}
		break;
	case "if":
		addIfNode(expr.cond);
		addIfNode(expr.then);
		addIfNode(expr.else);
		break;
	case "let": {
		addIfNode(expr.value);
		const letParams = new Set(params ?? []);
		if (typeof expr.name === "string") letParams.add(expr.name);
		if (typeof expr.body === "string" && validNodeIds.has(expr.body) && !letParams.has(expr.body)) {
			deps.add(expr.body);
		}
		break;
	}
	case "callExpr":
		addIfNode(expr.fn);
		if (Array.isArray(expr.args)) {
			for (const arg of expr.args) addIfNode(arg);
		}
		break;
	case "fix":
		addIfNode(expr.fn);
		break;
	case "lambda":
		// Lambda bodies are lazily evaluated - don't add as deps
		break;
	case "do":
		if (Array.isArray(expr.exprs)) {
			for (const e of expr.exprs) {
				if (typeof e === "string") addIfNode(e);
				else if (isRecord(e)) {
					collectNodeDeps(e, deps, validNodeIds, params);
				}
			}
		}
		break;
	}
}

//==============================================================================
// CFG Validation
//==============================================================================

/**
 * Validate CFG structure.
 * Check that all jump/branch targets reference valid blocks.
 */
function validateCFG(
	state: ValidationState,
	blocks: Record<string, unknown>[],
): void {
	const blockIds = new Set<string>();
	for (const block of blocks) {
		if (typeof block.id === "string") {
			blockIds.add(block.id);
		}
	}

	for (const block of blocks) {
		if (block.terminator && isRecord(block.terminator)) {
			const term = block.terminator;
			const termKind = term.kind;

			if (termKind === "jump") {
				const to = term.to;
				if (typeof to === "string" && !blockIds.has(to)) {
					addError(
						state,
						"Jump terminator references non-existent block: " + to,
						to,
					);
				}
			} else if (termKind === "branch") {
				const thenTarget = term.then;
				const elseTarget = term.else;
				if (typeof thenTarget === "string" && !blockIds.has(thenTarget)) {
					addError(
						state,
						"Branch terminator references non-existent block: " + thenTarget,
						thenTarget,
					);
				}
				if (typeof elseTarget === "string" && !blockIds.has(elseTarget)) {
					addError(
						state,
						"Branch terminator references non-existent block: " + elseTarget,
						elseTarget,
					);
				}
			}
		}

		// Check phi sources reference valid blocks
		const instructions = block.instructions;
		if (Array.isArray(instructions)) {
			for (const ins of instructions) {
				if (isRecord(ins)) {
					const insSources = ins.sources;
					if (ins.kind === "phi" && Array.isArray(insSources)) {
						for (const source of insSources) {
							if (isRecord(source)) {
								const sourceBlock = source.block;
								if (
									typeof sourceBlock === "string" &&
									!blockIds.has(sourceBlock)
								) {
									addError(
										state,
										"Phi source references non-existent block: " +
											sourceBlock,
										sourceBlock,
									);
								}
							}
						}
					}
				}
			}
		}
	}
}

//==============================================================================
// Semantic Validation Helpers
//==============================================================================

/**
 * Check for duplicate node IDs in the nodes array.
 * Returns the set of all node IDs found.
 */
function checkDuplicateNodeIds(
	state: ValidationState,
	nodes: { id: string }[],
): Set<string> {
	const nodeIds = new Set<string>();
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		if (!node) continue;
		if (nodeIds.has(node.id)) {
			pushPath(state, "nodes[" + String(i) + "].id");
			addError(state, "Duplicate node id: " + node.id, node.id);
			popPath(state);
		}
		nodeIds.add(node.id);
	}
	return nodeIds;
}

/**
 * Check that the result field references an existing node.
 */
function checkResultNodeExists(
	state: ValidationState,
	result: string,
	nodeIds: Set<string>,
): void {
	if (!nodeIds.has(result)) {
		pushPath(state, "result");
		addError(
			state,
			"Result references non-existent node: " + result,
			result,
		);
		popPath(state);
	}
}

/**
 * Validate CFG blocks within hybrid nodes (block-based nodes).
 * Checks duplicate block IDs, entry references, and CFG target references.
 */
function checkBlockNodeCFG(
	state: ValidationState,
	nodes: { id: string; blocks?: unknown; entry?: unknown }[],
): void {
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		if (!node || !Array.isArray(node.blocks)) continue;

		pushPath(state, "nodes[" + String(i) + "]");

		const blocks: unknown[] = node.blocks;
		const blockIds = new Set<string>();

		// Check duplicate block IDs
		for (let j = 0; j < blocks.length; j++) {
			const block = blocks[j];
			if (isRecord(block) && typeof block.id === "string") {
				if (blockIds.has(block.id)) {
					pushPath(state, "blocks[" + String(j) + "].id");
					addError(state, "Duplicate block id: " + block.id, block.id);
					popPath(state);
				}
				blockIds.add(block.id);
			}
		}

		// Check entry references a valid block
		if (typeof node.entry === "string" && !blockIds.has(node.entry)) {
			pushPath(state, "entry");
			addError(
				state,
				"Entry references non-existent block: " + node.entry,
				node.entry,
			);
			popPath(state);
		}

		// Validate CFG target references
		const cfgBlocks: Record<string, unknown>[] = [];
		for (const b of blocks) {
			if (isRecord(b)) {
				cfgBlocks.push(b);
			}
		}
		validateCFG(state, cfgBlocks);

		popPath(state);
	}
}

/**
 * Run acyclic reference checking on expression nodes.
 * Builds a node map and runs topological sort + cycle detection.
 */
function checkAcyclicRefs(
	state: ValidationState,
	nodes: { id: string; expr?: unknown }[],
	lambdaParamsSet?: Set<string>,
): void {
	const nodeMap: NodeMap = new Map();
	const typedNodes: { id: string; expr?: Record<string, unknown> }[] = [];

	for (const node of nodes) {
		if (isRecord(node.expr)) {
			nodeMap.set(node.id, { expr: node.expr });
			typedNodes.push({ id: node.id, expr: node.expr });
		} else {
			// Block nodes (no expr) still need to be in the map
			nodeMap.set(node.id, {});
			typedNodes.push({ id: node.id });
		}
	}

	const sorted = topologicalSortNodes(typedNodes);
	if (sorted === null) {
		addError(state, "Reference cycle detected in node dependencies");
	} else {
		for (const node of sorted) {
			if (typeof node.id === "string") {
				checkAcyclic(state, nodeMap, node.id, new Set(), [node.id], lambdaParamsSet);
			}
		}
	}
}

/**
 * Collect all lambda params and let bindings from nodes (for CIR).
 */
function collectAllParamsAndBindings(
	nodes: { id: string; expr?: unknown }[],
): Set<string> {
	const allParamsAndBindings = new Set<string>();

	const collect = (expr: Record<string, unknown>): void => {
		if (expr.kind === "lambda") {
			const params = expr.params;
			if (Array.isArray(params)) {
				for (const p of params) {
					if (typeof p === "string") {
						allParamsAndBindings.add(p);
					} else if (isRecord(p) && typeof p.name === "string") {
						allParamsAndBindings.add(p.name);
					}
				}
			}
			if (isRecord(expr.body)) {
				collect(expr.body);
			}
		} else if (expr.kind === "let") {
			if (typeof expr.name === "string") {
				allParamsAndBindings.add(expr.name);
			}
			if (isRecord(expr.value)) {
				collect(expr.value);
			}
			if (isRecord(expr.body)) {
				collect(expr.body);
			}
		} else if (expr.kind === "if") {
			if (isRecord(expr.cond)) collect(expr.cond);
			if (isRecord(expr.then)) collect(expr.then);
			if (isRecord(expr.else)) collect(expr.else);
		}
	};

	for (const node of nodes) {
		if (isRecord(node.expr)) {
			collect(node.expr);
		}
	}

	return allParamsAndBindings;
}

/**
 * Validate EIR expression node references.
 * Checks that string references in EIR-specific expressions point to existing nodes.
 */
function checkEirNodeReferences(
	state: ValidationState,
	nodes: { id: string; expr?: unknown }[],
	nodeIds: Set<string>,
): void {
	const checkRef = (ref: unknown, name: string) => {
		if (typeof ref === "string" && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(ref)) {
			if (!nodeIds.has(ref)) {
				addError(state, name + " references non-existent node: " + ref, ref);
			}
		}
	};

	for (const node of nodes) {
		if (!isRecord(node.expr)) continue;
		const expr = node.expr;
		const kind = expr.kind;

		switch (kind) {
		case "seq":
			if (typeof expr.first === "string") checkRef(expr.first, "seq.first");
			if (typeof expr.then === "string") checkRef(expr.then, "seq.then");
			break;
		case "assign":
			if (typeof expr.value === "string") checkRef(expr.value, "assign.value");
			break;
		case "while":
			if (typeof expr.cond === "string") checkRef(expr.cond, "while.cond");
			if (typeof expr.body === "string") checkRef(expr.body, "while.body");
			break;
		case "for":
			if (typeof expr.init === "string") checkRef(expr.init, "for.init");
			if (typeof expr.cond === "string") checkRef(expr.cond, "for.cond");
			if (typeof expr.update === "string") checkRef(expr.update, "for.update");
			if (typeof expr.body === "string") checkRef(expr.body, "for.body");
			break;
		case "iter":
			if (typeof expr.iter === "string") checkRef(expr.iter, "iter.iter");
			if (typeof expr.body === "string") checkRef(expr.body, "iter.body");
			break;
		case "effect": {
			const effectArgs = expr.args;
			if (Array.isArray(effectArgs)) {
				for (let i = 0; i < effectArgs.length; i++) {
					const arg = effectArgs[i];
					if (typeof arg === "string") {
						checkRef(arg, "effect.args[" + String(i) + "]");
					}
				}
			}
			break;
		}
		case "try":
			if (typeof expr.tryBody === "string") checkRef(expr.tryBody, "try.tryBody");
			if (typeof expr.catchBody === "string") checkRef(expr.catchBody, "try.catchBody");
			if (expr.fallback !== undefined && typeof expr.fallback === "string") {
				checkRef(expr.fallback, "try.fallback");
			}
			break;
		}
	}
}

//==============================================================================
// Block Reachability Check
//==============================================================================

/**
 * BFS from entry block to find unreachable blocks.
 * Reports blocks that cannot be reached from the entry block.
 */
function checkBlockReachability(
	state: ValidationState,
	nodes: { id: string; blocks?: unknown; entry?: unknown }[],
): void {
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		if (!node || !Array.isArray(node.blocks) || typeof node.entry !== "string") continue;

		pushPath(state, "nodes[" + String(i) + "]");

		const blocks: unknown[] = node.blocks;
		const blockMap = new Map<string, Record<string, unknown>>();
		for (const block of blocks) {
			if (isRecord(block) && typeof block.id === "string") {
				blockMap.set(block.id, block);
			}
		}

		// BFS from entry
		const visited = new Set<string>();
		const queue: string[] = [node.entry];
		visited.add(node.entry);

		while (queue.length > 0) {
			const blockId = queue.shift();
			if (blockId === undefined) continue;
			const block = blockMap.get(blockId);
			if (!block) continue;

			const targets = collectTerminatorTargets(block.terminator);
			for (const target of targets) {
				if (!visited.has(target)) {
					visited.add(target);
					queue.push(target);
				}
			}
		}

		// Report unreachable blocks
		for (const block of blocks) {
			if (isRecord(block) && typeof block.id === "string" && !visited.has(block.id)) {
				addError(state, "Unreachable block: " + block.id, block.id);
			}
		}

		popPath(state);
	}
}

/**
 * Collect target block IDs from a terminator.
 */
function collectTerminatorTargets(terminator: unknown): string[] {
	if (!isRecord(terminator)) return [];
	const targets: string[] = [];
	const kind = terminator.kind;

	if (kind === "jump") {
		if (typeof terminator.to === "string") targets.push(terminator.to);
	} else if (kind === "branch") {
		if (typeof terminator.then === "string") targets.push(terminator.then);
		if (typeof terminator.else === "string") targets.push(terminator.else);
	} else if (kind === "fork") {
		const branches = terminator.branches;
		if (Array.isArray(branches)) {
			for (const b of branches) {
				if (isRecord(b) && typeof b.block === "string") {
					targets.push(b.block);
				}
			}
		}
		if (typeof terminator.continuation === "string") targets.push(terminator.continuation);
	} else if (kind === "join") {
		if (typeof terminator.to === "string") targets.push(terminator.to);
	} else if (kind === "suspend") {
		if (typeof terminator.resumeBlock === "string") targets.push(terminator.resumeBlock);
	}

	return targets;
}

//==============================================================================
// Phi Predecessor Check
//==============================================================================

/**
 * For each phi instruction in a block, verify that each phi source block
 * is an actual CFG predecessor of that block.
 */
function checkPhiPredecessors(
	state: ValidationState,
	nodes: { id: string; blocks?: unknown; entry?: unknown }[],
): void {
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		if (!node || !Array.isArray(node.blocks)) continue;

		pushPath(state, "nodes[" + String(i) + "]");

		const blocks: unknown[] = node.blocks;

		// Build block lookup map
		const blockMap = new Map<string, Record<string, unknown>>();
		for (const block of blocks) {
			if (isRecord(block) && typeof block.id === "string") {
				blockMap.set(block.id, block);
			}
		}

		// Build predecessor map: blockId -> set of predecessor block IDs
		const predecessors = new Map<string, Set<string>>();
		for (const block of blocks) {
			if (!isRecord(block) || typeof block.id !== "string") continue;
			// Initialize empty set for each block
			if (!predecessors.has(block.id)) {
				predecessors.set(block.id, new Set());
			}
		}

		for (const block of blocks) {
			if (!isRecord(block) || typeof block.id !== "string") continue;
			const targets = collectTerminatorTargets(block.terminator);
			for (const target of targets) {
				let predSet = predecessors.get(target);
				if (!predSet) {
					predSet = new Set();
					predecessors.set(target, predSet);
				}
				predSet.add(block.id);
			}
		}

		// For fork terminators, blocks that return within fork branches
		// are logical predecessors of the fork's continuation block.
		for (const block of blocks) {
			if (!isRecord(block) || typeof block.id !== "string") continue;
			const term = block.terminator;
			if (!isRecord(term) || term.kind !== "fork") continue;
			const continuation = term.continuation;
			if (typeof continuation !== "string") continue;
			const forkBranches = term.branches;
			if (!Array.isArray(forkBranches)) continue;

			// Collect all blocks reachable from fork branch entries that end with return
			const branchEntries = new Set<string>();
			for (const b of forkBranches) {
				if (isRecord(b) && typeof b.block === "string") {
					branchEntries.add(b.block);
				}
			}

			// BFS from branch entries to find blocks with return terminators
			const branchVisited = new Set<string>();
			const branchQueue = [...branchEntries];
			for (const be of branchEntries) branchVisited.add(be);

			while (branchQueue.length > 0) {
				const bid = branchQueue.shift();
				if (bid === undefined) continue;
				const bblock = blockMap.get(bid);
				if (!bblock) continue;
				const bterm = bblock.terminator;
				if (isRecord(bterm) && bterm.kind === "return") {
					// This block returns within a fork branch; it's a logical predecessor of continuation
					let predSet = predecessors.get(continuation);
					if (!predSet) {
						predSet = new Set();
						predecessors.set(continuation, predSet);
					}
					predSet.add(bid);
				}
				const bTargets = collectTerminatorTargets(bterm);
				for (const t of bTargets) {
					if (!branchVisited.has(t) && t !== continuation) {
						branchVisited.add(t);
						branchQueue.push(t);
					}
				}
			}
		}

		// Check phi instructions
		for (const block of blocks) {
			if (!isRecord(block) || typeof block.id !== "string") continue;
			const instructions = block.instructions;
			if (!Array.isArray(instructions)) continue;

			const blockPreds = predecessors.get(block.id) ?? new Set<string>();

			for (const ins of instructions) {
				if (!isRecord(ins) || ins.kind !== "phi") continue;
				const sources = ins.sources;
				if (!Array.isArray(sources)) continue;

				for (const source of sources) {
					if (!isRecord(source) || typeof source.block !== "string") continue;
					if (!blockPreds.has(source.block)) {
						addError(
							state,
							"Phi source block " + source.block + " is not a predecessor of block " + block.id,
							source.block,
						);
					}
				}
			}
		}

		popPath(state);
	}
}

//==============================================================================
// Async Expression Node Reference Check
//==============================================================================

/**
 * Validate async expression node references.
 * Checks that string references in async-specific expressions point to existing nodes.
 */
function checkAsyncNodeReferences(
	state: ValidationState,
	nodes: { id: string; expr?: unknown }[],
	nodeIds: Set<string>,
): void {
	const checkRef = (ref: unknown, name: string) => {
		if (typeof ref === "string" && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(ref)) {
			if (!nodeIds.has(ref)) {
				addError(state, name + " references non-existent node: " + ref, ref);
			}
		}
	};

	for (const node of nodes) {
		if (!isRecord(node.expr)) continue;
		const expr = node.expr;
		const kind = expr.kind;

		switch (kind) {
		case "spawn":
			if (typeof expr.task === "string") checkRef(expr.task, "spawn.task");
			break;
		case "await":
			if (typeof expr.future === "string") checkRef(expr.future, "await.future");
			break;
		case "par": {
			const branches = expr.branches;
			if (Array.isArray(branches)) {
				for (let i = 0; i < branches.length; i++) {
					const b = branches[i];
					if (typeof b === "string") {
						checkRef(b, "par.branches[" + String(i) + "]");
					}
				}
			}
			break;
		}
		case "channel":
			// channel has no node references (channelType and bufferSize are not node refs)
			break;
		case "send":
			if (typeof expr.channel === "string") checkRef(expr.channel, "send.channel");
			if (typeof expr.value === "string") checkRef(expr.value, "send.value");
			break;
		case "recv":
			if (typeof expr.channel === "string") checkRef(expr.channel, "recv.channel");
			break;
		case "select": {
			const futures = expr.futures;
			if (Array.isArray(futures)) {
				for (let i = 0; i < futures.length; i++) {
					const f = futures[i];
					if (typeof f === "string") {
						checkRef(f, "select.futures[" + String(i) + "]");
					}
				}
			}
			break;
		}
		case "race": {
			const tasks = expr.tasks;
			if (Array.isArray(tasks)) {
				for (let i = 0; i < tasks.length; i++) {
					const t = tasks[i];
					if (typeof t === "string") {
						checkRef(t, "race.tasks[" + String(i) + "]");
					}
				}
			}
			break;
		}
		}
	}
}

//==============================================================================
// Shared Semantic Validation
//==============================================================================

/**
 * Run all semantic validation checks on a parsed document.
 * Used by all 4 layer validators after Zod structural validation.
 */
function semanticValidateDocument<T extends { nodes: { id: string; expr?: unknown; blocks?: unknown; entry?: unknown }[]; result: string }>(
	doc: T,
	options?: {
		checkAcyclic?: boolean;
		collectLambdaParams?: boolean;
		checkEirRefs?: boolean;
		checkBlockReachability?: boolean;
		checkPhiPredecessors?: boolean;
		checkAsyncRefs?: boolean;
	},
): ValidationResult<T> {
	const state: ValidationState = { errors: [], path: [] };

	// 1. Check for duplicate node IDs
	const nodeIds = checkDuplicateNodeIds(state, doc.nodes);

	// 2. Check result references a valid node
	checkResultNodeExists(state, doc.result, nodeIds);

	// 3. Check CFG block nodes (duplicate block IDs, entry references, CFG targets)
	checkBlockNodeCFG(state, doc.nodes);

	// 4. Acyclic reference checking (AIR and CIR only)
	if (options?.checkAcyclic) {
		const lambdaParamsSet = options.collectLambdaParams
			? collectAllParamsAndBindings(doc.nodes)
			: undefined;
		checkAcyclicRefs(state, doc.nodes, lambdaParamsSet);
	}

	// 5. EIR expression node reference checking
	if (options?.checkEirRefs) {
		checkEirNodeReferences(state, doc.nodes, nodeIds);
	}

	// 6. Block reachability checking
	if (options?.checkBlockReachability) {
		checkBlockReachability(state, doc.nodes);
	}

	// 7. Phi predecessor checking
	if (options?.checkPhiPredecessors) {
		checkPhiPredecessors(state, doc.nodes);
	}

	// 8. Async expression node reference checking
	if (options?.checkAsyncRefs) {
		checkAsyncNodeReferences(state, doc.nodes, nodeIds);
	}

	if (state.errors.length > 0) {
		return invalidResult<T>(state.errors);
	}

	return validResult(doc);
}

//==============================================================================
// Public Validators
//==============================================================================

export function validateAIR(doc: unknown): ValidationResult<AIRDocument> {
	// Phase 1: Structural validation via Zod
	const parsed = AIRDocumentSchema.safeParse(doc);
	if (!parsed.success) {
		return invalidResult<AIRDocument>(zodToValidationErrors(parsed.error));
	}

	// Phase 2: Semantic validation on typed data
	return semanticValidateDocument(parsed.data, { checkAcyclic: true });
}

export function validateCIR(doc: unknown): ValidationResult<CIRDocument> {
	// Phase 1: Structural validation via Zod
	const parsed = CIRDocumentSchema.safeParse(doc);
	if (!parsed.success) {
		return invalidResult<CIRDocument>(zodToValidationErrors(parsed.error));
	}

	// Phase 2: Semantic validation on typed data
	return semanticValidateDocument(parsed.data, { checkAcyclic: true, collectLambdaParams: true });
}

export function validateEIR(doc: unknown): ValidationResult<EIRDocument> {
	// Phase 1: Structural validation via Zod
	const parsed = EIRDocumentSchema.safeParse(doc);
	if (!parsed.success) {
		return invalidResult<EIRDocument>(zodToValidationErrors(parsed.error));
	}

	// Phase 2: Semantic validation on typed data
	return semanticValidateDocument(parsed.data, { checkEirRefs: true, checkAsyncRefs: true, checkBlockReachability: true });
}

export function validateLIR(doc: unknown): ValidationResult<LIRDocument> {
	// Phase 1: Structural validation via Zod
	const parsed = LIRDocumentSchema.safeParse(doc);
	if (!parsed.success) {
		return invalidResult<LIRDocument>(zodToValidationErrors(parsed.error));
	}

	// Phase 2: Semantic validation on typed data
	return semanticValidateDocument(parsed.data, { checkBlockReachability: true, checkPhiPredecessors: true });
}

