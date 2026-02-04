// SPDX-License-Identifier: MIT
// Resolution-specific Error Types for SPIRAL $ref System

import { errorVal } from "../types.ts";

//==============================================================================
// Resolution Error Codes
//==============================================================================

export enum ResolutionErrorCode {
	/** JSON Pointer syntax is invalid */
	InvalidJsonPointer = "InvalidJsonPointer",

	/** JSON Pointer reference did not resolve to a valid value */
	ResolutionFailed = "ResolutionFailed",

	/** Circular reference detected in import chain */
	CircularReference = "CircularReference",

	/** Maximum import depth exceeded (possible circular import) */
	MaxDepthExceeded = "MaxDepthExceeded",

	/** Failed to load external document */
	DocumentLoadFailed = "DocumentLoadFailed",

	/** Unsupported URI scheme */
	UnsupportedScheme = "UnsupportedScheme",
}

//==============================================================================
// Resolution Error Classes
//==============================================================================

/** Base class for all resolution errors */
export class ResolutionError extends Error {
	constructor(
		message: string,
		public readonly resolutionCode: ResolutionErrorCode,
		public override cause?: unknown,
	) {
		super(message);
		this.name = "ResolutionError";
	}

	toValue() {
		return errorVal(this.resolutionCode as any, this.message);
	}
}

/** Error thrown when JSON Pointer syntax is invalid */
export class InvalidJsonPointerError extends ResolutionError {
	constructor(pointer: string, reason: string) {
		super(
			`Invalid JSON Pointer "${pointer}": ${reason}`,
			ResolutionErrorCode.InvalidJsonPointer,
		);
		this.name = "InvalidJsonPointerError";
	}
}

/** Error thrown when JSON Pointer resolution fails */
export class ResolutionFailedError extends ResolutionError {
	constructor(ref: string, reason: string) {
		super(
			`Failed to resolve reference "${ref}": ${reason}`,
			ResolutionErrorCode.ResolutionFailed,
		);
		this.name = "ResolutionFailedError";
	}
}

/** Error thrown when circular references are detected */
export class CircularReferenceError extends ResolutionError {
	public readonly path: string[];

	constructor(path: string[]) {
		super(
			`Circular reference detected: ${path.join(" -> ")}`,
			ResolutionErrorCode.CircularReference,
		);
		this.name = "CircularReferenceError";
		this.path = path;
	}
}

/** Error thrown when maximum import depth is exceeded */
export class MaxDepthExceededError extends ResolutionError {
	constructor(maxDepth: number) {
		super(
			`Maximum import depth exceeded (limit: ${maxDepth}). Possible circular import.`,
			ResolutionErrorCode.MaxDepthExceeded,
		);
		this.name = "MaxDepthExceededError";
	}
}

/** Error thrown when document loading fails */
export class DocumentLoadFailedError extends ResolutionError {
	constructor(uri: string, reason: string) {
		super(
			`Failed to load document "${uri}": ${reason}`,
			ResolutionErrorCode.DocumentLoadFailed,
		);
		this.name = "DocumentLoadFailedError";
	}
}

/** Error thrown when URI scheme is not supported */
export class UnsupportedSchemeError extends ResolutionError {
	constructor(scheme: string) {
		super(
			`Unsupported URI scheme: "${scheme}". Supported schemes: file, http, https, stdlib`,
			ResolutionErrorCode.UnsupportedScheme,
		);
		this.name = "UnsupportedSchemeError";
	}
}
