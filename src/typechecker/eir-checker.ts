// EIR per-kind type checkers extracted from typeCheckEIRNode

import { SPIRALError } from "../errors.ts";
import { lookupType } from "../env.ts";
import type {
	EirHybridNode, Expr, Type, EirExpr,
	EirSeqExpr, EirAssignExpr, EirWhileExpr,
	EirForExpr, EirIterExpr, EirEffectExpr,
	EirRefCellExpr, EirDerefExpr, EirTryExpr,
} from "../types.ts";
import { isBlockNode, isRefNode } from "../types.ts";
import {
	boolType,
	intType,
	listType,
	refType,
	typeEqual,
	voidType,
} from "../types.ts";
import type { EIRCheckContext, TypeCheckResult } from "./context.ts";
import { typeCheckNode } from "./air-checker.ts";

/**
 * Type check a single EIR node.
 */
export function typeCheckEIRNode(
	ctx: EIRCheckContext,
	node: EirHybridNode,
): TypeCheckResult {
	if (isBlockNode(node)) {
		return { type: node.type ?? intType, env: ctx.env };
	}
	if (isRefNode(node)) {
		// RefNode (node-level $ref) - resolve and type-check the referenced target
		const refNode = ctx.nodeMap.get(node.$ref);
		if (!refNode) {
			throw SPIRALError.validation("$ref", "Referenced node not found: " + node.$ref);
		}
		return typeCheckEIRNode(ctx, refNode);
	}
	return dispatchEirExpr(ctx, node);
}

function dispatchEirExpr(
	ctx: EIRCheckContext,
	node: EirHybridNode & { expr: EirExpr },
): TypeCheckResult {
	const expr = node.expr;
	switch (expr.kind) {
	case "seq":
		return checkSeq(ctx, expr);
	case "assign":
		return checkAssign(ctx, expr);
	case "while":
		return checkWhile(ctx, expr);
	case "for":
		return checkFor(ctx, expr);
	case "iter":
		return checkIter(ctx, expr);
	case "effect":
		return checkEffect(ctx, expr);
	case "refCell":
		return checkRefCell(ctx, expr);
	case "deref":
		return checkDeref(ctx, expr);
	case "try":
		return checkTry(ctx, expr);
	default:
		return fallThroughToAIR(ctx, node, expr);
	}
}

function fallThroughToAIR(
	ctx: EIRCheckContext,
	node: EirHybridNode,
	expr: EirExpr,
): TypeCheckResult {
	// Handle RefNode (node-level $ref) - type is determined from the referenced node
	const nodeType = ("type" in node) ? node.type : undefined;
	const baseNode: EirHybridNode = nodeType
		? { id: node.id, type: nodeType, expr }
		: { id: node.id, expr };
	return typeCheckNode(
		{
			checker: ctx.checker,
			nodeMap: ctx.nodeMap,
			nodeTypes: ctx.nodeTypes,
			nodeEnvs: ctx.nodeEnvs,
			env: ctx.env,
			lambdaParams: ctx.lambdaParams,
			boundNodes: ctx.boundNodes,
			docDefs: ctx.docDefs,
		},
		baseNode,
	);
}

/** Resolve a string node ID, throwing if not found or not checked. */
function resolveStringNode(
	ctx: EIRCheckContext,
	ref: string,
	label: string,
): Type {
	if (!ctx.nodeMap.has(ref)) {
		throw SPIRALError.validation(label, ref + " not found");
	}
	const t = ctx.nodeTypes.get(ref);
	if (!t) {
		throw SPIRALError.validation(label, ref + " not yet type-checked");
	}
	return t;
}

function checkSeq(ctx: EIRCheckContext, expr: EirSeqExpr): TypeCheckResult {
	if (typeof expr.first === "string") {
		resolveStringNode(ctx, expr.first, "seq");
	}
	let thenType: Type | undefined;
	if (typeof expr.then === "string") {
		thenType = resolveStringNode(ctx, expr.then, "seq");
	}
	return { type: thenType ?? voidType, env: ctx.env };
}

function checkAssign(ctx: EIRCheckContext, expr: EirAssignExpr): TypeCheckResult {
	let valueType: Type | undefined;
	if (typeof expr.value === "string") {
		valueType = resolveStringNode(ctx, expr.value, "assign");
	}
	if (valueType) {
		ctx.mutableTypes.set(expr.target, valueType);
	}
	return { type: voidType, env: ctx.env };
}

function checkWhile(ctx: EIRCheckContext, expr: EirWhileExpr): TypeCheckResult {
	validateCondNode(ctx, expr.cond, "while");
	return { type: voidType, env: ctx.env };
}

function validateCondNode(
	ctx: EIRCheckContext,
	cond: string | Expr,
	label: string,
): void {
	if (typeof cond !== "string") return;
	if (!ctx.nodeMap.has(cond)) {
		throw SPIRALError.validation(label, "Condition node not found: " + cond);
	}
	const condType = ctx.nodeTypes.get(cond);
	if (condType && condType.kind !== "bool") {
		throw SPIRALError.typeError(boolType, condType, label + " condition");
	}
}

function validateNodeRef(
	ctx: EIRCheckContext,
	ref: string | Expr,
	label: string,
): void {
	if (typeof ref === "string" && !ctx.nodeMap.has(ref)) {
		throw SPIRALError.validation(label, "Node not found: " + ref);
	}
}

function checkFor(ctx: EIRCheckContext, expr: EirForExpr): TypeCheckResult {
	let initType: Type | undefined;
	if (typeof expr.init === "string") {
		validateNodeRef(ctx, expr.init, "for");
		initType = ctx.nodeTypes.get(expr.init);
	}
	validateCondNode(ctx, expr.cond, "for");
	validateNodeRef(ctx, expr.update, "for");
	validateNodeRef(ctx, expr.body, "for");
	if (initType) {
		ctx.mutableTypes.set(expr.var, initType);
	}
	return { type: voidType, env: ctx.env };
}

function checkIter(ctx: EIRCheckContext, expr: EirIterExpr): TypeCheckResult {
	let iterType: Type | undefined;
	if (typeof expr.iter === "string") {
		validateNodeRef(ctx, expr.iter, "iter");
		iterType = ctx.nodeTypes.get(expr.iter);
		if (iterType && iterType.kind !== "list") {
			throw SPIRALError.typeError(listType(intType), iterType, "iter iterable");
		}
	}
	validateNodeRef(ctx, expr.body, "iter");
	if (iterType?.kind === "list") {
		ctx.mutableTypes.set(expr.var, iterType.of);
	}
	return { type: voidType, env: ctx.env };
}

function checkEffect(ctx: EIRCheckContext, expr: EirEffectExpr): TypeCheckResult {
	const effect = ctx.effects.get(expr.op);
	if (!effect) {
		throw SPIRALError.validation("effect", "Unknown effect operation: " + expr.op);
	}
	if (effect.params.length !== expr.args.length) {
		throw SPIRALError.arityError(effect.params.length, expr.args.length, "effect:" + expr.op);
	}
	validateEffectArgs(ctx, expr.args, effect.params);
	return { type: effect.returns, env: ctx.env };
}

function validateEffectArgs(
	ctx: EIRCheckContext,
	args: (string | Expr)[],
	params: Type[],
): void {
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === undefined) continue;
		if (typeof arg !== "string") continue;
		validateSingleEffectArg({ ctx, arg, expected: params[i], index: i });
	}
}

interface EffectArgCheck {
	ctx: EIRCheckContext;
	arg: string;
	expected: Type | undefined;
	index: number;
}

function validateSingleEffectArg(input: EffectArgCheck): void {
	if (input.expected === undefined) {
		throw SPIRALError.validation("effect", "Missing parameter type at index " + input.index);
	}
	const argType = input.ctx.nodeTypes.get(input.arg);
	if (argType && !typeEqual(argType, input.expected)) {
		throw SPIRALError.typeError(input.expected, argType, "effect argument " + input.index);
	}
}

function resolveTarget(ctx: EIRCheckContext, target: string): Type | undefined {
	let t: Type | undefined = ctx.mutableTypes.get(target);
	if (ctx.nodeMap.has(target)) {
		t ??= ctx.nodeTypes.get(target);
	}
	t ??= lookupType(ctx.env, target);
	return t;
}

function checkRefCell(ctx: EIRCheckContext, expr: EirRefCellExpr): TypeCheckResult {
	const targetType = resolveTarget(ctx, expr.target);
	if (!targetType) {
		throw SPIRALError.unboundIdentifier(expr.target);
	}
	return { type: refType(targetType), env: ctx.env };
}

function checkDeref(ctx: EIRCheckContext, expr: EirDerefExpr): TypeCheckResult {
	const targetType = resolveTarget(ctx, expr.target);
	if (!targetType) {
		throw SPIRALError.unboundIdentifier(expr.target);
	}
	if (targetType.kind !== "ref") {
		throw SPIRALError.typeError(refType(intType), targetType, "deref target");
	}
	return { type: targetType.of, env: ctx.env };
}

function checkTry(ctx: EIRCheckContext, expr: EirTryExpr): TypeCheckResult {
	let tryBodyType: Type | undefined;
	if (typeof expr.tryBody === "string") {
		validateNodeRef(ctx, expr.tryBody, "try");
		tryBodyType = ctx.nodeTypes.get(expr.tryBody);
	}
	let catchBodyType: Type | undefined;
	if (typeof expr.catchBody === "string") {
		validateNodeRef(ctx, expr.catchBody, "try");
		catchBodyType = ctx.nodeTypes.get(expr.catchBody);
	}
	return { type: catchBodyType ?? tryBodyType ?? voidType, env: ctx.env };
}
