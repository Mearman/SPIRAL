// Function expression converters -- Arrow functions and function expressions

import ts from "typescript";
import type { Type } from "../types.ts";
import type { IngestState } from "./types.ts";
import {
	freshId,
	addNode,
	makeVoidExpr,
	wrapInDoIfCall,
	inferTypeFromAnnotation,
	inferReturnType,
} from "./helpers.ts";
import { convertExprInline } from "./convert-expr-inline.ts";
import { convertFunctionBodyInline } from "./convert-node.ts";

interface LambdaArgs {
	params: string[];
	paramTypes: Type[];
	returnType: Type;
	bodyExpr: unknown;
}

function buildLambdaNode(
	state: IngestState,
	args: LambdaArgs,
): string {
	const wrapped = wrapInDoIfCall(args.bodyExpr);
	const bodyId = freshId(state);
	addNode(state, bodyId, wrapped);

	const fnType: Type = {
		kind: "fn",
		params: args.paramTypes,
		returns: args.returnType,
	};

	const id = freshId(state);
	addNode(state, id, {
		kind: "lambda",
		params: args.params,
		body: bodyId,
		type: fnType,
	});
	return id;
}

function getArrowBodyExpr(
	node: ts.ArrowFunction,
	state: IngestState,
	params: string[],
): unknown {
	if (ts.isBlock(node.body)) {
		return convertFunctionBodyInline(node.body, state, params);
	}
	return convertExprInline(node.body, state, params);
}

export function convertArrowFunctionToNode(
	node: ts.ArrowFunction,
	state: IngestState,
): string {
	const params = node.parameters.map((p) => p.name.getText());
	const paramTypes = node.parameters.map((p) =>
		inferTypeFromAnnotation(p.type),
	);

	const bodyExpr = getArrowBodyExpr(node, state, params) ?? makeVoidExpr();

	return buildLambdaNode(state, {
		params,
		paramTypes,
		returnType: inferReturnType(node),
		bodyExpr,
	});
}

export function convertFunctionExpressionToNode(
	node: ts.FunctionExpression,
	state: IngestState,
): string {
	const params = node.parameters.map((p) => p.name.getText());
	const paramTypes = node.parameters.map((p) =>
		inferTypeFromAnnotation(p.type),
	);

	const prevFnName = state.currentFunctionName;
	if (node.name) state.currentFunctionName = node.name.getText();

	const bodyExpr =
		convertFunctionBodyInline(node.body, state, params) ?? makeVoidExpr();

	state.currentFunctionName = prevFnName;

	return buildLambdaNode(state, {
		params,
		paramTypes,
		returnType: inferReturnType(node),
		bodyExpr,
	});
}
