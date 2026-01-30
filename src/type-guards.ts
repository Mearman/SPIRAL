// SPIRAL Type Guard Utilities
// Runtime assertion functions for type narrowing without type assertions

/**
 * Assert that a value is a Record<string, unknown>.
 * Use after validation has confirmed the value is an object.
 */
export function assertRecord(v: unknown): asserts v is Record<string, unknown> {
	if (typeof v !== "object" || v === null || Array.isArray(v)) {
		throw new TypeError("Expected object");
	}
}

/**
 * Assert that a value is a string.
 */
export function assertString(v: unknown): asserts v is string {
	if (typeof v !== "string") {
		throw new TypeError("Expected string");
	}
}

/**
 * Assert that a value is an array.
 */
export function assertArray(v: unknown): asserts v is unknown[] {
	if (!Array.isArray(v)) {
		throw new TypeError("Expected array");
	}
}

/**
 * Assert that a value is a number.
 */
export function assertNumber(v: unknown): asserts v is number {
	if (typeof v !== "number") {
		throw new TypeError("Expected number");
	}
}

/**
 * Assert that a value is a boolean.
 */
export function assertBoolean(v: unknown): asserts v is boolean {
	if (typeof v !== "boolean") {
		throw new TypeError("Expected boolean");
	}
}
