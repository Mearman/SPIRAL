// LIR terminator handlers

import { ErrorCodes, exhaustive } from "../errors.ts";
import { lookupValue } from "../env.ts";
import type {
	LirTermBranch,
	LirTermExit,
	LirTermReturn,
	LirTerminator,
	Value,
} from "../types.ts";
import { errorVal, voidVal } from "../types.ts";
import type { LIRRuntimeState } from "./exec-context.ts";

function handleBranch(
	term: LirTermBranch,
	state: LIRRuntimeState,
): string | Value {
	const condValue = lookupValue(state.vars, term.cond);
	if (!condValue) {
		return errorVal(
			ErrorCodes.UnboundIdentifier,
			"Condition variable not found: " + term.cond,
		);
	}
	if (condValue.kind === "error") {
		return condValue;
	}
	if (condValue.kind !== "bool") {
		return errorVal(
			ErrorCodes.TypeError,
			`Branch condition must be bool, got: ${condValue.kind}`,
		);
	}
	return condValue.value ? term.then : term.else;
}

function handleReturn(
	term: LirTermReturn,
	state: LIRRuntimeState,
): Value {
	if (term.value) {
		const returnValue = lookupValue(state.vars, term.value);
		if (!returnValue) {
			return errorVal(
				ErrorCodes.UnboundIdentifier,
				"Return value not found: " + term.value,
			);
		}
		state.returnValue = returnValue;
		return returnValue;
	}
	return voidVal();
}

function handleExit(
	term: LirTermExit,
	state: LIRRuntimeState,
): Value {
	if (term.code !== undefined) {
		const codeStr = typeof term.code === "number"
			? String(term.code)
			: term.code;
		const codeValue = lookupValue(state.vars, codeStr);
		if (codeValue) {
			return codeValue;
		}
	}
	return voidVal();
}

export function executeTerminator(
	term: LirTerminator,
	state: LIRRuntimeState,
): string | Value {
	switch (term.kind) {
	case "jump":
		return term.to;
	case "branch":
		return handleBranch(term, state);
	case "return":
		return handleReturn(term, state);
	case "exit":
		return handleExit(term, state);
	default:
		return exhaustive(term);
	}
}
