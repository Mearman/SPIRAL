// Type checking context - consolidates parameters for node type checking functions

import type { TypeEnv, Defs } from "../env.ts";
import type { TypeChecker, TypeCheckResult } from "../typechecker.ts";
import type { AirHybridNode, Type } from "../types.ts";

/**
 * Context for AIR/CIR node type checking.
 * Consolidates the many parameters previously passed individually.
 */
export interface AIRCheckContext {
	checker: TypeChecker;
	nodeMap: ReadonlyMap<string, { id: string }>;
	nodeTypes: Map<string, Type>;
	nodeEnvs: Map<string, TypeEnv>;
	env: TypeEnv;
	lambdaParams: Set<string>;
	boundNodes: Set<string>;
	/** Document $defs for JSON Pointer reference resolution */
	docDefs?: Record<string, unknown> | undefined;
}

/**
 * Context for EIR node type checking.
 * Extends AIR context with EIR-specific fields.
 */
export interface EIRCheckContext {
	checker: TypeChecker;
	nodeMap: Map<string, import("../types.js").EirHybridNode>;
	nodeTypes: Map<string, Type>;
	nodeEnvs: Map<string, TypeEnv>;
	mutableTypes: Map<string, Type>;
	env: TypeEnv;
	effects: import("../effects.js").EffectRegistry;
	lambdaParams: Set<string>;
	boundNodes: Set<string>;
	/** Document $defs for JSON Pointer reference resolution */
	docDefs?: Record<string, unknown> | undefined;
}

export type { TypeCheckResult, TypeChecker, TypeEnv, Defs, AirHybridNode, Type };
