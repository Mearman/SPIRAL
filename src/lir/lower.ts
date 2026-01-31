// SPIRAL EIR to LIR Lowering
// Converts expression-based EIR to CFG-based LIR

import type {
	EIRDocument,
	EirHybridNode,
	HybridNode,
	LIRDocument,
} from "../types.js";
import { isExprNode } from "../types.js";
import type { BlockResult, LoweringContext, LowerParams } from "./lower-types.js";
import { freshBlock, addBlock, validationError } from "./lower-types.js";
import { isEirOnlyExpr, lowerEirExpr } from "./lower-eir.js";
import { isAsyncOnlyExpr, lowerAsyncExpr } from "./lower-async.js";
import { lowerCirExpr } from "./lower-cir.js";

//==============================================================================
// LowerNode function type (shared with sub-modules)
//==============================================================================

/** Arguments for the recursive lowerNode callback. */
export interface LowerNodeArgs {
	node: EirHybridNode;
	currentBlock: string;
	ctx: LoweringContext;
	nextBlock: string | null;
}

/** Signature for the recursive lowerNode function. */
export type LowerNodeFn = (args: LowerNodeArgs) => BlockResult;

//==============================================================================
// Main Lowering Function
//==============================================================================

/**
 * Lower an EIR document to LIR (CFG form).
 *
 * Conversion strategy:
 * - Each EIR expression becomes one or more LIR blocks
 * - seq/if/while/for/assign/effect become CFG blocks
 */
export function lowerEIRtoLIR(eir: EIRDocument): LIRDocument {
	const ctx: LoweringContext = {
		blocks: [],
		nextBlockId: 0,
		nodeMap: new Map(),
	};

	for (const node of eir.nodes) {
		ctx.nodeMap.set(node.id, node);
	}

	if (!ctx.nodeMap.has(eir.result)) {
		validationError(`Result node not found: ${eir.result}`);
	}

	const entryBlock = lowerAllNodes(eir, ctx);
	finalizeBlocks(ctx, eir.result);

	return buildLirDocument(eir, ctx, entryBlock);
}

//==============================================================================
// Lowering Helpers
//==============================================================================

function lowerAllNodes(
	eir: EIRDocument,
	ctx: LoweringContext,
): string | null {
	let entryBlock: string | null = null;
	let prevBlockId: string | null = null;

	for (const node of eir.nodes) {
		if (!isExprNode(node)) continue;

		const blockId = freshBlock(ctx);
		entryBlock ??= blockId;
		lowerNode({ node, currentBlock: blockId, ctx, nextBlock: null });
		chainBlocks(ctx, prevBlockId, blockId);
		prevBlockId = blockId;
	}

	return entryBlock;
}

function chainBlocks(
	ctx: LoweringContext,
	prevBlockId: string | null,
	blockId: string,
): void {
	if (prevBlockId === null) return;

	const prevBlock = ctx.blocks.find((b) => b.id === prevBlockId);
	if (prevBlock?.terminator.kind === "return") {
		prevBlock.terminator = { kind: "jump", to: blockId };
	}
}

function finalizeBlocks(
	ctx: LoweringContext,
	result: string,
): void {
	if (ctx.blocks.length === 0) {
		const fallbackId = freshBlock(ctx);
		addBlock(ctx, {
			id: fallbackId,
			instructions: [],
			terminator: { kind: "return", value: result },
		});
		return;
	}

	for (const block of ctx.blocks) {
		if (block.terminator.kind === "jump" && !block.terminator.to) {
			block.terminator = { kind: "return" };
		}
	}

	const finalBlock = ctx.blocks[ctx.blocks.length - 1];
	if (finalBlock?.terminator.kind === "return") {
		finalBlock.terminator = { kind: "return", value: result };
	}
}

function buildLirDocument(
	eir: EIRDocument,
	ctx: LoweringContext,
	entryBlock: string | null,
): LIRDocument {
	const mainBlockNode: HybridNode = {
		id: eir.result,
		blocks: ctx.blocks,
		entry: entryBlock ?? "bb0",
	};

	const lirDoc: LIRDocument = {
		version: eir.version,
		nodes: [mainBlockNode],
		result: eir.result,
	};
	if (eir.capabilities) {
		lirDoc.capabilities = eir.capabilities;
	}
	return lirDoc;
}

//==============================================================================
// Node Lowering
//==============================================================================

/**
 * Lower a single node to one or more blocks.
 */
function lowerNode(args: LowerNodeArgs): BlockResult {
	const { node, currentBlock, ctx, nextBlock } = args;

	if (!isExprNode(node)) {
		return { entry: currentBlock, exit: currentBlock };
	}

	const p: LowerParams = {
		nodeId: node.id,
		currentBlock,
		ctx,
		nextBlock,
	};

	if (isAsyncOnlyExpr(node.expr)) {
		return lowerAsyncExpr(p, node.expr);
	}

	if (isEirOnlyExpr(node.expr)) {
		return lowerEirExpr(p, node.expr, lowerNode);
	}

	return lowerCirExpr(p, node.expr, lowerNode);
}
