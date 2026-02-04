// EIR program evaluation

import {
	type Defs,
	extendValueEnv,
	lookupValue,
} from "../env.ts";
import { SPIRALError, ErrorCodes } from "../errors.ts";
import {
	type EIRDocument,
	type EirExpr,
	type EirHybridNode,
	type EvalState,
	type Expr,
	type Value,
	isBlockNode,
	isExprNode,
	isRefNode,
	voidVal,
	createEvalState,
	refCellVal,
} from "../types.ts";
import { errorVal, isError } from "../types.ts";
import type { OperatorRegistry } from "../domains/registry.ts";
import {
	emptyEffectRegistry,
	lookupEffect,
} from "../effects.ts";
import type { AirHybridNode } from "../types.ts";
import type { EIROptions, EIRNodeEvalResult, EirEvalCtx } from "./types.ts";
import { Evaluator } from "./helpers.ts";
import { evaluateBlockNode } from "./block-eval.ts";
import { evalNode } from "./air-node.ts";
import { evalExprInline } from "./air-expr.ts";
import { evalEirWhile } from "./eir-loop.ts";
import { evalEirFor } from "./eir-loop.ts";
import { evalEirIter } from "./eir-loop.ts";
import { evalEirTry } from "./eir-try.ts";
import { transpileImports } from "../desugar/transpile-imports.ts";

export type { EIROptions };

//==============================================================================
// EIR Expression Kind Detection
//==============================================================================

const EIR_EXPRESSION_KINDS = new Set(["seq", "assign", "while", "for", "iter", "effect", "refCell", "deref", "try"]);

function isCirExpr(expr: EirExpr): expr is Expr {
	return !EIR_EXPRESSION_KINDS.has(expr.kind);
}

//==============================================================================
// evaluateEIR - public entry point
//==============================================================================

interface EirArgs {
	doc: EIRDocument;
	registry: OperatorRegistry;
	defs: Defs;
	inputs?: Map<string, Value> | undefined;
	options?: EIROptions | undefined;
}

/** Evaluate an EIR program with mutable state and effects. */
export function evaluateEIR(
	...params: [EIRDocument, OperatorRegistry, Defs, Map<string, Value>?, EIROptions?]
): { result: Value; state: EvalState } {
	// Transpile $imports to $defs first
	const withDefs = transpileImports(params[0]);
	const args: EirArgs = { doc: withDefs, registry: params[1], defs: params[2], inputs: params[3], options: params[4] };
	const ctx = buildEirCtx(args);
	return runEirProgram(args.doc, ctx, args.inputs);
}

function buildEirCtx(args: EirArgs): EirEvalCtx {
	const nodeMap = new Map<string, EirHybridNode>();
	for (const node of args.doc.nodes) nodeMap.set(node.id, node);
	return {
		registry: args.registry, defs: args.defs,
		effectRegistry: args.options?.effects ?? emptyEffectRegistry(),
		nodeMap,
		nodeValues: new Map<string, Value>(),
		state: createEvalState(),
		options: args.options,
	};
}

function runEirProgram(
	doc: EIRDocument,
	ctx: EirEvalCtx,
	inputs?: Map<string, Value>,
): { result: Value; state: EvalState } {
	if (inputs) ctx.state = createEvalState(inputs);
	if (ctx.options?.maxSteps) ctx.state.maxSteps = ctx.options.maxSteps;
	evalAllNodes(doc, ctx);
	return resolveEirResult(doc, ctx);
}

function evalAllNodes(doc: EIRDocument, ctx: EirEvalCtx): void {
	for (const node of doc.nodes) {
		const result = evalEIRNode(ctx, node);
		ctx.nodeValues.set(node.id, result.value);
		ctx.state.env = result.env;
	}
}

function resolveEirResult(doc: EIRDocument, ctx: EirEvalCtx): { result: Value; state: EvalState } {
	const resultValue = ctx.nodeValues.get(doc.result);
	if (resultValue) return { result: resultValue, state: ctx.state };
	const resultNode = ctx.nodeMap.get(doc.result);
	if (resultNode) return { result: evalEIRNode(ctx, resultNode).value, state: ctx.state };
	return { result: errorVal(ErrorCodes.DomainError, "Result node not evaluated: " + doc.result), state: ctx.state };
}

//==============================================================================
// evalEIRNode
//==============================================================================

export function evalEIRNode(ctx: EirEvalCtx, node: EirHybridNode): EIRNodeEvalResult {
	ctx.state.steps++;
	if (ctx.state.steps > ctx.state.maxSteps) {
		return eirResult(errorVal(ErrorCodes.NonTermination, "Evaluation exceeded maximum steps"), ctx);
	}
	if (isBlockNode(node)) {
		const result = evaluateBlockNode(node, { registry: ctx.registry, nodeValues: ctx.nodeValues, options: ctx.options }, ctx.state.env);
		return eirResult(result, ctx);
	}
	if (isRefNode(node)) {
		// RefNode (node-level $ref) - resolve and evaluate the referenced node
		const refNode = ctx.nodeMap.get(node.$ref);
		if (!refNode) {
			return eirResult(errorVal(ErrorCodes.DomainError, "Referenced node not found: " + node.$ref), ctx);
		}
		return evalEIRNode(ctx, refNode);
	}
	if (!isExprNode(node)) {
		return eirResult(errorVal(ErrorCodes.DomainError, "Invalid node type"), ctx);
	}
	const expr = node.expr;
	if (isCirExpr(expr)) return evalCirInEir(ctx, node.id, expr);
	return evalEIRExpr(ctx, expr);
}

function evalCirInEir(ctx: EirEvalCtx, nodeId: string, expr: Expr): EIRNodeEvalResult {
	const evaluator = new Evaluator(ctx.registry, ctx.defs);
	const cirNode: AirHybridNode = { id: nodeId, expr };
	const cirNodeMap = buildCirNodeMap(ctx);
	const cirResult = evalNode(
		{ evaluator, registry: ctx.registry, defs: ctx.defs, nodeMap: cirNodeMap, nodeValues: ctx.nodeValues, options: ctx.options },
		cirNode,
		ctx.state.env,
	);
	return { value: cirResult.value, env: cirResult.env, refCells: ctx.state.refCells };
}

function buildCirNodeMap(ctx: EirEvalCtx): Map<string, AirHybridNode> {
	const cirNodeMap = new Map<string, AirHybridNode>();
	for (const [id, n] of ctx.nodeMap) {
		if (isExprNode(n) && isCirExpr(n.expr)) {
			cirNodeMap.set(id, { id: n.id, expr: n.expr });
		}
	}
	return cirNodeMap;
}

//==============================================================================
// evalEIRExpr - dispatch
//==============================================================================

export function evalEIRExpr(ctx: EirEvalCtx, expr: EirExpr): EIRNodeEvalResult {
	switch (expr.kind) {
	case "seq":
		return evalSeq(ctx, expr);
	case "assign":
		return evalAssign(ctx, expr);
	case "while":
		return evalEirWhile(ctx, expr);
	case "for":
		return evalEirFor(ctx, expr);
	case "iter":
		return evalEirIter(ctx, expr);
	case "effect":
		return evalEffect(ctx, expr);
	case "refCell":
		return evalRefCell(ctx, expr);
	case "deref":
		return evalDeref(ctx, expr);
	case "try":
		return evalEirTry(ctx, expr);
	default:
		return eirResult(errorVal(ErrorCodes.ValidationError, "Unknown EIR expression kind: " + expr.kind), ctx);
	}
}

//==============================================================================
// seq / assign / effect / refCell / deref handlers
//==============================================================================

function evalSeq(ctx: EirEvalCtx, expr: EirExpr & { kind: "seq" }): EIRNodeEvalResult {
	const firstResult = evalSeqPart(ctx, expr.first);
	if (isError(firstResult.value)) return firstResult;
	if (firstResult.refCells) ctx.state.refCells = firstResult.refCells;
	const thenResult = evalSeqPart(ctx, expr.then);
	if (thenResult.refCells) ctx.state.refCells = thenResult.refCells;
	return { value: thenResult.value, env: thenResult.env, refCells: ctx.state.refCells };
}

export function evalSeqPart(ctx: EirEvalCtx, part: string | Expr): EIRNodeEvalResult {
	if (typeof part === "string") {
		const partNode = ctx.nodeMap.get(part);
		if (!partNode) return eirResult(errorVal(ErrorCodes.DomainError, "Node not found: " + part), ctx);
		return evalEIRNode(ctx, partNode);
	}
	const value = evalExprInline(ctx, part, ctx.state.env);
	return { value, env: ctx.state.env, refCells: ctx.state.refCells };
}

function evalAssign(ctx: EirEvalCtx, expr: EirExpr & { kind: "assign" }): EIRNodeEvalResult {
	const valueValue = resolveAssignValue(ctx, expr.value);
	if (isError(valueValue)) return eirResult(valueValue, ctx);
	const newEnv = extendValueEnv(ctx.state.env, expr.target, valueValue);
	ctx.state.env = newEnv;
	return { value: voidVal(), env: newEnv, refCells: ctx.state.refCells };
}

function resolveAssignValue(ctx: EirEvalCtx, value: string | Expr): Value {
	if (typeof value !== "string") {
		return evalExprInline(ctx, value, ctx.state.env);
	}
	const node = ctx.nodeMap.get(value);
	if (!node) return errorVal(ErrorCodes.DomainError, "Value node not found: " + value);
	ctx.nodeValues.delete(value);
	const result = evalEIRNode(ctx, node);
	if (!isError(result.value)) ctx.nodeValues.set(value, result.value);
	return result.value;
}

function evalEffect(ctx: EirEvalCtx, expr: EirExpr & { kind: "effect" }): EIRNodeEvalResult {
	const effectOp = lookupEffect(ctx.effectRegistry, expr.op);
	if (!effectOp) return eirResult(errorVal(ErrorCodes.UnknownOperator, "Unknown effect operation: " + expr.op), ctx);
	const argValues = resolveEffectArgs(ctx, expr.args);
	if (!Array.isArray(argValues)) return eirResult(argValues, ctx);
	if (effectOp.params.length !== argValues.length) {
		return eirResult(errorVal(ErrorCodes.ArityError, `Effect ${expr.op} expects ${effectOp.params.length} args, got ${argValues.length}`), ctx);
	}
	ctx.state.effects.push({ op: expr.op, args: argValues });
	return executeEffect(ctx, effectOp, argValues);
}

function resolveEffectArgs(ctx: EirEvalCtx, args: (string | Expr)[]): Value[] | Value {
	const values: Value[] = [];
	for (const arg of args) {
		const val = resolveOneEffectArg(ctx, arg);
		if (isError(val)) return val;
		values.push(val);
	}
	return values;
}

function resolveOneEffectArg(ctx: EirEvalCtx, arg: string | Expr): Value {
	if (typeof arg !== "string") return evalExprInline(ctx, arg, ctx.state.env);
	const node = ctx.nodeMap.get(arg);
	if (!node) return errorVal(ErrorCodes.DomainError, "Argument node not found: " + arg);
	return evalEIRNode(ctx, node).value;
}

function executeEffect(
	ctx: EirEvalCtx,
	effectOp: { fn: (...args: Value[]) => Value },
	argValues: Value[],
): EIRNodeEvalResult {
	try {
		return { value: effectOp.fn(...argValues), env: ctx.state.env, refCells: ctx.state.refCells };
	} catch (err: unknown) {
		if (err instanceof SPIRALError) return eirResult(err.toValue(), ctx);
		return eirResult(errorVal(ErrorCodes.DomainError, String(err)), ctx);
	}
}

function evalRefCell(ctx: EirEvalCtx, expr: EirExpr & { kind: "refCell" }): EIRNodeEvalResult {
	const existing = lookupValue(ctx.state.env, expr.target);
	if (existing) {
		const cellId = expr.target + "_ref";
		ctx.state.refCells.set(cellId, existing);
		return { value: refCellVal(existing), env: ctx.state.env, refCells: ctx.state.refCells };
	}
	return eirResult(errorVal(ErrorCodes.UnboundIdentifier, "Cannot create ref cell for unbound identifier: " + expr.target), ctx);
}

function evalDeref(ctx: EirEvalCtx, expr: EirExpr & { kind: "deref" }): EIRNodeEvalResult {
	const cellId = expr.target + "_ref";
	const cellValue = ctx.state.refCells.get(cellId);
	if (cellValue === undefined) {
		return eirResult(errorVal(ErrorCodes.DomainError, "Reference cell not found: " + expr.target), ctx);
	}
	return { value: cellValue, env: ctx.state.env, refCells: ctx.state.refCells };
}

//==============================================================================
// Helper
//==============================================================================

export function eirResult(value: Value, ctx: EirEvalCtx): EIRNodeEvalResult {
	return { value, env: ctx.state.env, refCells: ctx.state.refCells };
}
