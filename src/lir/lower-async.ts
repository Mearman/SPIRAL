/* eslint-disable @typescript-eslint/no-unused-vars */
// SPIRAL LIR Lowering - Async (EIR) expression handlers

import type {
	EirSpawnExpr,
	EirAwaitExpr,
	EirParExpr,
	EirChannelExpr,
	EirSendExpr,
	EirRecvExpr,
	EirSelectExpr,
	EirRaceExpr,
} from "../types.js";
import type { BlockResult, LowerParams } from "./lower-types.js";
import { addBlock, asStringRef } from "./lower-types.js";
import type { LowerNodeFn } from "./lower.js";

/** Async-only expression type */
export type AsyncOnlyExpr =
	| EirSpawnExpr | EirAwaitExpr | EirParExpr | EirChannelExpr
	| EirSendExpr | EirRecvExpr | EirSelectExpr | EirRaceExpr;

const ASYNC_KINDS = new Set([
	"spawn", "await", "par", "channel",
	"send", "recv", "select", "race",
]);

/** Type guard: checks if an expression is async-specific */
export function isAsyncOnlyExpr(
	expr: { kind: string },
): expr is AsyncOnlyExpr {
	return ASYNC_KINDS.has(expr.kind);
}

//==============================================================================
// Async Case Handlers
//==============================================================================

function lowerSpawn(p: LowerParams, expr: EirSpawnExpr): BlockResult {
	addBlock(p.ctx, {
		id: p.currentBlock,
		instructions: [{
			kind: "effect",
			target: p.nodeId,
			op: "spawn",
			args: [expr.task],
		}],
		terminator: p.nextBlock
			? { kind: "jump", to: p.nextBlock }
			: { kind: "return", value: p.nodeId },
	});
	return { entry: p.currentBlock, exit: p.currentBlock };
}

function lowerAwait(p: LowerParams, expr: EirAwaitExpr): BlockResult {
	addBlock(p.ctx, {
		id: p.currentBlock,
		instructions: [{
			kind: "effect",
			target: p.nodeId,
			op: "await",
			args: [expr.future],
		}],
		terminator: p.nextBlock
			? { kind: "jump", to: p.nextBlock }
			: { kind: "return", value: p.nodeId },
	});
	return { entry: p.currentBlock, exit: p.currentBlock };
}

function lowerPar(p: LowerParams, expr: EirParExpr): BlockResult {
	addBlock(p.ctx, {
		id: p.currentBlock,
		instructions: [{
			kind: "effect",
			target: p.nodeId,
			op: "par",
			args: expr.branches,
		}],
		terminator: p.nextBlock
			? { kind: "jump", to: p.nextBlock }
			: { kind: "return", value: p.nodeId },
	});
	return { entry: p.currentBlock, exit: p.currentBlock };
}

function lowerChannel(p: LowerParams, expr: EirChannelExpr): BlockResult {
	const args = expr.bufferSize ? [asStringRef(expr.bufferSize)] : [];
	addBlock(p.ctx, {
		id: p.currentBlock,
		instructions: [{
			kind: "effect",
			target: p.nodeId,
			op: "channel",
			args,
		}],
		terminator: p.nextBlock
			? { kind: "jump", to: p.nextBlock }
			: { kind: "return", value: p.nodeId },
	});
	return { entry: p.currentBlock, exit: p.currentBlock };
}

function lowerSend(p: LowerParams, expr: EirSendExpr): BlockResult {
	addBlock(p.ctx, {
		id: p.currentBlock,
		instructions: [{
			kind: "effect",
			target: p.nodeId,
			op: "send",
			args: [expr.channel, asStringRef(expr.value)],
		}],
		terminator: p.nextBlock
			? { kind: "jump", to: p.nextBlock }
			: { kind: "return", value: p.nodeId },
	});
	return { entry: p.currentBlock, exit: p.currentBlock };
}

function lowerRecv(p: LowerParams, expr: EirRecvExpr): BlockResult {
	addBlock(p.ctx, {
		id: p.currentBlock,
		instructions: [{
			kind: "effect",
			target: p.nodeId,
			op: "recv",
			args: [expr.channel],
		}],
		terminator: p.nextBlock
			? { kind: "jump", to: p.nextBlock }
			: { kind: "return", value: p.nodeId },
	});
	return { entry: p.currentBlock, exit: p.currentBlock };
}

function lowerSelect(p: LowerParams, expr: EirSelectExpr): BlockResult {
	addBlock(p.ctx, {
		id: p.currentBlock,
		instructions: [{
			kind: "effect",
			target: p.nodeId,
			op: "select",
			args: expr.futures,
		}],
		terminator: p.nextBlock
			? { kind: "jump", to: p.nextBlock }
			: { kind: "return", value: p.nodeId },
	});
	return { entry: p.currentBlock, exit: p.currentBlock };
}

function lowerRace(p: LowerParams, expr: EirRaceExpr): BlockResult {
	addBlock(p.ctx, {
		id: p.currentBlock,
		instructions: [{
			kind: "effect",
			target: p.nodeId,
			op: "race",
			args: expr.tasks,
		}],
		terminator: p.nextBlock
			? { kind: "jump", to: p.nextBlock }
			: { kind: "return", value: p.nodeId },
	});
	return { entry: p.currentBlock, exit: p.currentBlock };
}

//==============================================================================
// Async Dispatcher
//==============================================================================

/** Lower an async expression to CFG form. */
export function lowerAsyncExpr(
	p: LowerParams,
	expr: AsyncOnlyExpr,
	_lowerNode: LowerNodeFn,
): BlockResult {
	switch (expr.kind) {
	case "spawn":
		return lowerSpawn(p, expr);
	case "await":
		return lowerAwait(p, expr);
	case "par":
		return lowerPar(p, expr);
	case "channel":
		return lowerChannel(p, expr);
	case "send":
		return lowerSend(p, expr);
	case "recv":
		return lowerRecv(p, expr);
	case "select":
		return lowerSelect(p, expr);
	case "race":
		return lowerRace(p, expr);
	}
}
