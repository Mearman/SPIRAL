// SPIRAL Type Checker
// Implements typing rules: Gamma |- e : tau

import { lookupOperator, type OperatorRegistry } from "./domains/registry.js";
import { type TypeEnv, emptyTypeEnv, lookupDef, type Defs } from "./env.js";
import { SPIRALError } from "./errors.js";
import type { AIRDocument, Expr, Type } from "./types.js";
import {
	boolType,
	fnType as fnTypeCtor,
	intType,
	typeEqual,
	voidType,
} from "./types.js";
import type { AIRCheckContext, EIRCheckContext } from "./typechecker/context.js";
import { collectLambdaParamsAndLetBindings, identifyBoundNodes } from "./typechecker/bound-nodes.js";
import { typeCheckNode } from "./typechecker/air-checker.js";
import { typeCheckEIRNode } from "./typechecker/eir-checker.js";

//==============================================================================
// Type Checking Result
//==============================================================================

export interface TypeCheckResult {
	type: Type;
	env: TypeEnv;
}

//==============================================================================
// Type Checker Class
//==============================================================================

export class TypeChecker {
	private registry: OperatorRegistry;
	private defs: Defs;

	constructor(registry: OperatorRegistry, defs: Defs) {
		this.registry = registry;
		this.defs = defs;
	}

	typeCheck(expr: Expr, env: TypeEnv): TypeCheckResult {
		return dispatchExpr(this, expr, env);
	}

	getRegistry(): OperatorRegistry {
		return this.registry;
	}

	getDefs(): Defs {
		return this.defs;
	}
}

//==============================================================================
// Expression Type Dispatch
//==============================================================================

/** Simple expression kinds that return directly. */
function dispatchSimpleExpr(expr: Expr, env: TypeEnv): TypeCheckResult | undefined {
	switch (expr.kind) {
	case "lit":
		return { type: expr.type, env };
	case "if":
		return { type: expr.type, env };
	case "let":
		return { type: intType, env };
	case "predicate":
		return { type: boolType, env };
	case "callExpr":
		return { type: intType, env };
	case "fix":
		return { type: expr.type, env };
	default:
		return undefined;
	}
}

/** PIR expression kinds that all return void. */
function isPirExpr(expr: Expr): boolean {
	switch (expr.kind) {
	case "par":
	case "spawn":
	case "await":
	case "channel":
	case "send":
	case "recv":
	case "select":
	case "race":
		return true;
	default:
		return false;
	}
}

function dispatchExpr(checker: TypeChecker, expr: Expr, env: TypeEnv): TypeCheckResult {
	const simple = dispatchSimpleExpr(expr, env);
	if (simple) return simple;
	if (isPirExpr(expr)) return { type: voidType, env };

	switch (expr.kind) {
	case "var":
		return typeCheckVar(expr, env);
	case "ref":
		return typeCheckRef(expr, env);
	case "call":
		return typeCheckCall(checker, expr, env);
	case "airRef":
		return typeCheckAirRef(checker, expr, env);
	case "lambda":
		return typeCheckLambda(expr, env);
	case "do":
		return typeCheckDo(checker, expr, env);
	default:
		throw new Error("Unhandled expression kind: " + expr.kind);
	}
}

function typeCheckVar(
	expr: { kind: "var"; name: string },
	env: TypeEnv,
): TypeCheckResult {
	const type = env.get(expr.name);
	if (!type) {
		return { type: intType, env };
	}
	return { type, env };
}

function typeCheckRef(
	expr: { kind: "ref"; id: string },
	env: TypeEnv,
): TypeCheckResult {
	const varType = env.get(expr.id);
	if (varType) {
		return { type: varType, env };
	}
	throw new Error("Ref must be resolved during program type checking");
}

interface CallArgCheckInput {
	checker: TypeChecker;
	args: (string | Expr)[];
	params: Type[];
	env: TypeEnv;
	opName: string;
}

function typeCheckCall(
	checker: TypeChecker,
	expr: { kind: "call"; ns: string; name: string; args: (string | Expr)[] },
	env: TypeEnv,
): TypeCheckResult {
	const op = lookupOperator(checker.getRegistry(), expr.ns, expr.name);
	if (!op) {
		throw SPIRALError.unknownOperator(expr.ns, expr.name);
	}

	if (op.params.length !== expr.args.length) {
		throw SPIRALError.arityError(op.params.length, expr.args.length, expr.ns + ":" + expr.name);
	}

	checkCallArgs({ checker, args: expr.args, params: op.params, env, opName: expr.ns + ":" + expr.name });

	return { type: op.returns, env };
}

function checkCallArgs(input: CallArgCheckInput): void {
	for (let i = 0; i < input.args.length; i++) {
		const arg = input.args[i];
		const expectedType = input.params[i];
		if (arg === undefined || expectedType === undefined) continue;
		if (typeof arg === "string") continue;
		if ("kind" in arg) {
			const argResult = input.checker.typeCheck(arg, input.env);
			if (!typeEqual(argResult.type, expectedType)) {
				throw SPIRALError.typeError(expectedType, argResult.type, `argument ${i + 1} of ${input.opName}`);
			}
		}
	}
}

function typeCheckAirRef(
	checker: TypeChecker,
	expr: { kind: "airRef"; ns: string; name: string; args: string[] },
	env: TypeEnv,
): TypeCheckResult {
	const def = lookupDef(checker.getDefs(), expr.ns, expr.name);
	if (!def) {
		throw SPIRALError.unknownDefinition(expr.ns, expr.name);
	}

	if (def.params.length !== expr.args.length) {
		throw SPIRALError.arityError(def.params.length, expr.args.length, expr.ns + ":" + expr.name);
	}

	return { type: def.result, env };
}

function typeCheckLambda(
	expr: { kind: "lambda"; params: string[]; body: string; type: Type },
	env: TypeEnv,
): TypeCheckResult {
	if (expr.type.kind !== "fn") {
		throw SPIRALError.typeError(fnTypeCtor([], intType), expr.type, "lambda");
	}
	return { type: expr.type, env };
}

function typeCheckDo(
	checker: TypeChecker,
	expr: { kind: "do"; exprs: (string | Expr)[] },
	env: TypeEnv,
): TypeCheckResult {
	if (expr.exprs.length === 0) {
		return { type: voidType, env };
	}
	let lastResult: TypeCheckResult = { type: voidType, env };
	for (const e of expr.exprs) {
		if (typeof e === "string") {
			throw new Error("Do expr refs must be resolved during program type checking");
		}
		lastResult = checker.typeCheck(e, env);
	}
	return lastResult;
}

//==============================================================================
// Program Type Checking
//==============================================================================

/**
 * Type check a full AIR/CIR program.
 */
export function typeCheckProgram(
	doc: AIRDocument,
	registry: OperatorRegistry,
	defs: Defs,
): { nodeTypes: Map<string, Type>; resultType: Type } {
	const checker = new TypeChecker(registry, defs);
	const nodeTypes = new Map<string, Type>();
	const nodeEnvs = new Map<string, TypeEnv>();

	const nodeMap = new Map<string, import("./types.js").AirHybridNode>();
	for (const node of doc.nodes) {
		nodeMap.set(node.id, node);
	}

	const lambdaParams = collectLambdaParamsAndLetBindings(doc.nodes);
	const boundNodes = identifyBoundNodes(doc.nodes, nodeMap);

	return typeCheckProgramNodes(
		{ checker, nodeMap, nodeTypes, nodeEnvs, env: emptyTypeEnv(), lambdaParams, boundNodes },
		doc,
	);
}

function typeCheckProgramNodes(
	ctx: AIRCheckContext,
	doc: AIRDocument,
): { nodeTypes: Map<string, Type>; resultType: Type } {
	for (const node of doc.nodes) {
		if (ctx.boundNodes.has(node.id)) continue;

		const env = emptyTypeEnv();
		const result = typeCheckNode({ ...ctx, env }, node);
		ctx.nodeTypes.set(node.id, result.type);
		ctx.nodeEnvs.set(node.id, result.env);
	}

	const resultType = ctx.nodeTypes.get(doc.result);
	if (!resultType) {
		throw SPIRALError.validation("result", "Result node not found: " + doc.result);
	}

	return { nodeTypes: ctx.nodeTypes, resultType };
}

//==============================================================================
// EIR Type Checking
//==============================================================================

/** Input for EIR program type checking. */
export interface EIRProgramInput {
	doc: import("./types.js").EIRDocument;
	registry: OperatorRegistry;
	defs: Defs;
	effects: import("./effects.js").EffectRegistry;
}

/**
 * Type check an EIR program with mutation and effects.
 */
export function typeCheckEIRProgram(
	input: EIRProgramInput,
): { nodeTypes: Map<string, Type>; resultType: Type } {
	return runEIRTypeCheck(input);
}

function runEIRTypeCheck(
	input: EIRProgramInput,
): { nodeTypes: Map<string, Type>; resultType: Type } {
	const checker = new TypeChecker(input.registry, input.defs);
	const ctx: EIRCheckContext = {
		checker,
		nodeMap: new Map<string, import("./types.js").EirHybridNode>(),
		nodeTypes: new Map<string, Type>(),
		nodeEnvs: new Map<string, TypeEnv>(),
		mutableTypes: new Map<string, Type>(),
		env: emptyTypeEnv(),
		effects: input.effects,
		lambdaParams: new Set<string>(),
		boundNodes: new Set<string>(),
	};

	for (const node of input.doc.nodes) {
		ctx.nodeMap.set(node.id, node);
	}

	return typeCheckEIRProgramNodes(ctx, input.doc);
}

function typeCheckEIRProgramNodes(
	ctx: EIRCheckContext,
	doc: import("./types.js").EIRDocument,
): { nodeTypes: Map<string, Type>; resultType: Type } {
	for (const node of doc.nodes) {
		const env = emptyTypeEnv();
		const result = typeCheckEIRNode({ ...ctx, env }, node);
		ctx.nodeTypes.set(node.id, result.type);
		ctx.nodeEnvs.set(node.id, result.env);
	}

	const resultType = ctx.nodeTypes.get(doc.result);
	if (!resultType) {
		throw SPIRALError.validation("result", "Result node not found: " + doc.result);
	}

	return { nodeTypes: ctx.nodeTypes, resultType };
}
