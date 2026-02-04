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
 * Documents are loaded in order — later documents can use operators from earlier ones.
 */
export function loadStdlib(
	kernelRegistry: OperatorRegistry,
	stdlibPaths: string[],
): OperatorRegistry {
	let registry = kernelRegistry;
	const defs = emptyDefs();
	for (const path of stdlibPaths) {
		registry = loadSingleStdlib(path, registry, defs);
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

function loadSingleStdlib(path: string, registry: OperatorRegistry, defs: Defs): OperatorRegistry {
	const doc = parseAndValidate(path);
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
