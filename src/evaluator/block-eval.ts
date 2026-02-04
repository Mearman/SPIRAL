// Block node evaluation (CFG-based)

import { lookupOperator, type OperatorRegistry } from "../domains/registry.ts";
import { type ValueEnv, extendValueEnv, lookupValue } from "../env.ts";
import { SPIRALError, ErrorCodes } from "../errors.ts";
import {
	type BlockNode,
	type EirInstruction,
	type EirTerminator,
	type LirInstruction,
	type LirTerminator,
	type Value,
	voidVal,
} from "../types.ts";
import { errorVal, isError } from "../types.ts";
import type { EvalOptions } from "./types.ts";
import { evaluateLitExpr } from "./helpers.ts";

//==============================================================================
// Block Node Evaluation
//==============================================================================

export interface BlockCtx {
	registry: OperatorRegistry;
	nodeValues: Map<string, Value>;
	options?: EvalOptions | undefined;
}

type AnyInstruction = LirInstruction | EirInstruction;
type AnyTerminator = LirTerminator | EirTerminator;

interface BlockType { id: string; instructions: AnyInstruction[]; terminator: AnyTerminator }

/** Evaluate a block node (CFG structure) and return its result. */
export function evaluateBlockNode<B extends BlockType>(
	node: BlockNode<B>,
	ctx: BlockCtx,
	env: ValueEnv,
): Value {
	const blockMap = buildBlockMap(node.blocks);
	const entryBlock = blockMap.get(node.entry);
	if (!entryBlock) {
		return errorVal(ErrorCodes.ValidationError, "Entry block not found: " + node.entry);
	}
	const cfgState: CfgState = {
		blockMap,
		ctx,
		vars: env,
		steps: 0,
		maxSteps: ctx.options?.maxSteps ?? 10000,
	};
	return runCfgLoop(cfgState, node.entry);
}

function buildBlockMap<B extends BlockType>(blocks: B[]): Map<string, B> {
	const map = new Map<string, B>();
	for (const block of blocks) {
		map.set(block.id, block);
	}
	return map;
}

interface CfgState {
	blockMap: Map<string, BlockType>;
	ctx: BlockCtx;
	vars: ValueEnv;
	steps: number;
	maxSteps: number;
}

interface BlockStepResult {
	done: boolean;
	value: Value;
	nextBlock?: string;
}

function runCfgLoop(
	s: CfgState,
	entryId: string,
): Value {
	let currentBlockId: string | undefined = entryId;
	while (currentBlockId) {
		s.steps++;
		if (s.steps > s.maxSteps) {
			return errorVal(ErrorCodes.NonTermination, "Block node execution exceeded maximum steps");
		}
		const result = executeOneBlock(s, currentBlockId);
		if (result.done) return result.value;
		currentBlockId = result.nextBlock;
	}
	return voidVal();
}

function executeOneBlock(
	s: CfgState,
	blockId: string,
): BlockStepResult {
	const block = s.blockMap.get(blockId);
	if (!block) {
		return { done: true, value: errorVal(ErrorCodes.ValidationError, "Block not found: " + blockId) };
	}
	const insResult = executeInstructions(block.instructions, s.vars, s.ctx);
	if (insResult.error) return { done: true, value: insResult.error };
	s.vars = insResult.vars;
	return handleTerminator(block.terminator, s.vars, s.ctx.nodeValues);
}

function handleTerminator(
	term: AnyTerminator,
	vars: ValueEnv,
	nodeValues: Map<string, Value>,
): BlockStepResult {
	const termResult = executeTerminator(term, vars, nodeValues);
	if (termResult.returnValue !== undefined) {
		return { done: true, value: termResult.returnValue };
	}
	if (termResult.error) {
		return { done: true, value: termResult.error };
	}
	if (termResult.nextBlock === undefined) {
		return {
			done: true,
			value: errorVal(ErrorCodes.ValidationError, "Terminator returned without nextBlock, returnValue, or error"),
		};
	}
	return { done: false, value: voidVal(), nextBlock: termResult.nextBlock };
}

//==============================================================================
// Instruction execution
//==============================================================================

interface InsResult {
	vars: ValueEnv;
	error?: Value;
}

function executeInstructions(
	instructions: AnyInstruction[],
	vars: ValueEnv,
	ctx: BlockCtx,
): InsResult {
	let currentVars = vars;
	for (const ins of instructions) {
		const result = executeSingleInstruction(ins, currentVars, ctx);
		if (result.error) return result;
		currentVars = result.vars;
	}
	return { vars: currentVars };
}

function executeSingleInstruction(
	ins: AnyInstruction,
	vars: ValueEnv,
	ctx: BlockCtx,
): InsResult {
	switch (ins.kind) {
	case "assign":
		return executeAssign(ins, vars, ctx.nodeValues);
	case "op":
		return executeOp(ins, vars, ctx);
	case "phi":
		return executePhi(ins, vars);
	case "call":
	case "effect":
	case "assignRef":
		return { vars, error: errorVal(ErrorCodes.DomainError, "Instruction kind not yet supported in hybrid blocks: " + ins.kind) };
	default:
		return { vars, error: errorVal(ErrorCodes.DomainError, "Unknown instruction kind") };
	}
}

function executeAssign(
	ins: AnyInstruction & { kind: "assign" },
	vars: ValueEnv,
	nodeValues: Map<string, Value>,
): InsResult {
	const expr = ins.value;
	let value: Value;
	if (expr.kind === "lit") {
		value = evaluateLitExpr(expr);
	} else if (expr.kind === "var") {
		value = lookupValue(vars, expr.name)
			?? errorVal(ErrorCodes.UnboundIdentifier, "Unbound identifier: " + expr.name);
	} else if (expr.kind === "ref") {
		value = nodeValues.get(expr.id)
			?? errorVal(ErrorCodes.DomainError, "Node not found: " + expr.id);
	} else {
		value = errorVal(ErrorCodes.DomainError, "Unsupported expression in block assign: " + expr.kind);
	}
	if (isError(value)) return { vars, error: value };
	return { vars: extendValueEnv(vars, ins.target, value) };
}

function resolveOpArgs(
	args: string[],
	vars: ValueEnv,
	nodeValues: Map<string, Value>,
): Value[] | Value {
	const argValues: Value[] = [];
	for (const argId of args) {
		const argVal = lookupValue(vars, argId) ?? nodeValues.get(argId);
		if (!argVal) return errorVal(ErrorCodes.UnboundIdentifier, "Argument not found: " + argId);
		if (isError(argVal)) return argVal;
		argValues.push(argVal);
	}
	return argValues;
}

function executeOp(
	ins: AnyInstruction & { kind: "op" },
	vars: ValueEnv,
	ctx: BlockCtx,
): InsResult {
	const argValues = resolveOpArgs(ins.args, vars, ctx.nodeValues);
	if (!Array.isArray(argValues)) return { vars, error: argValues };
	const op = lookupOperator(ctx.registry, ins.ns, ins.name);
	if (!op) {
		return { vars, error: errorVal(ErrorCodes.UnknownOperator, "Unknown operator: " + ins.ns + ":" + ins.name) };
	}
	try {
		const result = op.fn(...argValues);
		return { vars: extendValueEnv(vars, ins.target, result) };
	} catch (e) {
		if (e instanceof SPIRALError) return { vars, error: e.toValue() };
		return { vars, error: errorVal(ErrorCodes.DomainError, String(e)) };
	}
}

function executePhi(
	ins: AnyInstruction & { kind: "phi" },
	vars: ValueEnv,
): InsResult {
	let phiValue: Value | undefined;
	for (const source of ins.sources) {
		const value = lookupValue(vars, source.id);
		if (value && !isError(value)) {
			phiValue = value;
			break;
		}
	}
	if (!phiValue) {
		return { vars, error: errorVal(ErrorCodes.DomainError, "Phi node has no valid sources: " + ins.target) };
	}
	return { vars: extendValueEnv(vars, ins.target, phiValue) };
}

//==============================================================================
// Terminator execution
//==============================================================================

interface TermResult {
	nextBlock?: string;
	returnValue?: Value;
	error?: Value;
}

function executeTerminator(
	term: AnyTerminator,
	vars: ValueEnv,
	nodeValues: Map<string, Value>,
): TermResult {
	switch (term.kind) {
	case "jump":
		return { nextBlock: term.to };
	case "branch":
		return executeBranch(term, vars, nodeValues);
	case "return":
		return executeReturn(term, vars, nodeValues);
	case "exit":
		return { returnValue: voidVal() };
	default:
		return { error: errorVal(ErrorCodes.DomainError, "Unknown terminator kind") };
	}
}

function executeBranch(
	term: AnyTerminator & { kind: "branch" },
	vars: ValueEnv,
	nodeValues: Map<string, Value>,
): TermResult {
	const condValue = lookupValue(vars, term.cond) ?? nodeValues.get(term.cond);
	if (!condValue) {
		return { error: errorVal(ErrorCodes.UnboundIdentifier, "Condition not found: " + term.cond) };
	}
	if (condValue.kind !== "bool") {
		return { error: errorVal(ErrorCodes.TypeError, "Branch condition must be bool") };
	}
	return { nextBlock: condValue.value ? term.then : term.else };
}

function executeReturn(
	term: AnyTerminator & { kind: "return" },
	vars: ValueEnv,
	nodeValues: Map<string, Value>,
): TermResult {
	if (term.value) {
		const value = lookupValue(vars, term.value) ?? nodeValues.get(term.value);
		if (!value) {
			return { error: errorVal(ErrorCodes.UnboundIdentifier, "Return value not found: " + term.value) };
		}
		return { returnValue: value };
	}
	return { returnValue: voidVal() };
}
