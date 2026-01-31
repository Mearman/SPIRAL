// SPIRAL Evaluator
// Implements big-step evaluation: rho |- e => v
//
// Split into sub-modules for maintainability:
// - evaluator/types.ts     - shared types and interfaces
// - evaluator/helpers.ts   - Evaluator class, applyOperator, evaluateLitExpr
// - evaluator/lit-eval.ts  - full literal evaluation
// - evaluator/block-eval.ts - CFG block node evaluation
// - evaluator/air-program.ts - evaluateProgram entry point
// - evaluator/air-node.ts  - evalNode dispatch
// - evaluator/air-node-fn.ts - callExpr/fix/airRef handlers
// - evaluator/air-expr.ts  - evalExprWithNodeMap
// - evaluator/eir-eval.ts  - evaluateEIR entry point
// - evaluator/eir-loop.ts  - while/for/iter loops
// - evaluator/eir-try.ts   - try/catch expression

export type { EvalOptions, EIROptions } from "./evaluator/types.js";
export { Evaluator } from "./evaluator/helpers.js";
export { evaluateProgram } from "./evaluator/air-program.js";
export { evaluateEIR } from "./evaluator/eir-eval.js";
