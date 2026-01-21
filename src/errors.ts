// CAIRS Error Types
// Error domain for type checking and evaluation errors

import type { Type, Value } from "./types.js";

//==============================================================================
// Error Codes
//==============================================================================

export const ErrorCodes = {
	// Type errors
	TypeError: "TypeError",
	ArityError: "ArityError",

	// Domain errors
	DomainError: "DomainError",
	DivideByZero: "DivideByZero",

	// Lookup errors
	UnknownOperator: "UnknownOperator",
	UnknownDefinition: "UnknownDefinition",
	UnboundIdentifier: "UnboundIdentifier",

	// Termination errors
	NonTermination: "NonTermination",

	// Validation errors
	ValidationError: "ValidationError",
	MissingRequiredField: "MissingRequiredField",
	InvalidIdFormat: "InvalidIdFormat",
	InvalidTypeFormat: "InvalidTypeFormat",
	InvalidExprFormat: "InvalidExprFormat",
	DuplicateNodeId: "DuplicateNodeId",
	InvalidResultReference: "InvalidResultReference",
	CyclicReference: "CyclicReference",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

//==============================================================================
// CAIRS Error Class
//==============================================================================

export class CAIRSError extends Error {
	readonly code: ErrorCode;
	readonly meta?: Map<string, Value>;

	constructor(code: ErrorCode, message: string, meta?: Map<string, Value>) {
		super(message);
		this.name = "CAIRSError";
		this.code = code;
		if (meta !== undefined) this.meta = meta;
	}

	/**
	 * Convert to Value representation
	 */
	toValue(): Value {
		const result: Value = {
			kind: "error",
			code: this.code,
		};
		// Only include optional properties if they have values
		// Required for exactOptionalPropertyTypes compatibility
		if (this.meta !== undefined) {
			result.meta = this.meta;
		}
		return result;
	}

	/**
	 * Create a TypeError
	 */
	static typeError(expected: Type, got: Type, context?: string): CAIRSError {
		const ctx = context ? " (" + context + ")" : "";
		return new CAIRSError(
			ErrorCodes.TypeError,
			"Type error" +
				ctx +
				": expected " +
				formatType(expected) +
				", got " +
				formatType(got),
		);
	}

	/**
	 * Create an ArityError
	 */
	static arityError(expected: number, got: number, name: string): CAIRSError {
		return new CAIRSError(
			ErrorCodes.ArityError,
			"Arity error: " +
				name +
				" expects " +
				String(expected) +
				" arguments, got " +
				String(got),
		);
	}

	/**
	 * Create a DomainError
	 */
	static domainError(message: string): CAIRSError {
		return new CAIRSError(ErrorCodes.DomainError, message);
	}

	/**
	 * Create a DivideByZero error
	 */
	static divideByZero(): CAIRSError {
		return new CAIRSError(ErrorCodes.DivideByZero, "Division by zero");
	}

	/**
	 * Create an UnknownOperator error
	 */
	static unknownOperator(ns: string, name: string): CAIRSError {
		return new CAIRSError(
			ErrorCodes.UnknownOperator,
			"Unknown operator: " + ns + ":" + name,
		);
	}

	/**
	 * Create an UnknownDefinition error
	 */
	static unknownDefinition(ns: string, name: string): CAIRSError {
		return new CAIRSError(
			ErrorCodes.UnknownDefinition,
			"Unknown definition: " + ns + ":" + name,
		);
	}

	/**
	 * Create an UnboundIdentifier error
	 */
	static unboundIdentifier(name: string): CAIRSError {
		return new CAIRSError(
			ErrorCodes.UnboundIdentifier,
			"Unbound identifier: " + name,
		);
	}

	/**
	 * Create a NonTermination error
	 */
	static nonTermination(): CAIRSError {
		return new CAIRSError(
			ErrorCodes.NonTermination,
			"Expression evaluation did not terminate",
		);
	}

	/**
	 * Create a ValidationError
	 */
	static validation(
		path: string,
		message: string,
		value?: unknown,
	): CAIRSError {
		return new CAIRSError(
			ErrorCodes.ValidationError,
			"Validation error at " +
				path +
				": " +
				message +
				(value !== undefined ? " (value: " + JSON.stringify(value) + ")" : ""),
		);
	}
}

//==============================================================================
// Type Formatting (for error messages)
//==============================================================================

function formatType(t: Type): string {
	switch (t.kind) {
	case "bool":
		return "bool";
	case "int":
		return "int";
	case "float":
		return "float";
	case "string":
		return "string";
	case "void":
		return "void";
	case "set":
		return "set<" + formatType(t.of) + ">";
	case "list":
		return "list<" + formatType(t.of) + ">";
	case "map":
		return "map<" + formatType(t.key) + ", " + formatType(t.value) + ">";
	case "option":
		return "option<" + formatType(t.of) + ">";
	case "ref":
		return "ref<" + formatType(t.of) + ">";
	case "opaque":
		return "opaque(" + t.name + ")";
	case "fn":
		return (
			"fn(" +
				t.params.map(formatType).join(", ") +
				") -> " +
				formatType(t.returns)
		);
	default:
		return "unknown";
	}
}

//==============================================================================
// Validation Error Type
//==============================================================================

export interface ValidationError {
	path: string;
	message: string;
	value?: unknown;
}

export interface ValidationResult<T> {
	valid: boolean;
	errors: ValidationError[];
	value?: T;
}

/**
 * Create a successful validation result.
 */
export function validResult<T>(value: T): ValidationResult<T> {
	return { valid: true, errors: [], value };
}

/**
 * Create a failed validation result.
 */
export function invalidResult<T>(
	errors: ValidationError[],
): ValidationResult<T> {
	return { valid: false, errors };
}

/**
 * Combine multiple validation results.
 */
export function combineResults<T>(
	results: ValidationResult<T>[],
): ValidationResult<T[]> {
	const allErrors = results.flatMap((r) => r.errors);
	if (allErrors.length > 0) {
		return invalidResult(allErrors);
	}
	return validResult(results.map((r) => r.value!));
}

//==============================================================================
// Exhaustiveness Checking
//==============================================================================

/**
 * Asserts that a value is `never`, ensuring exhaustive type checking.
 * Use in switch default cases to ensure all variants are handled.
 *
 * @example
 * switch (expr.kind) {
 *   case "lit": return ...;
 *   case "var": return ...;
 *   default:
 *     exhaustive(expr); // Type error if a kind is missing
 * }
 */
export function exhaustive(value: never): never {
	throw new Error(`Unexpected value: ${String(value)}`);
}
