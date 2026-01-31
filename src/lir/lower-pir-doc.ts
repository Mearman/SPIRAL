// SPIRAL PIR to LIR Lowering
// Converts expression-based PIR to CFG-based LIR

import type {
	PIRDocument,
	HybridNode,
	LIRDocument,
} from "../types.js";
import { isExprNode } from "../types.js";
import type { BlockResult, LoweringContext, LowerParams } from "./lower-types.js";
import { freshBlock, addBlock, validationError } from "./lower-types.js";
import { isEirOnlyExpr, lowerEirExpr } from "./lower-eir.js";
import { isPirOnlyExpr, lowerPirExpr } from "./lower-pir.js";
import { lowerCirExpr } from "./lower-cir.js";
import type { LowerNodeArgs } from "./lower.js";

//==============================================================================
// Main Lowering Function
//==============================================================================

/**
 * Lower a PIR document to LIR (CFG form).
 *
 * Conversion strategy:
 * - Reuses EIR lowering for non-PIR expressions
 * - Routes PIR-specific expressions (spawn, await, par, channel, etc.) to PIR handlers
 */
export function lowerPIRtoLIR(pir: PIRDocument): LIRDocument {
	const ctx: LoweringContext = {
		blocks: [],
		nextBlockId: 0,
		nodeMap: new Map(),
	};

	for (const node of pir.nodes) {
		ctx.nodeMap.set(node.id, node);
	}

	if (!ctx.nodeMap.has(pir.result)) {
		validationError(`Result node not found: ${pir.result}`);
	}

	const entryBlock = lowerAllNodes(pir, ctx);
	finalizeBlocks(ctx, pir.result);

	return buildLirDocument(pir, ctx, entryBlock);
}

//==============================================================================
// Lowering Helpers
//==============================================================================

function lowerAllNodes(
	pir: PIRDocument,
	ctx: LoweringContext,
): string | null {
	let entryBlock: string | null = null;
	let prevBlockId: string | null = null;

	for (const node of pir.nodes) {
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
	pir: PIRDocument,
	ctx: LoweringContext,
	entryBlock: string | null,
): LIRDocument {
	const mainBlockNode: HybridNode = {
		id: pir.result,
		blocks: ctx.blocks,
		entry: entryBlock ?? "bb0",
	};

	const lirDoc: LIRDocument = {
		version: pir.version,
		nodes: [mainBlockNode],
		result: pir.result,
	};
	if (pir.capabilities) {
		lirDoc.capabilities = pir.capabilities;
	}
	return lirDoc;
}

//==============================================================================
// Node Lowering
//==============================================================================

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

	if (isPirOnlyExpr(node.expr)) {
		return lowerPirExpr(p, node.expr, lowerNode);
	}

	if (isEirOnlyExpr(node.expr)) {
		return lowerEirExpr(p, node.expr, lowerNode);
	}

	return lowerCirExpr(p, node.expr, lowerNode);
}
