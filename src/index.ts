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
} from "./types.ts";

export type { Defs, TypeEnv, ValueEnv } from "./env.ts";

export type { ErrorCode, ValidationError, ValidationResult } from "./errors.ts";

export type { Operator, OperatorRegistry } from "./domains/registry.ts";

export type { EffectOp, EffectRegistry } from "./effects.ts";

//==============================================================================
// Type Constructors
//==============================================================================

export {
	boolType, floatType, fnType, intType, listType,
	mapType, opaqueType, optionType, setType, stringType,
	// EIR types
	refType, voidType,
} from "./types.ts";

export {
	boolVal, closureVal,
	errorVal, floatVal, intVal, listVal, mapVal, opaqueVal, optionVal, setVal, stringVal,
	// EIR values
	voidVal, refCellVal,
} from "./types.ts";

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
} from "./types.ts";

//==============================================================================
// Error Codes
//==============================================================================

export { ErrorCodes, SPIRALError } from "./errors.ts";

//==============================================================================
// Environment Functions
//==============================================================================

export {
	defKey, emptyTypeEnv, emptyValueEnv, extendTypeEnv,
	extendTypeEnvMany, extendValueEnv,
	extendValueEnvMany, lookupDef, lookupType, lookupValue, registerDef
} from "./env.ts";

//==============================================================================
// Validation
//==============================================================================

export { validateAIR, validateCIR, validateEIR, validateLIR } from "./validator.ts";

export { combineResults, invalidResult, validResult } from "./errors.ts";

//==============================================================================
// Type Checking
//==============================================================================

export { TypeChecker, typeCheckProgram } from "./typechecker.ts";

export { typeCheckEIRProgram, type EIRProgramInput } from "./typechecker.ts";

//==============================================================================
// Evaluation
//==============================================================================

export { evaluateProgram, Evaluator, type EvalOptions } from "./evaluator.ts";

// EIR evaluation
export { evaluateEIR, type EIROptions } from "./evaluator.ts";

//==============================================================================
// Domains
//==============================================================================

export { bootstrapRegistry, createKernelRegistry } from "./stdlib/bootstrap.ts";

export {
	defineOperator, lookupOperator, registerOperator, type OperatorBuilder
} from "./domains/registry.ts";

//==============================================================================
// CIR Substitution
//==============================================================================

export {
	alphaRename,
	collectFreeVars, freshName,
	substitute, substituteEnv
} from "./cir/substitution.ts";

//==============================================================================
// CIRDocument ↔ Value Conversion (Self-Hosting)
//==============================================================================

export {
	cirDocumentToValue,
	cirDocumentToValueRaw,
	valueToCirDocument,
} from "./cir-conv.ts";

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
} from "./effects.ts";

//==============================================================================
// LIR
//==============================================================================

export { evaluateLIR, type LIREvalOptions } from "./lir/evaluator.ts";

export { lowerEIRtoLIR } from "./lir/lower.ts";
export { lowerAsyncEIRtoLIR } from "./lir/lower-async-doc.ts";

//==============================================================================
// Async Evaluation
//==============================================================================

export { AsyncEvaluator, type AsyncEvalOptions } from "./async-evaluator.ts";
export { createTaskScheduler, createDeterministicScheduler, type TaskScheduler, type SchedulerMode } from "./scheduler.ts";
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
} from "./async-effects.ts";

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
} from "./detectors.ts";

//==============================================================================
// Synthesis
//==============================================================================

export { synthesizePython, type PythonSynthOptions } from "./synth/python.ts";
export { synthesizeTypeScript, type TypeScriptSynthOptions } from "./synth/typescript.ts";

//==============================================================================
// CLI Utilities
//==============================================================================

export {
	parseInputString,
	readInputsFile,
	parseArgs,
	type Options as CLIOptions,
} from "./cli-utils.ts";

//==============================================================================
// Canonicalization (JCS)
//==============================================================================

export {
	canonicalize,
	canonicalizeNode,
	documentDigest,
	nodeDigest,
	stripMetadata,
} from "./canonicalize.ts";

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
} from "./schemas.ts";

export type { SPIRALDocument } from "./zod-schemas.ts";

//==============================================================================
// Ingest
//==============================================================================

export { ingestTypeScript, type TypeScriptIngestOptions } from "./ingest/typescript.ts";
export { ingestPython, type PythonIngestOptions } from "./ingest/python.ts";
