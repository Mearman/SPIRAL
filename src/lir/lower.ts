// SPIRAL EIR to LIR Lowering
// Converts expression-based EIR to CFG-based LIR

import { SPIRALError, ErrorCodes } from "../errors.js";
import type {
	EIRDocument,
	EirAssignExpr,
	EirDerefExpr,
	EirEffectExpr,
	EirExpr,
	EirForExpr,
	EirHybridNode,
	EirIterExpr,
	EirRefCellExpr,
	EirSeqExpr,
	EirTryExpr,
	EirWhileExpr,
	Expr,
	HybridNode,
	LIRDocument,
	LirBlock,
	LirInstruction,
} from "../types.js";
import { isExprNode } from "../types.js";

//==============================================================================
// Lowering Context
//==============================================================================

interface LoweringContext {
  blocks: LirBlock[];
  nextBlockId: number;
  nodeMap: Map<string, EirHybridNode>;
}

/**
 * Create a fresh block id.
 */
function freshBlock(ctx: LoweringContext): string {
	const id = "bb" + String(ctx.nextBlockId);
	ctx.nextBlockId++;
	return id;
}

/**
 * Add a block to the context.
 */
function addBlock(ctx: LoweringContext, block: LirBlock): void {
	ctx.blocks.push(block);
}

//==============================================================================
// Main Lowering Function
//==============================================================================

/**
 * Lower an EIR document to LIR (CFG form).
 *
 * Conversion strategy:
 * - Each EIR expression becomes one or more LIR blocks
 * - seq expressions: chain blocks sequentially
 * - if expressions: create branch with then/else blocks
 * - while expressions: create backward jump for loop
 * - for expressions: create init block, loop header, body, update
 * - assign expressions: assign instruction
 * - effect expressions: effect instruction
 */
export function lowerEIRtoLIR(eir: EIRDocument): LIRDocument {
	const ctx: LoweringContext = {
		blocks: [],
		nextBlockId: 0,
		nodeMap: new Map(),
	};

	// Build node map for lookup (only expr nodes can be lowered)
	for (const node of eir.nodes) {
		ctx.nodeMap.set(node.id, node);
	}

	// Validate that result node exists
	if (!ctx.nodeMap.has(eir.result)) {
		throw new SPIRALError(
			ErrorCodes.ValidationError,
			`Result node not found: ${eir.result}`,
		);
	}

	// Collect all expression nodes in document order (this ensures dependencies are lowered)
	// This is a simple approach that works for most cases
	const exprNodes: { id: string; node: EirHybridNode }[] = [];
	for (const node of eir.nodes) {
		if (isExprNode(node)) {
			exprNodes.push({ id: node.id, node });
		}
	}

	// Lower all expression nodes in order, chaining them together
	let entryBlock: string | null = null;
	let prevBlockId: string | null = null;
	for (const { node } of exprNodes) {
		const blockId = freshBlock(ctx);
		entryBlock ??= blockId;
		lowerNode(node, blockId, ctx, null);

		// Add jump from previous block to this block (for chaining)
		if (prevBlockId !== null) {
			const prevBlock = ctx.blocks.find((b) => b.id === prevBlockId);
			if (prevBlock?.terminator.kind === "return") {
				// Replace return with jump to chain blocks
				prevBlock.terminator = { kind: "jump", to: blockId };
			}
		}

		prevBlockId = blockId;
	}

	// If no blocks were created, add a simple return block
	if (ctx.blocks.length === 0) {
		const fallbackId = freshBlock(ctx);
		entryBlock = fallbackId;
		addBlock(ctx, {
			id: fallbackId,
			instructions: [],
			terminator: { kind: "return", value: eir.result },
		});
	}

	// Ensure we have a return terminator in the final block
	ensureReturnTerminator(ctx);

	// The final block should return the EIR document's result, not its local result
	if (ctx.blocks.length > 0) {
		const finalBlock = ctx.blocks[ctx.blocks.length - 1];
		if (finalBlock?.terminator.kind === "return") {
			finalBlock.terminator = { kind: "return", value: eir.result };
		}
	}

	// Build LIR document with a single block node containing all CFG blocks
	// All expression nodes are lowered into LIR instructions within the blocks
	// Use the EIR result as the block node ID to preserve the result reference
	const blockNodeId = eir.result;
	const mainBlockNode: HybridNode = {
		id: blockNodeId,
		blocks: ctx.blocks,
		entry: entryBlock ?? "bb0",
	};

	const lirDoc: LIRDocument = {
		version: eir.version,
		nodes: [mainBlockNode],
		result: blockNodeId,
	};
	if (eir.capabilities) {
		lirDoc.capabilities = eir.capabilities;
	}
	return lirDoc;
}

/**
 * Ensure all blocks have proper terminators.
 */
function ensureReturnTerminator(ctx: LoweringContext): void {
	for (const block of ctx.blocks) {
		if (block.terminator.kind === "jump") {
			const jumpTo = block.terminator.to;
			if (!jumpTo) {
				// Add return terminator if missing
				block.terminator = { kind: "return" };
			}
		}
	}
}

//==============================================================================
// Node Lowering
//==============================================================================

interface BlockResult {
  entry: string;
  exit: string;
}

/** EIR-only expression kinds (not shared with Expr) */
const EIR_KINDS = new Set(["seq", "assign", "while", "for", "iter", "effect", "refCell", "deref", "try"]);

/**
 * Extract a string node reference from a field that may be string | Expr.
 * EIR fields like `first`, `cond`, `body` etc. are typed as `string | Expr`
 * but in the lowering context they are expected to be node ID strings.
 */
function asStringRef(value: string | Expr): string {
	if (typeof value === "string") {
		return value;
	}
	// Inline expressions are not supported as node references in lowering;
	// return a placeholder to avoid runtime errors
	return JSON.stringify(value);
}

/** Type guard: checks if an EirExpr is an EIR-specific expression (not a base Expr) */
function isEirOnlyExpr(expr: EirExpr): expr is EirOnlyExpr {
	return EIR_KINDS.has(expr.kind);
}

/**
 * Lower a single node to one or more blocks.
 * Returns the entry and exit block ids.
 */
function lowerNode(
	node: EirHybridNode,
	currentBlock: string,
	ctx: LoweringContext,
	nextBlock: string | null,
): BlockResult {
	// Skip block nodes - they're already in CFG form
	if (!isExprNode(node)) {
		// Block nodes pass through - their blocks are already LIR-like
		return { entry: currentBlock, exit: currentBlock };
	}

	const expr = node.expr;

	if (isEirOnlyExpr(expr)) {
		return lowerEirExpr(expr, node.id, currentBlock, ctx, nextBlock);
	}

	// For CIR expressions, create a simple assignment block
	return lowerCirExpr(expr, node.id, currentBlock, ctx, nextBlock);
}

/**
 * Lower a CIR expression (non-EIR).
 */
function lowerCirExpr(
	expr: Expr,
	nodeId: string,
	currentBlock: string,
	ctx: LoweringContext,
	nextBlock: string | null,
): BlockResult {
	const instructions: LirInstruction[] = [];

	switch (expr.kind) {
	case "lit":
		// Create an assign instruction with the literal value inline
		instructions.push({
			kind: "assign",
			target: nodeId,
			value: expr,
		});
		break;

	case "var":
		// Variables are referenced directly by name
		break;

	case "ref":
		// Create an assign from the referenced node
		instructions.push({
			kind: "assign",
			target: nodeId,
			value: { kind: "var", name: expr.id },
		});
		break;

	case "call": {
		// Operator call becomes op instruction
		// Process args: inline literals by creating assign instructions
		const processedArgs: string[] = [];

		for (let i = 0; i < expr.args.length; i++) {
			const arg = expr.args[i];
			if (arg === undefined) {
				continue;
			}

			if (typeof arg === "string") {
				// Node ID reference
				const argNode = ctx.nodeMap.get(arg);

				if (argNode && isExprNode(argNode) && argNode.expr.kind === "lit") {
					// Create a unique variable name for this literal
					const litVarName = `${nodeId}_arg${i}_lit`;
					instructions.push({
						kind: "assign",
						target: litVarName,
						value: argNode.expr,
					});
					processedArgs.push(litVarName);
				} else {
					// Use original arg ID (will be looked up in vars)
					processedArgs.push(arg);
				}
			} else {
				// Inline expression - create an assign instruction for it
				const argVarName = `${nodeId}_arg${i}_inline`;
				instructions.push({
					kind: "assign",
					target: argVarName,
					value: arg,
				});
				processedArgs.push(argVarName);
			}
		}

		instructions.push({
			kind: "op",
			target: nodeId,
			ns: expr.ns,
			name: expr.name,
			args: processedArgs,
		});
		break;
	}

	case "if": {
		// Conditional branch
		const thenId = freshBlock(ctx);
		const elseId = freshBlock(ctx);
		const mergeId = nextBlock ?? freshBlock(ctx);

		// Create current block with branch terminator
		addBlock(ctx, {
			id: currentBlock,
			instructions: [],
			terminator: {
				kind: "branch",
				cond: expr.cond,
				then: thenId,
				else: elseId,
			},
		});

		// Lower then branch
		const thenNode = ctx.nodeMap.get(expr.then);
		if (thenNode) {
			lowerNode(thenNode, thenId, ctx, mergeId);
		}

		// Lower else branch
		const elseNode = ctx.nodeMap.get(expr.else);
		if (elseNode) {
			lowerNode(elseNode, elseId, ctx, mergeId);
		}

		// Create merge block (if needed)
		if (!nextBlock) {
			addBlock(ctx, {
				id: mergeId,
				instructions: [],
				terminator: { kind: "jump", to: mergeId },
			});
		}

		return { entry: currentBlock, exit: mergeId };
	}

	case "let": {
		// Let binding: assign value, then use in body
		instructions.push({
			kind: "assign",
			target: nodeId,
			value: { kind: "var", name: expr.value },
		});

		addBlock(ctx, {
			id: currentBlock,
			instructions,
			terminator: { kind: "jump", to: expr.body },
		});

		// Lower body
		const bodyNode = ctx.nodeMap.get(expr.body);
		if (bodyNode) {
			return lowerNode(bodyNode, expr.body, ctx, nextBlock);
		}

		return { entry: currentBlock, exit: currentBlock };
	}

	case "lambda":
	case "callExpr":
	case "fix":
	case "airRef":
	case "predicate":
		// Complex CIR expressions - placeholder
		break;

	default:
		break;
	}

	// Default: create simple block
	const terminator = nextBlock
		? { kind: "jump" as const, to: nextBlock }
		: { kind: "return" as const, value: nodeId };

	addBlock(ctx, {
		id: currentBlock,
		instructions,
		terminator,
	});

	return { entry: currentBlock, exit: currentBlock };
}

/** EIR-only expression type (excludes base Expr) */
type EirOnlyExpr = EirSeqExpr | EirAssignExpr | EirWhileExpr | EirForExpr | EirIterExpr | EirEffectExpr | EirRefCellExpr | EirDerefExpr | EirTryExpr;

/**
 * Lower an EIR expression to CFG form.
 */
function lowerEirExpr(
	expr: EirOnlyExpr,
	nodeId: string,
	currentBlock: string,
	ctx: LoweringContext,
	nextBlock: string | null,
): BlockResult {
	switch (expr.kind) {
	case "seq": {
		// seq(first, then): execute first, then then
		const firstRef = asStringRef(expr.first);
		const thenRef = asStringRef(expr.then);

		// Lower first part
		const firstNode = ctx.nodeMap.get(firstRef);
		if (!firstNode) {
			throw new SPIRALError(
				ErrorCodes.ValidationError,
				"First node not found: " + firstRef,
			);
		}

		const midBlock = freshBlock(ctx);
		lowerNode(firstNode, currentBlock, ctx, midBlock);

		// Lower then part
		const thenNode = ctx.nodeMap.get(thenRef);
		if (!thenNode) {
			throw new SPIRALError(
				ErrorCodes.ValidationError,
				"Then node not found: " + thenRef,
			);
		}

		return lowerNode(thenNode, midBlock, ctx, nextBlock);
	}

	case "assign": {
		// assign(target, value): assign instruction
		const valueRef = asStringRef(expr.value);
		const instructions: LirInstruction[] = [
			{
				kind: "assign",
				target: expr.target,
				value: { kind: "var", name: valueRef },
			},
		];

		addBlock(ctx, {
			id: currentBlock,
			instructions,
			terminator: nextBlock
				? { kind: "jump", to: nextBlock }
				: { kind: "return" },
		});

		return { entry: currentBlock, exit: currentBlock };
	}

	case "while": {
		// while(cond, body): loop with condition check
		const condRef = asStringRef(expr.cond);
		const bodyRef = asStringRef(expr.body);
		const headerId = freshBlock(ctx);
		const bodyId = freshBlock(ctx);
		const exitId = nextBlock ?? freshBlock(ctx);

		// Current block jumps to header
		addBlock(ctx, {
			id: currentBlock,
			instructions: [],
			terminator: { kind: "jump", to: headerId },
		});

		// Header block: check condition, branch to body or exit
		addBlock(ctx, {
			id: headerId,
			instructions: [],
			terminator: {
				kind: "branch",
				cond: condRef,
				then: bodyId,
				else: exitId,
			},
		});

		// Body block: execute body, jump back to header
		const bodyNode = ctx.nodeMap.get(bodyRef);
		if (bodyNode) {
			lowerNode(bodyNode, bodyId, ctx, headerId);
			// Ensure body block jumps back to header
			const bodyBlock = ctx.blocks.find((b) => b.id === bodyId);
			if (bodyBlock && bodyBlock.terminator.kind !== "jump") {
				bodyBlock.terminator = { kind: "jump", to: headerId };
			}
		} else {
			addBlock(ctx, {
				id: bodyId,
				instructions: [],
				terminator: { kind: "jump", to: headerId },
			});
		}

		// Create exit block if needed
		if (!nextBlock) {
			addBlock(ctx, {
				id: exitId,
				instructions: [],
				terminator: { kind: "return" },
			});
		}

		return { entry: currentBlock, exit: exitId };
	}

	case "for": {
		// for(var, init, cond, update, body): C-style for loop
		const initRef = asStringRef(expr.init);
		const condRef = asStringRef(expr.cond);
		const updateRef = asStringRef(expr.update);
		const bodyRef = asStringRef(expr.body);
		const initId = currentBlock;
		const headerId = freshBlock(ctx);
		const bodyId = freshBlock(ctx);
		const updateId = freshBlock(ctx);
		const exitId = nextBlock ?? freshBlock(ctx);

		// Init block
		const initNode = ctx.nodeMap.get(initRef);
		if (initNode) {
			lowerNode(initNode, initId, ctx, headerId);
		} else {
			addBlock(ctx, {
				id: initId,
				instructions: [],
				terminator: { kind: "jump", to: headerId },
			});
		}

		// Header block: check condition
		addBlock(ctx, {
			id: headerId,
			instructions: [],
			terminator: {
				kind: "branch",
				cond: condRef,
				then: bodyId,
				else: exitId,
			},
		});

		// Body block
		const bodyNode = ctx.nodeMap.get(bodyRef);
		if (bodyNode) {
			lowerNode(bodyNode, bodyId, ctx, updateId);
		} else {
			addBlock(ctx, {
				id: bodyId,
				instructions: [],
				terminator: { kind: "jump", to: updateId },
			});
		}

		// Update block
		const updateNode = ctx.nodeMap.get(updateRef);
		if (updateNode) {
			lowerNode(updateNode, updateId, ctx, headerId);
		} else {
			addBlock(ctx, {
				id: updateId,
				instructions: [],
				terminator: { kind: "jump", to: headerId },
			});
		}

		// Exit block
		if (!nextBlock) {
			addBlock(ctx, {
				id: exitId,
				instructions: [],
				terminator: { kind: "return" },
			});
		}

		return { entry: initId, exit: exitId };
	}

	case "iter": {
		// iter(var, iter, body): iterate over list/set
		// Simplified lowering: create a while-like structure
		// In a full implementation, this would use iterator protocol
		const iterRef = asStringRef(expr.iter);
		const bodyRef = asStringRef(expr.body);
		const headerId = freshBlock(ctx);
		const bodyId = freshBlock(ctx);
		const exitId = nextBlock ?? freshBlock(ctx);

		addBlock(ctx, {
			id: currentBlock,
			instructions: [],
			terminator: { kind: "jump", to: headerId },
		});

		// For simplicity, we create a basic structure
		// A full implementation would handle element extraction
		addBlock(ctx, {
			id: headerId,
			instructions: [],
			terminator: {
				kind: "branch",
				cond: iterRef, // Placeholder: should check if iterator has more elements
				then: bodyId,
				else: exitId,
			},
		});

		const bodyNode = ctx.nodeMap.get(bodyRef);
		if (bodyNode) {
			lowerNode(bodyNode, bodyId, ctx, headerId);
		}

		if (!nextBlock) {
			addBlock(ctx, {
				id: exitId,
				instructions: [],
				terminator: { kind: "return" },
			});
		}

		return { entry: currentBlock, exit: exitId };
	}

	case "effect": {
		// effect(op, args): effect instruction
		const instructions: LirInstruction[] = [
			{
				kind: "effect",
				target: nodeId, // Store effect result in the node
				op: expr.op,
				args: expr.args.map(asStringRef),
			},
		];

		addBlock(ctx, {
			id: currentBlock,
			instructions,
			terminator: nextBlock
				? { kind: "jump", to: nextBlock }
				: { kind: "return" },
		});

		return { entry: currentBlock, exit: currentBlock };
	}

	case "refCell":
	case "deref": {
		// Reference cell operations
		const instructions: LirInstruction[] = [];
		if (expr.kind === "deref") {
			instructions.push({
				kind: "assign",
				target: nodeId,
				value: { kind: "var", name: expr.target + "_ref" },
			});
		}

		addBlock(ctx, {
			id: currentBlock,
			instructions,
			terminator: nextBlock
				? { kind: "jump", to: nextBlock }
				: { kind: "return" },
		});

		return { entry: currentBlock, exit: currentBlock };
	}

	default:
		// Unknown EIR expression
		addBlock(ctx, {
			id: currentBlock,
			instructions: [],
			terminator: { kind: "return" },
		});
		return { entry: currentBlock, exit: currentBlock };
	}
}
