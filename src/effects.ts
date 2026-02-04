// SPIRAL Effect System
// Effect registry and built-in effects for EIR

import type { Type, Value } from "./types.ts";
import {
	intType,
	stringType,
	voidType,
	intVal,
	stringVal,
	errorVal,
	ErrorCodes,
} from "./types.ts";

//==============================================================================
// Effect Operation Signature
//==============================================================================

export interface EffectOp {
	name: string;
	params: Type[];
	returns: Type;
	pure: boolean;
	// Effect operations return their result directly
	// Side effects are tracked in the EvalState
	fn: (...args: Value[]) => Value;
}

//==============================================================================
// Effect Registry
//==============================================================================

export type EffectRegistry = Map<string, EffectOp>;

/**
 * Look up an effect operation by name
 */
export function lookupEffect(
	registry: EffectRegistry,
	name: string,
): EffectOp | undefined {
	return registry.get(name);
}

/**
 * Register an effect operation
 */
export function registerEffect(
	registry: EffectRegistry,
	op: EffectOp,
): EffectRegistry {
	const newRegistry = new Map(registry);
	newRegistry.set(op.name, op);
	return newRegistry;
}

/**
 * Create an empty effect registry
 */
export function emptyEffectRegistry(): EffectRegistry {
	return new Map();
}

//==============================================================================
// Built-in Effect Operations
//==============================================================================

/**
 * IO effects - print, read, etc.
 * These effects store their actions in the EvalState effects array
 * for the host runtime to handle
 */
export const ioEffects: EffectOp[] = [
	{
		name: "print",
		params: [stringType],
		returns: voidType,
		pure: false,
		fn: (...args: Value[]) => {
			// Validate expected args (mock implementation would print args[0])
			if (args.length < 1) {
				return errorVal(ErrorCodes.ArityError, "print requires 1 argument");
			}
			return { kind: "void" };
		},
	},
	{
		name: "printInt",
		params: [intType],
		returns: voidType,
		pure: false,
		fn: (...args: Value[]) => {
			// Validate expected args (mock implementation would print args[0])
			if (args.length < 1) {
				return errorVal(ErrorCodes.ArityError, "printInt requires 1 argument");
			}
			return { kind: "void" };
		},
	},
	{
		name: "readLine",
		params: [],
		returns: stringType,
		pure: false,
		fn: (...args: Value[]) => {
			// Validate no args expected
			if (args.length > 0) {
				return errorVal(ErrorCodes.ArityError, "readLine accepts no arguments");
			}
			return stringVal(""); // runner supplies actual value
		},
	},
	{
		name: "readInt",
		params: [],
		returns: intType,
		pure: false,
		fn: (...args: Value[]) => {
			// Validate no args expected
			if (args.length > 0) {
				return errorVal(ErrorCodes.ArityError, "readInt accepts no arguments");
			}
			return intVal(0); // runner supplies actual value
		},
	},
];

/**
 * State effects - get/set mutable state
 */
export const stateEffects: EffectOp[] = [
	{
		name: "getState",
		params: [],
		returns: stringType,
		pure: false,
		fn: (...args: Value[]) => {
			// Validate no args expected
			if (args.length > 0) {
				return errorVal(ErrorCodes.ArityError, "getState accepts no arguments");
			}
			// Return a mock state value
			return { kind: "string", value: "mock-state" };
		},
	},
	{
		name: "setState",
		params: [stringType],
		returns: voidType,
		pure: false,
		fn: (...args: Value[]) => {
			// Validate expected args
			if (args.length < 1) {
				return errorVal(ErrorCodes.ArityError, "setState requires 1 argument");
			}
			// In a real implementation, this would update state with args[0]
			return { kind: "void" };
		},
	},
];

/**
 * Create a default effect registry with all built-in effects
 */
export function createDefaultEffectRegistry(): EffectRegistry {
	let registry = emptyEffectRegistry();
	for (const op of [...ioEffects, ...stateEffects]) {
		registry = registerEffect(registry, op);
	}
	return registry;
}

/**
 * Default registry instance
 */
export const defaultEffectRegistry = createDefaultEffectRegistry();

/**
 * Create an effect registry with queue-backed input effects
 * Used for interactive examples with deterministic input handling
 *
 * @param inputs - Array of input values (strings or numbers)
 * @returns EffectRegistry with readLine/readInt bound to the input queue
 */
function registerPrintEffects(registry: EffectRegistry): EffectRegistry {
	let reg = registry;
	reg = registerEffect(reg, {
		name: "print",
		params: [stringType],
		returns: voidType,
		pure: false,
		fn: (...args: Value[]) => {
			if (args.length < 1) {
				return errorVal(ErrorCodes.ArityError, "print requires 1 argument");
			}
			return { kind: "void" };
		},
	});
	reg = registerEffect(reg, {
		name: "printInt",
		params: [intType],
		returns: voidType,
		pure: false,
		fn: (...args: Value[]) => {
			if (args.length < 1) {
				return errorVal(ErrorCodes.ArityError, "printInt requires 1 argument");
			}
			return { kind: "void" };
		},
	});
	return reg;
}

function registerQueuedReadEffects(
	registry: EffectRegistry,
	inputQueue: (string | number)[],
): EffectRegistry {
	let reg = registry;
	reg = registerEffect(reg, {
		name: "readLine",
		params: [],
		returns: stringType,
		pure: false,
		fn: (...args: Value[]) => {
			if (args.length > 0) {
				return errorVal(ErrorCodes.ArityError, "readLine accepts no arguments");
			}
			if (inputQueue.length === 0) {
				return stringVal("");
			}
			const next = inputQueue.shift();
			return stringVal(String(next));
		},
	});
	reg = registerEffect(reg, {
		name: "readInt",
		params: [],
		returns: intType,
		pure: false,
		fn: (...args: Value[]) => {
			if (args.length > 0) {
				return errorVal(ErrorCodes.ArityError, "readInt accepts no arguments");
			}
			if (inputQueue.length === 0) {
				return intVal(0);
			}
			const next = inputQueue.shift();
			const num = typeof next === "number" ? next : parseInt(String(next), 10);
			return intVal(Number.isNaN(num) ? 0 : num);
		},
	});
	return reg;
}

export function createQueuedEffectRegistry(inputs: (string | number)[]): EffectRegistry {
	const inputQueue = [...inputs]; // Make a copy to avoid mutations

	let registry = emptyEffectRegistry();
	registry = registerPrintEffects(registry);
	registry = registerQueuedReadEffects(registry, inputQueue);

	for (const op of stateEffects) {
		registry = registerEffect(registry, op);
	}

	return registry;
}
