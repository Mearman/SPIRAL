// SPIRAL LIR Lowering - Shared types and utilities

import { SPIRALError, ErrorCodes } from "../errors.js";
import type {
	EirHybridNode,
	Expr,
	LirBlock,
	LirInstruction,
} from "../types.js";

//==============================================================================
// Lowering Context
//==============================================================================

export interface LoweringContext {
	blocks: LirBlock[];
	nextBlockId: number;
	nodeMap: Map<string, EirHybridNode>;
}

export interface BlockResult {
	entry: string;
	exit: string;
}

/** Parameters for lowering a single expression node. */
export interface LowerParams {
	nodeId: string;
	currentBlock: string;
	ctx: LoweringContext;
	nextBlock: string | null;
}

/**
 * Create a fresh block id.
 */
export function freshBlock(ctx: LoweringContext): string {
	const id = "bb" + String(ctx.nextBlockId);
	ctx.nextBlockId++;
	return id;
}

/**
 * Add a block to the context.
 */
export function addBlock(ctx: LoweringContext, block: LirBlock): void {
	ctx.blocks.push(block);
}

/**
 * Build a simple block with instructions and a default terminator.
 */
export function addSimpleBlock(
	p: LowerParams,
	instructions: LirInstruction[],
): void {
	const terminator = p.nextBlock
		? { kind: "jump" as const, to: p.nextBlock }
		: { kind: "return" as const, value: p.nodeId };

	addBlock(p.ctx, {
		id: p.currentBlock,
		instructions,
		terminator,
	});
}

/**
 * Extract a string node reference from a field that may be string | Expr.
 */
export function asStringRef(value: string | Expr): string {
	if (typeof value === "string") {
		return value;
	}
	return JSON.stringify(value);
}

/**
 * Throw a validation error with a message.
 */
export function validationError(msg: string): never {
	throw new SPIRALError(ErrorCodes.ValidationError, msg);
}
