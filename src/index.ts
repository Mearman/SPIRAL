// SPIRAL - Computational Algebraic & Iterative Representation System
// Main exports

//==============================================================================
// Types
//==============================================================================

export type {
	AIRDef, AIRDocument,
	CIRDocument, DoExpr, EIRDocument, Expr, FunctionSignature, Node, Type, Value,
	// EIR/LIR Types
	EvalState, Effect,
	LIRDocument, LirBlock, LirInstruction, LirTerminator,
	EirExpr,
} from "./types.js";

export type { Defs, TypeEnv, ValueEnv } from "./env.js";

export type { ErrorCode, ValidationError, ValidationResult } from "./errors.js";

export type { Operator, OperatorRegistry } from "./domains/registry.js";

export type { EffectOp, EffectRegistry } from "./effects.js";

//==============================================================================
// Type Constructors
//==============================================================================

export {
	boolType, floatType, fnType, intType, listType,
	mapType, opaqueType, optionType, setType, stringType,
	// EIR types
	refType, voidType,
} from "./types.js";

export {
	boolVal, closureVal,
	errorVal, floatVal, intVal, listVal, mapVal, opaqueVal, optionVal, setVal, stringVal,
	// EIR values
	voidVal, refCellVal,
} from "./types.js";

//==============================================================================
// Type Guards and Utilities
//==============================================================================

export {
	hashValue, isClosure, isError, isPrimitiveType,
	typeEqual,
	// EIR type guards
	isRefCell, isVoid,
	// EIR utilities
	emptyEvalState, createEvalState,
} from "./types.js";

//==============================================================================
// Error Codes
//==============================================================================

export { ErrorCodes, SPIRALError } from "./errors.js";

//==============================================================================
// Environment Functions
//==============================================================================

export {
	defKey, emptyTypeEnv, emptyValueEnv, extendTypeEnv,
	extendTypeEnvMany, extendValueEnv,
	extendValueEnvMany, lookupDef, lookupType, lookupValue, registerDef
} from "./env.js";

//==============================================================================
// Validation
//==============================================================================

export { validateAIR, validateCIR, validateEIR, validateLIR } from "./validator.js";

export { combineResults, invalidResult, validResult } from "./errors.js";

//==============================================================================
// Type Checking
//==============================================================================

export { TypeChecker, typeCheckProgram } from "./typechecker.js";

export { typeCheckEIRProgram, type EIRProgramInput } from "./typechecker.js";

//==============================================================================
// Evaluation
//==============================================================================

export { evaluateProgram, Evaluator, type EvalOptions } from "./evaluator.js";

// EIR evaluation
export { evaluateEIR, type EIROptions } from "./evaluator.js";

//==============================================================================
// Domains
//==============================================================================

export { bootstrapRegistry, createKernelRegistry } from "./stdlib/bootstrap.js";

export { createCoreRegistry } from "./domains/core.js";

export { createBoolRegistry } from "./domains/bool.js";

export { createListRegistry } from "./domains/list.js";

export { createSetRegistry } from "./domains/set.js";

export { createStringRegistry } from "./domains/string.js";

export { createMapRegistry } from "./domains/map.js";

export {
	defineOperator, lookupOperator, registerOperator, type OperatorBuilder
} from "./domains/registry.js";

//==============================================================================
// CIR Substitution
//==============================================================================

export {
	alphaRename,
	collectFreeVars, freshName,
	substitute, substituteEnv
} from "./cir/substitution.js";

//==============================================================================
// Effects Registry
//==============================================================================

export {
	createDefaultEffectRegistry,
	createQueuedEffectRegistry,
	defaultEffectRegistry,
	emptyEffectRegistry,
	lookupEffect,
	registerEffect,
	ioEffects,
	stateEffects,
} from "./effects.js";

//==============================================================================
// LIR
//==============================================================================

export { evaluateLIR, type LIREvalOptions } from "./lir/evaluator.js";

export { lowerEIRtoLIR } from "./lir/lower.js";
export { lowerAsyncEIRtoLIR } from "./lir/lower-async-doc.js";

//==============================================================================
// Async Evaluation
//==============================================================================

export { AsyncEvaluator, type AsyncEvalOptions } from "./async-evaluator.js";
export { createTaskScheduler, createDeterministicScheduler, type TaskScheduler, type SchedulerMode } from "./scheduler.js";
export {
	createAsyncChannelStore,
	createAsyncRefCell,
	createAsyncMutex,
	createAsyncChannel,
	createConcurrentEffectLog,
	type AsyncChannelStore,
	type AsyncChannel,
	type AsyncRefCell,
	type AsyncMutex,
	type ConcurrentEffectLog,
} from "./async-effects.js";

//==============================================================================
// Concurrent Execution Detectors
//==============================================================================

export {
	RaceDetector,
	DeadlockDetector,
	createRaceDetector,
	createDeadlockDetector,
	createDetectors,
	type DetectionOptions,
	type RaceCondition,
	type DeadlockCycle,
	type DetectionResult,
	DEFAULT_DETECTION_OPTIONS,
	STRICT_DETECTION_OPTIONS,
} from "./detectors.js";

//==============================================================================
// Synthesis
//==============================================================================

export { synthesizePython, type PythonSynthOptions } from "./synth/python.js";
export { synthesizeTypeScript, type TypeScriptSynthOptions } from "./synth/typescript.js";

//==============================================================================
// CLI Utilities
//==============================================================================

export {
	parseInputString,
	readInputsFile,
	parseArgs,
	type Options as CLIOptions,
} from "./cli-utils.js";

//==============================================================================
// Canonicalization (JCS)
//==============================================================================

export {
	canonicalize,
	canonicalizeNode,
	documentDigest,
	nodeDigest,
	stripMetadata,
} from "./canonicalize.js";

//==============================================================================
// Schemas
//==============================================================================

export {
	airSchema,
	cirSchema,
	eirSchema,
	lirSchema,
	spiralSchema,
	isAIRSchema,
	isCIRSchema,
	isEIRSchema,
	isLIRSchema,
	isSPIRALSchema,
} from "./schemas.js";

export type { SPIRALDocument } from "./zod-schemas.js";

//==============================================================================
// Ingest
//==============================================================================

export { ingestTypeScript, type TypeScriptIngestOptions } from "./ingest/typescript.js";
export { ingestPython, type PythonIngestOptions } from "./ingest/python.js";
