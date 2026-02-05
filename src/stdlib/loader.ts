// SPIRAL Stdlib Loader
// Loads CIR documents as stdlib, extracts closures, wraps as operators.

import { readFileSync } from "node:fs";
import { type Defs, type ValueEnv, emptyDefs, emptyValueEnv } from "../env.ts";
import {
	type CIRDocument,
	type AirHybridNode,
	type ClosureVal,
	type Value,
	isError,
	intType,
	boolType,
	floatType,
	stringType,
	listType,
	mapType,
	errorVal,
	ErrorCodes,
} from "../types.ts";
import {
	type Operator,
	type OperatorRegistry,
	registerOperator,
} from "../domains/registry.ts";
import { validateCIR } from "../validator.ts";
import { computeBoundNodes, type ProgramCtx, Evaluator } from "../evaluator/air-program.ts";
import { evalNode } from "../evaluator/air-node.ts";
import { evalExprWithNodeMap, buildClosureEnv } from "../evaluator/air-expr.ts";
import type { AirEvalCtx } from "../evaluator/types.ts";

//==============================================================================
// Public API
//==============================================================================

/**
 * Load stdlib CIR documents and register their operators.
 * Uses two-phase loading to handle forward references:
 * - Phase 1: Extract operator signatures from all files (no evaluation)
 * - Phase 2: Evaluate all files and register actual closures
 *
 * Documents can now reference operators defined later in the same file or in later files.
 */
export function loadStdlib(
	kernelRegistry: OperatorRegistry,
	stdlibPaths: string[],
): OperatorRegistry {
	// Phase 1: Parse all files and extract operator signatures
	const phase1Result = loadPhase1(kernelRegistry, stdlibPaths);

	// Phase 2: Evaluate all files and register actual closures
	return loadPhase2(phase1Result);
}

interface Phase1Result {
	registry: OperatorRegistry;
	defs: Defs;
	parsedDocs: { path: string; doc: CIRDocument }[];
}

/**
 * Phase 1: Parse all files and extract operator signatures.
 * This builds a complete registry of all available operators without evaluating any bodies.
 */
function loadPhase1(
	kernelRegistry: OperatorRegistry,
	stdlibPaths: string[],
): Phase1Result {
	let registry = kernelRegistry;
	const defs = emptyDefs();
	const parsedDocs: { path: string; doc: CIRDocument }[] = [];

	for (const path of stdlibPaths) {
		const doc = parseAndValidate(path);
		parsedDocs.push({ path, doc });

		// Extract operator signatures from exports without evaluating
		const resultNode = doc.nodes.find(n => n.id === doc.result);
		if (!resultNode || !("expr" in resultNode) || resultNode.expr.kind !== "record") {
			throw new Error(`Stdlib result must be a record expression in ${path}`);
		}

		// Register stub operators for each export
		for (const field of resultNode.expr.fields) {
			const qualifiedName = field.key;
			const colonIdx = qualifiedName.indexOf(":");
			if (colonIdx === -1) continue;

			// Register a placeholder operator that will be replaced in phase 2
			registry = registerOperator(registry, {
				ns: qualifiedName.slice(0, colonIdx),
				name: qualifiedName.slice(colonIdx + 1),
				params: [intType], // Placeholder params, will be updated in phase 2
				returns: intType,
				pure: true,
				fn: () => {
					throw new Error(`Operator ${qualifiedName} called before phase 2 initialization`);
				},
			});
		}
	}

	return { registry, defs, parsedDocs };
}

/**
 * Phase 2: Evaluate all documents and register actual closures.
 * Now all operators are registered, so evaluation can succeed with forward references.
 */
function loadPhase2(ctx: Phase1Result): OperatorRegistry {
	const { defs, parsedDocs } = ctx;
	let { registry } = ctx;

	for (const { path, doc } of parsedDocs) {
		registry = loadSingleStdlibWithFullRegistry(path, doc, registry, defs);
	}

	return registry;
}

//==============================================================================
// Internal — Document evaluation
//==============================================================================

interface StdlibEvalResult {
	result: Value;
	nodeMap: Map<string, AirHybridNode>;
	nodeValues: Map<string, Value>;
}

function buildDocContext(doc: CIRDocument, registry: OperatorRegistry, defs: Defs): ProgramCtx {
	const nodeMap = new Map<string, AirHybridNode>();
	for (const node of doc.nodes) nodeMap.set(node.id, node);
	const nodeValues = new Map<string, Value>();
	const evaluator = new Evaluator(registry, defs);
	return { evaluator, registry, defs, nodeMap, nodeValues, options: undefined };
}

function evaluateDocNodes(ctx: ProgramCtx, doc: CIRDocument): { env: ValueEnv } {
	const boundNodes = computeBoundNodes(doc, ctx.nodeMap);
	let env = emptyValueEnv();
	for (const node of doc.nodes) {
		if (boundNodes.has(node.id)) continue;
		const result = evalNode(ctx, node, env);
		ctx.nodeValues.set(node.id, result.value);
		if (isError(result.value)) return { env };
		env = result.env;
	}
	return { env };
}

function resolveDocResult(ctx: ProgramCtx, doc: CIRDocument, env: ValueEnv): Value {
	const cached = ctx.nodeValues.get(doc.result);
	if (cached) return cached;
	const resultNode = ctx.nodeMap.get(doc.result);
	if (resultNode) return evalNode(ctx, resultNode, env).value;
	return errorVal(ErrorCodes.DomainError, "Result node not found: " + doc.result);
}

function evaluateStdlibDoc(doc: CIRDocument, registry: OperatorRegistry, defs: Defs): StdlibEvalResult {
	const ctx = buildDocContext(doc, registry, defs);
	const { env } = evaluateDocNodes(ctx, doc);
	const result = resolveDocResult(ctx, doc, env);
	return { result, nodeMap: ctx.nodeMap, nodeValues: ctx.nodeValues };
}

//==============================================================================
// Internal — Single stdlib loading
//==============================================================================

function parseAndValidate(path: string): CIRDocument {
	const json = readFileSync(path, "utf-8");
	const doc: unknown = JSON.parse(json);
	const validation = validateCIR(doc);
	if (!validation.valid || !validation.value) {
		throw new Error(`Stdlib validation failed for ${path}: ${validation.errors.map(e => e.message).join("; ")}`);
	}
	return validation.value;
}

interface ExtractCtx { registry: OperatorRegistry; defs: Defs; path: string }

function extractOperators(evalResult: StdlibEvalResult, ctx: ExtractCtx): OperatorRegistry {
	const { result, nodeMap, nodeValues } = evalResult;
	if (isError(result)) throw new Error(`Stdlib evaluation failed for ${ctx.path}: ${result.message ?? result.code}`);
	if (result.kind !== "map") throw new Error(`Stdlib result must be a map, got: ${result.kind} (${ctx.path})`);
	let { registry } = ctx;
	for (const [hash, value] of result.value) {
		if (!hash.startsWith("s:")) continue;
		const stdCtx = { registry, defs: ctx.defs, nodeMap, nodeValues, path: ctx.path };
		const op = parseAndWrapOperator(hash.slice(2), value, stdCtx);
		registry = registerOperator(registry, op);
	}
	return registry;
}

/**
 * Load a single stdlib document with a pre-parsed document.
 * Used in Phase 2 when we have the full registry available.
 */
function loadSingleStdlibWithFullRegistry(
	path: string,
	doc: CIRDocument,
	registry: OperatorRegistry,
	defs: Defs,
): OperatorRegistry {
	const evalResult = evaluateStdlibDoc(doc, registry, defs);
	return extractOperators(evalResult, { registry, defs, path });
}

//==============================================================================
// Closure → Operator wrapping
//==============================================================================

interface StdlibCtx {
	registry: OperatorRegistry;
	defs: Defs;
	nodeMap: Map<string, AirHybridNode>;
	nodeValues: Map<string, Value>;
}

function parseAndWrapOperator(qualifiedName: string, value: Value, ctx: StdlibCtx & { path?: string }): Operator {
	const colonIdx = qualifiedName.indexOf(":");
	if (colonIdx === -1) throw new Error(`Invalid operator key "${qualifiedName}" — expected "ns:name" (${ctx.path})`);
	// For literals (constants), wrap in a nullary operator that returns the literal
	if (value.kind !== "closure") {
		return wrapLiteralAsOperator({ ns: qualifiedName.slice(0, colonIdx), name: qualifiedName.slice(colonIdx + 1) }, value);
	}
	return wrapClosureAsOperator({ ns: qualifiedName.slice(0, colonIdx), name: qualifiedName.slice(colonIdx + 1) }, value, ctx);
}

function wrapLiteralAsOperator(_id: { ns: string; name: string }, literal: Value): Operator {
	// Map value kinds to their corresponding types
	const returns = literal.kind === "int" ? intType
		: literal.kind === "bool" ? boolType
			: literal.kind === "float" ? floatType
				: literal.kind === "string" ? stringType
					: literal.kind === "list" ? listType(intType)
						: literal.kind === "map" ? mapType(stringType, intType)
							: intType; // Fallback

	return {
		ns: _id.ns, name: _id.name,
		params: [],
		returns,
		pure: true,
		fn: () => literal,
	};
}

function wrapClosureAsOperator(id: { ns: string; name: string }, closure: ClosureVal, ctx: StdlibCtx): Operator {
	return {
		ns: id.ns, name: id.name,
		params: closure.params.map(p => p.type ?? intType),
		returns: intType,
		pure: true,
		fn: (...args: Value[]) => applyStdlibClosure(closure, args, ctx),
	};
}

function applyStdlibClosure(closure: ClosureVal, args: Value[], ctx: StdlibCtx): Value {
	const airCtx: AirEvalCtx = {
		registry: ctx.registry,
		defs: ctx.defs,
		nodeMap: ctx.nodeMap,
		nodeValues: new Map(ctx.nodeValues),
		options: { maxSteps: 100000 },
	};
	const envResult = buildClosureEnv(airCtx, closure, args);
	if ("kind" in envResult) return envResult;
	return evalExprWithNodeMap(airCtx, closure.body, envResult);
}
