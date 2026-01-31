// Python AST to SPIRAL node conversion

import type { IngestState } from "./types.js";
import { freshId, addNode, addLitNode } from "./helpers.js";
import type {
	PyNode, PyAssign, PyFunctionDef, PyIf, PyWhile,
	PyFor, PyBinOp, PyUnaryOp, PyBoolOp, PyCompare,
	PyIfExp, PyLambda, PyCall, PyConstant, PyName,
} from "./python-types.js";
import {
	isExprStmt, isAssign, isFunctionDef, isReturn,
	isIfStmt, isWhileStmt, isForStmt,
	isConstant, isName, isBinOp, isUnaryOp, isBoolOp,
	isCompare, isIfExp, isLambdaExpr, isCall,
	isPrintCall, isStringLiteral,
} from "./python-types.js";

//==============================================================================
// Node emission helpers
//==============================================================================

interface CallOp {
	ns: string;
	name: string;
}

function addCallNode(state: IngestState, op: CallOp, args: string[]): string {
	const id = freshId(state);
	addNode(state, id, { kind: "call", ns: op.ns, name: op.name, args });
	return id;
}

//==============================================================================
// Operator maps
//==============================================================================

const BINOP_MAP: Record<string, { ns: string; name: string }> = {
	Add: { ns: "core", name: "add" },
	Sub: { ns: "core", name: "sub" },
	Mult: { ns: "core", name: "mul" },
	FloorDiv: { ns: "core", name: "div" },
	Div: { ns: "core", name: "div" },
	Mod: { ns: "core", name: "mod" },
	Pow: { ns: "core", name: "pow" },
};

const COMPARE_MAP: Record<string, { ns: string; name: string }> = {
	Lt: { ns: "core", name: "lt" },
	Gt: { ns: "core", name: "gt" },
	Eq: { ns: "core", name: "eq" },
	NotEq: { ns: "core", name: "neq" },
	LtE: { ns: "core", name: "lte" },
	GtE: { ns: "core", name: "gte" },
};

//==============================================================================
// Module-level conversion
//==============================================================================

export function convertModule(body: PyNode[], state: IngestState): string {
	let lastId: string | undefined;
	for (const stmt of body) {
		const id = convertStatement(stmt, state);
		if (id !== undefined) lastId = id;
	}

	if (lastId !== undefined) return lastId;

	const emptyId = freshId(state, "_empty");
	addNode(state, emptyId, { kind: "lit", type: { kind: "void" }, value: null });
	return emptyId;
}

//==============================================================================
// Statement conversion
//==============================================================================

function convertStatement(node: PyNode, state: IngestState): string | undefined {
	if (isExprStmt(node)) return convertExpression(node.value, state);
	if (isAssign(node)) return convertAssign(node, state);
	if (isFunctionDef(node)) return convertFunctionDef(node, state);
	if (isReturn(node)) return node.value ? convertExpression(node.value, state) : undefined;
	if (isIfStmt(node)) return convertIfStatement(node, state);
	if (isWhileStmt(node)) return convertWhileStatement(node, state);
	if (isForStmt(node)) return convertForStatement(node, state);
	return undefined;
}

function convertAssign(node: PyAssign, state: IngestState): string | undefined {
	const target = node.targets[0];
	if (!target || !isName(target)) return undefined;

	const exprId = convertExpression(node.value, state);
	return renameLastNode(state, exprId, target.id);
}

function renameLastNode(state: IngestState, exprId: string, name: string): string {
	const lastNode = state.nodes[state.nodes.length - 1];
	if (lastNode?.id === exprId) {
		const id = freshId(state, name);
		state.usedIds.delete(exprId);
		lastNode.id = id;
		state.usedIds.add(id);
		return id;
	}
	const id = freshId(state, name);
	addNode(state, id, { kind: "ref", id: exprId });
	return id;
}

function convertFunctionDef(node: PyFunctionDef, state: IngestState): string {
	const params = node.args.args.map((a) => a.arg);
	const prevFnName = state.currentFunctionName;
	state.currentFunctionName = node.name;

	const bodyId = convertStatementBlock(node.body, state);

	state.currentFunctionName = prevFnName;

	const paramTypes = params.map(() => ({ kind: "int" as const }));
	const fnType = { kind: "fn" as const, params: paramTypes, returns: { kind: "int" as const } };
	const id = freshId(state, node.name);
	addNode(state, id, { kind: "lambda", params, body: bodyId, type: fnType });
	return id;
}

function convertStatementBlock(stmts: PyNode[], state: IngestState): string {
	let lastId: string | undefined;
	for (const stmt of stmts) {
		const id = convertStatement(stmt, state);
		if (id !== undefined) lastId = id;
	}
	if (lastId !== undefined) return lastId;
	const voidId = freshId(state);
	addNode(state, voidId, { kind: "lit", type: { kind: "void" }, value: null });
	return voidId;
}

function convertIfStatement(node: PyIf, state: IngestState): string {
	const condId = convertExpression(node.test, state);
	const thenId = convertStatementBlock(node.body, state);
	const elseId = node.orelse.length > 0
		? convertStatementBlock(node.orelse, state)
		: addLitNode(state, { kind: "void" }, null);

	const ifId = freshId(state);
	addNode(state, ifId, { kind: "if", cond: condId, then: thenId, else: elseId });
	return ifId;
}

function convertWhileStatement(node: PyWhile, state: IngestState): string {
	const condId = convertExpression(node.test, state);
	const bodyId = convertStatementBlock(node.body, state);
	const whileId = freshId(state);
	addNode(state, whileId, { kind: "while", cond: condId, body: bodyId });
	return whileId;
}

function convertForStatement(node: PyFor, state: IngestState): string {
	const iterId = convertExpression(node.iter, state);
	const varName = isName(node.target) ? node.target.id : "_item";
	const bodyId = convertStatementBlock(node.body, state);
	const forId = freshId(state);
	addNode(state, forId, { kind: "iter", var: varName, iter: iterId, body: bodyId });
	return forId;
}

//==============================================================================
// Expression conversion
//==============================================================================

function convertExpression(node: PyNode, state: IngestState): string {
	if (isConstant(node)) return convertConstant(node, state);
	if (isName(node)) return convertName(node, state);
	if (isBinOp(node)) return convertBinOp(node, state);
	if (isUnaryOp(node)) return convertUnaryOp(node, state);
	if (isBoolOp(node)) return convertBoolOp(node, state);
	if (isCompare(node)) return convertCompare(node, state);
	if (isIfExp(node)) return convertIfExpression(node, state);
	if (isLambdaExpr(node)) return convertLambda(node, state);
	if (isCall(node)) return convertCall(node, state);

	return addLitNode(state, { kind: "void" }, null);
}

function convertConstant(node: PyConstant, state: IngestState): string {
	const val = node.value;
	if (val === null || val === undefined) return addLitNode(state, { kind: "void" }, null);
	if (typeof val === "boolean") return addLitNode(state, { kind: "bool" }, val);
	if (typeof val === "number") {
		const isFloat = state.floatNumbers || !Number.isInteger(val);
		return addLitNode(state, { kind: isFloat ? "float" : "int" }, val);
	}
	if (typeof val === "string") return addLitNode(state, { kind: "string" }, val);
	return addLitNode(state, { kind: "void" }, null);
}

function convertName(node: PyName, state: IngestState): string {
	if (node.id === "True") return addLitNode(state, { kind: "bool" }, true);
	if (node.id === "False") return addLitNode(state, { kind: "bool" }, false);
	if (node.id === "None") return addLitNode(state, { kind: "void" }, null);

	const id = freshId(state);
	addNode(state, id, { kind: "ref", id: node.id });
	return id;
}

function convertBinOp(node: PyBinOp, state: IngestState): string {
	const leftId = convertExpression(node.left, state);
	const rightId = convertExpression(node.right, state);
	const opType = node.op._type;

	if (opType === "Add" && (isStringLiteral(node.left) || isStringLiteral(node.right))) {
		return addCallNode(state, { ns: "string", name: "concat" }, [leftId, rightId]);
	}

	const mapping = BINOP_MAP[opType];
	if (!mapping) return addLitNode(state, { kind: "void" }, null);
	return addCallNode(state, mapping, [leftId, rightId]);
}

function convertUnaryOp(node: PyUnaryOp, state: IngestState): string {
	const operandId = convertExpression(node.operand, state);
	if (node.op._type === "USub") return addCallNode(state, { ns: "core", name: "neg" }, [operandId]);
	if (node.op._type === "Not") return addCallNode(state, { ns: "bool", name: "not" }, [operandId]);
	return operandId;
}

function convertBoolOp(node: PyBoolOp, state: IngestState): string {
	const opName = node.op._type === "And" ? "and" : "or";
	const first = node.values[0];
	if (!first) return addLitNode(state, { kind: "void" }, null);

	let currentId = convertExpression(first, state);
	for (let i = 1; i < node.values.length; i++) {
		const operand = node.values[i];
		if (!operand) continue;
		currentId = addCallNode(state, { ns: "bool", name: opName }, [currentId, convertExpression(operand, state)]);
	}
	return currentId;
}

function convertCompare(node: PyCompare, state: IngestState): string {
	const leftId = convertExpression(node.left, state);
	const op = node.ops[0];
	const right = node.comparators[0];
	if (!op || !right) return leftId;

	const rightId = convertExpression(right, state);
	const mapping = COMPARE_MAP[op._type];
	if (!mapping) return leftId;
	return addCallNode(state, mapping, [leftId, rightId]);
}

function convertIfExpression(node: PyIfExp, state: IngestState): string {
	const condId = convertExpression(node.test, state);
	const thenId = convertExpression(node.body, state);
	const elseId = convertExpression(node.orelse, state);

	const id = freshId(state);
	addNode(state, id, { kind: "if", cond: condId, then: thenId, else: elseId });
	return id;
}

function convertLambda(node: PyLambda, state: IngestState): string {
	const params = node.args.args.map((a) => a.arg);
	const bodyId = convertExpression(node.body, state);

	const paramTypes = params.map(() => ({ kind: "int" as const }));
	const fnType = { kind: "fn" as const, params: paramTypes, returns: { kind: "int" as const } };

	const id = freshId(state);
	addNode(state, id, { kind: "lambda", params, body: bodyId, type: fnType });
	return id;
}

function convertCall(node: PyCall, state: IngestState): string {
	if (isPrintCall(node)) {
		const argIds = node.args.map((a) => convertExpression(a, state));
		const id = freshId(state);
		addNode(state, id, { kind: "effect", op: "print", args: argIds });
		return id;
	}

	const fnId = convertExpression(node.func, state);
	const argIds = node.args.map((a) => convertExpression(a, state));
	const id = freshId(state);
	addNode(state, id, { kind: "callExpr", fn: fnId, args: argIds });
	return id;
}
