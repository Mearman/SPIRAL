// CAIRS - Computational Algebraic & Iterative Representation System
// Main exports

//==============================================================================
// Types
//==============================================================================

export type {
  AIRDef, AIRDocument,
  CIRDocument, Expr, FunctionSignature, Node, Type, Value
} from "./types.js";

export type { Defs, TypeEnv, ValueEnv } from "./env.js";

export type { ErrorCode, ValidationError, ValidationResult } from "./errors.js";

export type { Operator, OperatorRegistry } from "./domains/registry.js";

//==============================================================================
// Type Constructors
//==============================================================================

export {
  boolType, floatType, fnType, intType, listType,
  mapType, opaqueType, optionType, setType, stringType
} from "./types.js";

export {
  boolVal, closureVal,
  errorVal, floatVal, intVal, listVal, mapVal, opaqueVal, optionVal, setVal, stringVal
} from "./types.js";

//==============================================================================
// Type Guards and Utilities
//==============================================================================

export {
  hashValue, isClosure, isError, isPrimitiveType,
  typeEqual
} from "./types.js";

//==============================================================================
// Error Codes
//==============================================================================

export { ErrorCodes } from "./types.js";

export { CAIRSError } from "./errors.js";

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

export { validateAIR, validateCIR } from "./validator.js";

export { combineResults, invalidResult, validResult } from "./errors.js";

//==============================================================================
// Type Checking
//==============================================================================

export { TypeChecker, typeCheckProgram } from "./typechecker.js";

//==============================================================================
// Evaluation
//==============================================================================

export { evaluateProgram, Evaluator, type EvalOptions } from "./evaluator.js";

//==============================================================================
// Domains
//==============================================================================

export { createCoreRegistry } from "./domains/core.js";

export { createBoolRegistry } from "./domains/bool.js";

export { createListRegistry } from "./domains/list.js";

export { createSetRegistry } from "./domains/set.js";

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
// Schemas
//==============================================================================

export { airSchema, cirSchema } from "./schemas.js";
