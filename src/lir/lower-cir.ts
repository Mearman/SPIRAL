// SPIRAL LIR Lowering - CIR expression handlers

import type { Expr, LirInstruction } from "../types.js";
import { isExprNode } from "../types.js";
import type { BlockResult, LowerParams } from "./lower-types.js";
import { freshBlock, addBlock, addSimpleBlock } from "./lower-types.js";
import type { LowerNodeFn } from "./lower.js";

//==============================================================================
// CIR Case Handlers
//==============================================================================

function lowerLit(
	p: LowerParams,
	expr: Expr & { kind: "lit" },
): BlockResult {
	addSimpleBlock(p, [
		{ kind: "assign", target: p.nodeId, value: expr },
	]);
	return { entry: p.currentBlock, exit: p.currentBlock };
}

function lowerRef(
	p: LowerParams,
	expr: Expr & { kind: "ref" },
): BlockResult {
	addSimpleBlock(p, [
		{
			kind: "assign",
			target: p.nodeId,
			value: { kind: "var", name: expr.id },
		},
	]);
	return { entry: p.currentBlock, exit: p.currentBlock };
}

interface ArgProcessCtx {
	p: LowerParams;
	index: number;
	out: LirInstruction[];
}

function processStringArg(ctx: ArgProcessCtx, arg: string): string {
	const argNode = ctx.p.ctx.nodeMap.get(arg);
	if (argNode && isExprNode(argNode) && argNode.expr.kind === "lit") {
		const name = `${ctx.p.nodeId}_arg${ctx.index}_lit`;
		ctx.out.push({ kind: "assign", target: name, value: argNode.expr });
		return name;
	}
	return arg;
}

function processInlineArg(ctx: ArgProcessCtx, arg: Expr): string {
	const name = `${ctx.p.nodeId}_arg${ctx.index}_inline`;
	ctx.out.push({ kind: "assign", target: name, value: arg });
	return name;
}

function buildCallArgs(
	p: LowerParams,
	expr: Expr & { kind: "call" },
	out: LirInstruction[],
): string[] {
	const args: string[] = [];
	for (let i = 0; i < expr.args.length; i++) {
		const arg = expr.args[i];
		if (arg === undefined) continue;
		const ctx: ArgProcessCtx = { p, index: i, out };
		if (typeof arg === "string") {
			args.push(processStringArg(ctx, arg));
		} else {
			args.push(processInlineArg(ctx, arg));
		}
	}
	return args;
}

function lowerCall(
	p: LowerParams,
	expr: Expr & { kind: "call" },
): BlockResult {
	const instructions: LirInstruction[] = [];
	const args = buildCallArgs(p, expr, instructions);

	instructions.push({
		kind: "op",
		target: p.nodeId,
		ns: expr.ns,
		name: expr.name,
		args,
	});

	addSimpleBlock(p, instructions);
	return { entry: p.currentBlock, exit: p.currentBlock };
}

/** Ids for if-expression branch blocks. */
interface IfBlockIds {
	thenId: string;
	elseId: string;
	mergeId: string;
}

interface IfBranchCtx {
	p: LowerParams;
	expr: Expr & { kind: "if" };
	lowerNode: LowerNodeFn;
}

function lowerIfBranches(ctx: IfBranchCtx, ids: IfBlockIds): void {
	const { p, expr, lowerNode } = ctx;
	const thenNode = p.ctx.nodeMap.get(expr.then);
	if (thenNode) {
		lowerNode({ node: thenNode, currentBlock: ids.thenId, ctx: p.ctx, nextBlock: ids.mergeId });
	}

	const elseNode = p.ctx.nodeMap.get(expr.else);
	if (elseNode) {
		lowerNode({ node: elseNode, currentBlock: ids.elseId, ctx: p.ctx, nextBlock: ids.mergeId });
	}

	if (!p.nextBlock) {
		addBlock(p.ctx, {
			id: ids.mergeId,
			instructions: [],
			terminator: { kind: "jump", to: ids.mergeId },
		});
	}
}

function lowerIf(
	p: LowerParams,
	expr: Expr & { kind: "if" },
	lowerNode: LowerNodeFn,
): BlockResult {
	const ids: IfBlockIds = {
		thenId: freshBlock(p.ctx),
		elseId: freshBlock(p.ctx),
		mergeId: p.nextBlock ?? freshBlock(p.ctx),
	};

	addBlock(p.ctx, {
		id: p.currentBlock,
		instructions: [],
		terminator: {
			kind: "branch",
			cond: expr.cond,
			then: ids.thenId,
			else: ids.elseId,
		},
	});

	lowerIfBranches({ p, expr, lowerNode }, ids);

	return { entry: p.currentBlock, exit: ids.mergeId };
}

function lowerLet(
	p: LowerParams,
	expr: Expr & { kind: "let" },
	lowerNode: LowerNodeFn,
): BlockResult {
	addBlock(p.ctx, {
		id: p.currentBlock,
		instructions: [
			{
				kind: "assign",
				target: p.nodeId,
				value: { kind: "var", name: expr.value },
			},
		],
		terminator: { kind: "jump", to: expr.body },
	});

	const bodyNode = p.ctx.nodeMap.get(expr.body);
	if (bodyNode) {
		return lowerNode({
			node: bodyNode,
			currentBlock: expr.body,
			ctx: p.ctx,
			nextBlock: p.nextBlock,
		});
	}
	return { entry: p.currentBlock, exit: p.currentBlock };
}

//==============================================================================
// CIR Dispatcher
//==============================================================================

/**
 * Lower a CIR expression (non-EIR).
 */
export function lowerCirExpr(
	p: LowerParams,
	expr: Expr,
	lowerNode: LowerNodeFn,
): BlockResult {
	switch (expr.kind) {
	case "lit":
		return lowerLit(p, expr);
	case "var":
		addSimpleBlock(p, []);
		return { entry: p.currentBlock, exit: p.currentBlock };
	case "ref":
		return lowerRef(p, expr);
	case "call":
		return lowerCall(p, expr);
	case "if":
		return lowerIf(p, expr, lowerNode);
	case "let":
		return lowerLet(p, expr, lowerNode);
	default:
		break;
	}

	addSimpleBlock(p, []);
	return { entry: p.currentBlock, exit: p.currentBlock };
}
