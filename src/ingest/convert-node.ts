// Pass 2: Node-creating conversion for top-level statements

import ts from "typescript";
import type { Type } from "../types.js";
import type { IngestState } from "./types.js";
import {
	freshId,
	addNode,
	makeVoidNode,
	makeVoidExpr,
	wrapInDoIfCall,
	inferTypeFromAnnotation,
	inferReturnType,
} from "./helpers.js";
import { convertExpressionToNode } from "./convert-expr-node.js";
import { convertExprInline } from "./convert-expr-inline.js";

// ---------- Top-level node dispatch ----------

function tryConvertStatement(
	node: ts.Node,
	state: IngestState,
): string | undefined {
	if (ts.isVariableStatement(node)) return convertVariableStatement(node, state);
	if (ts.isExpressionStatement(node)) return convertExpressionToNode(node.expression, state);
	if (ts.isFunctionDeclaration(node)) return convertFunctionDeclaration(node, state);
	if (ts.isIfStatement(node)) return convertIfStatement(node, state);
	return undefined;
}

export function convertNode(
	node: ts.Node,
	state: IngestState,
): string | undefined {
	const stmtResult = tryConvertStatement(node, state);
	if (stmtResult !== undefined) return stmtResult;

	if (ts.isReturnStatement(node)) {
		return node.expression
			? convertExpressionToNode(node.expression, state)
			: undefined;
	}
	if (ts.isBlock(node)) return convertBlock(node, state);
	return undefined;
}

// ---------- Variable statement ----------

function renameLastNode(
	state: IngestState,
	exprId: string,
	name: string,
): string {
	const lastNode = state.nodes[state.nodes.length - 1];
	if (lastNode?.id === exprId) {
		const id = freshId(state, name);
		lastNode.id = id;
		state.usedIds.delete(exprId);
		state.usedIds.add(id);
		return id;
	}
	const id = freshId(state, name);
	addNode(state, id, { kind: "ref", id: exprId });
	return id;
}

function convertVariableStatement(
	node: ts.VariableStatement,
	state: IngestState,
): string | undefined {
	let lastId: string | undefined;
	for (const decl of node.declarationList.declarations) {
		if (!decl.initializer) continue;
		const name = decl.name.getText();
		const exprId = convertExpressionToNode(decl.initializer, state);
		lastId = renameLastNode(state, exprId, name);
	}
	return lastId;
}

// ---------- Function declaration ----------

function buildFnBody(
	node: ts.FunctionDeclaration,
	state: IngestState,
	params: string[],
): unknown {
	let bodyExpr: unknown = node.body
		? convertFunctionBodyInline(node.body, state, params)
		: undefined;
	if (bodyExpr === undefined) bodyExpr = makeVoidExpr();
	return wrapInDoIfCall(bodyExpr);
}

interface LambdaEmitArgs {
	name: string;
	params: string[];
	paramTypes: Type[];
	bodyExpr: unknown;
	returnType: Type;
}

function emitLambdaNode(
	state: IngestState,
	args: LambdaEmitArgs,
): string {
	const bodyId = freshId(state);
	addNode(state, bodyId, args.bodyExpr);

	const fnType: Type = { kind: "fn", params: args.paramTypes, returns: args.returnType };
	const id = freshId(state, args.name);
	addNode(state, id, { kind: "lambda", params: args.params, body: bodyId, type: fnType });
	return id;
}

function convertFunctionDeclaration(
	node: ts.FunctionDeclaration,
	state: IngestState,
): string | undefined {
	const name = node.name?.getText();
	if (!name) return undefined;

	const prevFnName = state.currentFunctionName;
	state.currentFunctionName = name;

	const params = node.parameters.map((p) => p.name.getText());
	const paramTypes = node.parameters.map((p) => inferTypeFromAnnotation(p.type));
	const bodyExpr = buildFnBody(node, state, params);

	state.currentFunctionName = prevFnName;

	return emitLambdaNode(state, {
		name, params, paramTypes, bodyExpr, returnType: inferReturnType(node),
	});
}

// ---------- Function body inline ----------

function convertMultiStatement(
	statements: readonly ts.Statement[],
	state: IngestState,
): unknown {
	const exprIds: string[] = [];
	for (const stmt of statements) {
		const id = convertNode(stmt, state);
		if (id !== undefined) exprIds.push(id);
	}
	if (exprIds.length === 0) return undefined;
	if (exprIds.length === 1) return { kind: "ref", id: exprIds[0] };
	return { kind: "do", exprs: exprIds };
}

export function convertFunctionBodyInline(
	body: ts.Block,
	state: IngestState,
	params: string[],
): unknown {
	const statements = body.statements;
	if (statements.length === 0) return undefined;

	const first = statements[0];
	if (
		statements.length === 1 &&
		first !== undefined &&
		ts.isReturnStatement(first) &&
		first.expression
	) {
		return convertExprInline(first.expression, state, params);
	}

	return convertMultiStatement(statements, state);
}

// ---------- If statement ----------

function convertIfStatement(
	node: ts.IfStatement,
	state: IngestState,
): string {
	const condId = convertExpressionToNode(node.expression, state);
	const thenId = convertNodeOrBlock(node.thenStatement, state);
	const elseId = node.elseStatement
		? convertNodeOrBlock(node.elseStatement, state)
		: makeVoidNode(state);

	const ifId = freshId(state);
	addNode(state, ifId, {
		kind: "if",
		cond: condId,
		then: thenId,
		else: elseId,
		type: { kind: "int" },
	});
	return ifId;
}

function convertNodeOrBlock(node: ts.Node, state: IngestState): string {
	if (ts.isBlock(node)) {
		return convertBlock(node, state) ?? makeVoidNode(state);
	}
	return convertNode(node, state) ?? makeVoidNode(state);
}

// ---------- Block ----------

function convertBlock(
	block: ts.Block,
	state: IngestState,
): string | undefined {
	const ids: string[] = [];
	for (const stmt of block.statements) {
		const id = convertNode(stmt, state);
		if (id !== undefined) ids.push(id);
	}

	if (ids.length === 0) return undefined;
	if (ids.length === 1) return ids[0];

	const doId = freshId(state);
	addNode(state, doId, { kind: "do", exprs: ids });
	return doId;
}
