// SPIRAL LIR Lowering - EIR expression handlers

import type {
	EirAssignExpr,
	EirDerefExpr,
	EirEffectExpr,
	EirForExpr,
	EirIterExpr,
	EirRefCellExpr,
	EirSeqExpr,
	EirTryExpr,
	EirWhileExpr,
} from "../types.ts";
import type { BlockResult, LowerParams, LoweringContext } from "./lower-types.ts";
import { freshBlock, addBlock, asStringRef, validationError } from "./lower-types.ts";
import type { LowerNodeFn } from "./lower.ts";

/** EIR-only expression type (excludes base Expr) */
export type EirOnlyExpr =
	| EirSeqExpr | EirAssignExpr | EirWhileExpr | EirForExpr
	| EirIterExpr | EirEffectExpr | EirRefCellExpr | EirDerefExpr | EirTryExpr;

const EIR_KINDS = new Set([
	"seq", "assign", "while", "for",
	"iter", "effect", "refCell", "deref", "try",
]);

/** Type guard: checks if an expression is EIR-specific */
export function isEirOnlyExpr(
	expr: { kind: string },
): expr is EirOnlyExpr {
	return EIR_KINDS.has(expr.kind);
}

//==============================================================================
// Shared Helpers
//==============================================================================

/** Context for lowering a node reference to a block. */
interface NodeRefCtx {
	ctx: LoweringContext;
	ref: string;
	blockId: string;
	nextId: string;
}

/** Lower a node ref or emit a fallback jump block. */
function lowerOrJump(nrc: NodeRefCtx, lowerNode: LowerNodeFn): void {
	const node = nrc.ctx.nodeMap.get(nrc.ref);
	if (node) {
		lowerNode({ node, currentBlock: nrc.blockId, ctx: nrc.ctx, nextBlock: nrc.nextId });
	} else {
		addBlock(nrc.ctx, {
			id: nrc.blockId,
			instructions: [],
			terminator: { kind: "jump", to: nrc.nextId },
		});
	}
}

/** Add an exit block with return terminator if no nextBlock. */
function addExitIfNeeded(p: LowerParams, exitId: string): void {
	if (!p.nextBlock) {
		addBlock(p.ctx, {
			id: exitId,
			instructions: [],
			terminator: { kind: "return" },
		});
	}
}

/** Build a simple terminator based on nextBlock. */
function simpleTerminator(p: LowerParams): { kind: "jump"; to: string } | { kind: "return" } {
	return p.nextBlock
		? { kind: "jump", to: p.nextBlock }
		: { kind: "return" };
}

/** Parameters for a branch header block. */
interface BranchHeaderParams {
	id: string;
	cond: string;
	thenId: string;
	elseId: string;
}

/** Add a branch header block. */
function addBranchHeader(ctx: LoweringContext, bh: BranchHeaderParams): void {
	addBlock(ctx, {
		id: bh.id,
		instructions: [],
		terminator: { kind: "branch", cond: bh.cond, then: bh.thenId, else: bh.elseId },
	});
}

//==============================================================================
// EIR Case Handlers
//==============================================================================

function lowerSeq(
	p: LowerParams,
	expr: EirSeqExpr,
	lowerNode: LowerNodeFn,
): BlockResult {
	const firstRef = asStringRef(expr.first);
	const thenRef = asStringRef(expr.then);

	const firstNode = p.ctx.nodeMap.get(firstRef);
	if (!firstNode) validationError("First node not found: " + firstRef);

	const midBlock = freshBlock(p.ctx);
	lowerNode({ node: firstNode, currentBlock: p.currentBlock, ctx: p.ctx, nextBlock: midBlock });

	const thenNode = p.ctx.nodeMap.get(thenRef);
	if (!thenNode) validationError("Then node not found: " + thenRef);

	return lowerNode({ node: thenNode, currentBlock: midBlock, ctx: p.ctx, nextBlock: p.nextBlock });
}

function lowerAssign(p: LowerParams, expr: EirAssignExpr): BlockResult {
	addBlock(p.ctx, {
		id: p.currentBlock,
		instructions: [{
			kind: "assign",
			target: expr.target,
			value: { kind: "var", name: asStringRef(expr.value) },
		}],
		terminator: simpleTerminator(p),
	});
	return { entry: p.currentBlock, exit: p.currentBlock };
}

function lowerWhile(
	p: LowerParams,
	expr: EirWhileExpr,
	lowerNode: LowerNodeFn,
): BlockResult {
	const condRef = asStringRef(expr.cond);
	const bodyRef = asStringRef(expr.body);
	const headerId = freshBlock(p.ctx);
	const bodyId = freshBlock(p.ctx);
	const exitId = p.nextBlock ?? freshBlock(p.ctx);

	addBlock(p.ctx, {
		id: p.currentBlock,
		instructions: [],
		terminator: { kind: "jump", to: headerId },
	});
	addBranchHeader(p.ctx, { id: headerId, cond: condRef, thenId: bodyId, elseId: exitId });
	lowerWhileBody({ ctx: p.ctx, ref: bodyRef, blockId: bodyId, nextId: headerId }, lowerNode);
	addExitIfNeeded(p, exitId);

	return { entry: p.currentBlock, exit: exitId };
}

function lowerWhileBody(nrc: NodeRefCtx, lowerNode: LowerNodeFn): void {
	const bodyNode = nrc.ctx.nodeMap.get(nrc.ref);
	if (!bodyNode) {
		addBlock(nrc.ctx, { id: nrc.blockId, instructions: [], terminator: { kind: "jump", to: nrc.nextId } });
		return;
	}
	lowerNode({ node: bodyNode, currentBlock: nrc.blockId, ctx: nrc.ctx, nextBlock: nrc.nextId });
	const bodyBlock = nrc.ctx.blocks.find((b) => b.id === nrc.blockId);
	if (bodyBlock && bodyBlock.terminator.kind !== "jump") {
		bodyBlock.terminator = { kind: "jump", to: nrc.nextId };
	}
}

function lowerFor(
	p: LowerParams,
	expr: EirForExpr,
	lowerNode: LowerNodeFn,
): BlockResult {
	const refs = {
		init: asStringRef(expr.init),
		cond: asStringRef(expr.cond),
		update: asStringRef(expr.update),
		body: asStringRef(expr.body),
	};
	const ids = {
		header: freshBlock(p.ctx),
		body: freshBlock(p.ctx),
		update: freshBlock(p.ctx),
		exit: p.nextBlock ?? freshBlock(p.ctx),
	};

	lowerOrJump({ ctx: p.ctx, ref: refs.init, blockId: p.currentBlock, nextId: ids.header }, lowerNode);
	addBranchHeader(p.ctx, { id: ids.header, cond: refs.cond, thenId: ids.body, elseId: ids.exit });
	lowerOrJump({ ctx: p.ctx, ref: refs.body, blockId: ids.body, nextId: ids.update }, lowerNode);
	lowerOrJump({ ctx: p.ctx, ref: refs.update, blockId: ids.update, nextId: ids.header }, lowerNode);
	addExitIfNeeded(p, ids.exit);

	return { entry: p.currentBlock, exit: ids.exit };
}

function lowerIter(
	p: LowerParams,
	expr: EirIterExpr,
	lowerNode: LowerNodeFn,
): BlockResult {
	const iterRef = asStringRef(expr.iter);
	const bodyRef = asStringRef(expr.body);
	const headerId = freshBlock(p.ctx);
	const bodyId = freshBlock(p.ctx);
	const exitId = p.nextBlock ?? freshBlock(p.ctx);

	addBlock(p.ctx, {
		id: p.currentBlock,
		instructions: [],
		terminator: { kind: "jump", to: headerId },
	});
	addBranchHeader(p.ctx, { id: headerId, cond: iterRef, thenId: bodyId, elseId: exitId });
	lowerOrJump({ ctx: p.ctx, ref: bodyRef, blockId: bodyId, nextId: headerId }, lowerNode);
	addExitIfNeeded(p, exitId);

	return { entry: p.currentBlock, exit: exitId };
}

function lowerEffect(p: LowerParams, expr: EirEffectExpr): BlockResult {
	addBlock(p.ctx, {
		id: p.currentBlock,
		instructions: [{
			kind: "effect",
			target: p.nodeId,
			op: expr.op,
			args: expr.args.map(asStringRef),
		}],
		terminator: simpleTerminator(p),
	});
	return { entry: p.currentBlock, exit: p.currentBlock };
}

function lowerRefCellOrDeref(
	p: LowerParams,
	expr: EirRefCellExpr | EirDerefExpr,
): BlockResult {
	const instructions = expr.kind === "deref"
		? [{ kind: "assign" as const, target: p.nodeId, value: { kind: "var" as const, name: expr.target + "_ref" } }]
		: [];

	addBlock(p.ctx, {
		id: p.currentBlock,
		instructions,
		terminator: simpleTerminator(p),
	});
	return { entry: p.currentBlock, exit: p.currentBlock };
}

//==============================================================================
// EIR Dispatcher
//==============================================================================

/** Lower an EIR expression to CFG form. */
export function lowerEirExpr(
	p: LowerParams,
	expr: EirOnlyExpr,
	lowerNode: LowerNodeFn,
): BlockResult {
	switch (expr.kind) {
	case "seq":
		return lowerSeq(p, expr, lowerNode);
	case "assign":
		return lowerAssign(p, expr);
	case "while":
		return lowerWhile(p, expr, lowerNode);
	case "for":
		return lowerFor(p, expr, lowerNode);
	case "iter":
		return lowerIter(p, expr, lowerNode);
	case "effect":
		return lowerEffect(p, expr);
	case "refCell":
	case "deref":
		return lowerRefCellOrDeref(p, expr);
	default:
		addBlock(p.ctx, {
			id: p.currentBlock,
			instructions: [],
			terminator: { kind: "return" },
		});
		return { entry: p.currentBlock, exit: p.currentBlock };
	}
}
