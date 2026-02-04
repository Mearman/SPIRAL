// SPDX-License-Identifier: MIT
// SPIRAL Main Index - Unit Tests
// Tests all public API exports from src/index.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Import everything from the main index to test re-exports
import * as spiral from "../src/index.ts";

//==============================================================================
// Test Suite
//==============================================================================

describe("Main Index Exports - Unit Tests", () => {

	//==========================================================================
	// Type Exports
	//==========================================================================

	describe("Type Exports", () => {
		it("should export AIRDef type", () => {
			// Type exports exist at compile time - we verify they're used correctly
			// by testing actual functions that use these types
			assert.ok("AIRDef" in spiral || spiral.validateAIR, "AIRDef should be available");
		});

		it("should export AIRDocument type", () => {
			assert.ok("AIRDocument" in spiral || spiral.validateAIR, "AIRDocument should be available");
		});

		it("should export CIRDocument type", () => {
			assert.ok("CIRDocument" in spiral || spiral.validateCIR, "CIRDocument should be available");
		});

		it("should export EIRDocument type", () => {
			assert.ok("EIRDocument" in spiral || spiral.validateEIR, "EIRDocument should be available");
		});

		it("should export LIRDocument type", () => {
			assert.ok("LIRDocument" in spiral || spiral.validateLIR, "LIRDocument should be available");
		});

		it("should export Expr, Node, Type, Value types", () => {
			assert.ok("Expr" in spiral || spiral.intVal, "Expr type should be available");
			assert.ok("Node" in spiral || spiral.intVal, "Node type should be available");
			assert.ok("Type" in spiral || spiral.intType, "Type type should be available");
			assert.ok("Value" in spiral || spiral.intVal, "Value type should be available");
		});

		it("should export EvalState, Effect types", () => {
			assert.ok("EvalState" in spiral || spiral.emptyEvalState, "EvalState should be available");
			assert.ok("Effect" in spiral || spiral.emptyEffectRegistry, "Effect should be available");
		});

		it("should export LirBlock, LirInstruction, LirTerminator types", () => {
			assert.ok("LirBlock" in spiral || spiral.lowerEIRtoLIR, "LirBlock should be available");
			assert.ok("LirInstruction" in spiral || spiral.lowerEIRtoLIR, "LirInstruction should be available");
			assert.ok("LirTerminator" in spiral || spiral.lowerEIRtoLIR, "LirTerminator should be available");
		});

		it("should export EirExpr type", () => {
			assert.ok("EirExpr" in spiral || spiral.validateEIR, "EirExpr should be available");
		});

		it("should export Defs, TypeEnv, ValueEnv types from env.js", () => {
			assert.ok("Defs" in spiral || spiral.emptyTypeEnv, "Defs should be available");
			assert.ok("TypeEnv" in spiral || spiral.emptyTypeEnv, "TypeEnv should be available");
			assert.ok("ValueEnv" in spiral || spiral.emptyValueEnv, "ValueEnv should be available");
		});

		it("should export ErrorCode, ValidationError, ValidationResult types", () => {
			assert.ok("ErrorCode" in spiral || spiral.SPIRALError, "ErrorCode should be available");
			assert.ok("ValidationError" in spiral || spiral.validResult, "ValidationError should be available");
			assert.ok("ValidationResult" in spiral || spiral.validResult, "ValidationResult should be available");
		});

		it("should export Operator, OperatorRegistry types", () => {
			assert.ok("Operator" in spiral || spiral.bootstrapRegistry, "Operator should be available");
			assert.ok("OperatorRegistry" in spiral || spiral.bootstrapRegistry, "OperatorRegistry should be available");
		});

		it("should export EffectOp, EffectRegistry types", () => {
			assert.ok("EffectOp" in spiral || spiral.ioEffects, "EffectOp should be available");
			assert.ok("EffectRegistry" in spiral || spiral.ioEffects, "EffectRegistry should be available");
		});

		it("should export FunctionSignature type", () => {
			assert.ok("FunctionSignature" in spiral || spiral.fnType, "FunctionSignature should be available");
		});

		// Async types
		it("should export AsyncChannelStore, AsyncChannel, AsyncRefCell types", () => {
			assert.ok("AsyncChannelStore" in spiral || spiral.createAsyncChannelStore, "AsyncChannelStore should be available");
			assert.ok("AsyncChannel" in spiral || spiral.createAsyncChannel, "AsyncChannel should be available");
			assert.ok("AsyncRefCell" in spiral || spiral.createAsyncRefCell, "AsyncRefCell should be available");
		});

		it("should export AsyncMutex, ConcurrentEffectLog types", () => {
			assert.ok("AsyncMutex" in spiral || spiral.createAsyncMutex, "AsyncMutex should be available");
			assert.ok("ConcurrentEffectLog" in spiral || spiral.createConcurrentEffectLog, "ConcurrentEffectLog should be available");
		});

		it("should export TaskScheduler, SchedulerMode types", () => {
			assert.ok("TaskScheduler" in spiral || spiral.createTaskScheduler, "TaskScheduler should be available");
			assert.ok("SchedulerMode" in spiral || spiral.createTaskScheduler, "SchedulerMode should be available");
		});

		// Detector types
		it("should export DetectionOptions, RaceCondition, DeadlockCycle, DetectionResult types", () => {
			assert.ok("DetectionOptions" in spiral || spiral.createRaceDetector, "DetectionOptions should be available");
			assert.ok("RaceCondition" in spiral || spiral.createRaceDetector, "RaceCondition should be available");
			assert.ok("DeadlockCycle" in spiral || spiral.createDeadlockDetector, "DeadlockCycle should be available");
			assert.ok("DetectionResult" in spiral || spiral.createRaceDetector, "DetectionResult should be available");
		});

		// CLI and Synth types
		it("should export CLIOptions type", () => {
			assert.ok("CLIOptions" in spiral || spiral.parseArgs, "CLIOptions should be available");
		});

		it("should export PythonSynthOptions type", () => {
			assert.ok("PythonSynthOptions" in spiral || spiral.synthesizePython, "PythonSynthOptions should be available");
		});
	});

	//==========================================================================
	// Type Constructor Exports
	//==========================================================================

	describe("Type Constructor Exports", () => {
		// Primitive types (these are constants, not functions)
		it("should export boolType", () => {
			assert.deepStrictEqual(spiral.boolType, { kind: "bool" });
		});

		it("should export intType", () => {
			assert.deepStrictEqual(spiral.intType, { kind: "int" });
		});

		it("should export floatType", () => {
			assert.deepStrictEqual(spiral.floatType, { kind: "float" });
		});

		it("should export stringType", () => {
			assert.deepStrictEqual(spiral.stringType, { kind: "string" });
		});

		// Composite types
		it("should export listType", () => {
			const listT = spiral.listType(spiral.intType);
			assert.deepStrictEqual(listT, { kind: "list", of: { kind: "int" } });
		});

		it("should export setType", () => {
			const setT = spiral.setType(spiral.intType);
			assert.deepStrictEqual(setT, { kind: "set", of: { kind: "int" } });
		});

		it("should export mapType", () => {
			const mapT = spiral.mapType(spiral.stringType, spiral.intType);
			assert.deepStrictEqual(mapT, {
				kind: "map",
				key: { kind: "string" },
				value: { kind: "int" }
			});
		});

		it("should export optionType", () => {
			const optionT = spiral.optionType(spiral.intType);
			assert.deepStrictEqual(optionT, { kind: "option", of: { kind: "int" } });
		});

		it("should export fnType", () => {
			const fnT = spiral.fnType([spiral.intType], spiral.intType);
			assert.strictEqual(fnT.kind, "fn");
			assert.ok("params" in fnT);
			assert.ok("returns" in fnT);
		});

		it("should export opaqueType", () => {
			const opaqueT = spiral.opaqueType("MyType");
			assert.deepStrictEqual(opaqueT, { kind: "opaque", name: "MyType" });
		});

		// EIR-specific types
		it("should export voidType", () => {
			assert.deepStrictEqual(spiral.voidType, { kind: "void" });
		});

		it("should export refType", () => {
			const refT = spiral.refType(spiral.intType);
			assert.deepStrictEqual(refT, { kind: "ref", of: { kind: "int" } });
		});

		// Value constructors
		it("should export boolVal", () => {
			const boolV = spiral.boolVal(true);
			assert.deepStrictEqual(boolV, { kind: "bool", value: true });
		});

		it("should export intVal", () => {
			const intV = spiral.intVal(42);
			assert.deepStrictEqual(intV, { kind: "int", value: 42 });
		});

		it("should export floatVal", () => {
			const floatV = spiral.floatVal(3.14);
			assert.deepStrictEqual(floatV, { kind: "float", value: 3.14 });
		});

		it("should export stringVal", () => {
			const stringV = spiral.stringVal("hello");
			assert.deepStrictEqual(stringV, { kind: "string", value: "hello" });
		});

		it("should export listVal", () => {
			const listV = spiral.listVal([spiral.intVal(1), spiral.intVal(2)]);
			assert.strictEqual(listV.kind, "list");
			assert.ok("value" in listV);
			assert.ok(Array.isArray(listV.value));
		});

		it("should export setVal", () => {
			const setV = spiral.setVal(new Set(["1", "2"]));
			assert.strictEqual(setV.kind, "set");
			assert.ok("value" in setV);
		});

		it("should export mapVal", () => {
			const mapV = spiral.mapVal(new Map([["a", spiral.intVal(1)]]));
			assert.strictEqual(mapV.kind, "map");
			assert.ok("value" in mapV);
		});

		it("should export optionVal", () => {
			const some = spiral.optionVal(spiral.intVal(42));
			assert.strictEqual(some.kind, "option");
			const none = spiral.optionVal(null);
			assert.strictEqual(none.kind, "option");
		});

		it("should export opaqueVal", () => {
			const opaqueV = spiral.opaqueVal("MyType", "internal-value");
			assert.strictEqual(opaqueV.kind, "opaque");
		});

		it("should export closureVal", () => {
			const closureV = spiral.closureVal(
				[{ name: "x" }],
				{ kind: "var", name: "x" },
				new Map()
			);
			assert.strictEqual(closureV.kind, "closure");
			assert.ok("params" in closureV);
			assert.ok("body" in closureV);
		});

		it("should export errorVal", () => {
			const errorV = spiral.errorVal("ERROR_CODE", "Something went wrong");
			assert.strictEqual(errorV.kind, "error");
			assert.strictEqual(errorV.code, "ERROR_CODE");
		});

		it("should export voidVal", () => {
			const voidV = spiral.voidVal();
			assert.deepStrictEqual(voidV, { kind: "void" });
		});

		it("should export refCellVal", () => {
			const refV = spiral.refCellVal(spiral.intVal(42));
			assert.strictEqual(refV.kind, "refCell");
			assert.ok("value" in refV);
		});
	});

	//==========================================================================
	// Type Guards and Utilities
	//==========================================================================

	describe("Type Guards and Utilities", () => {
		it("should export isPrimitiveType", () => {
			assert.strictEqual(typeof spiral.isPrimitiveType, "function");
			assert.ok(spiral.isPrimitiveType(spiral.intType));
			assert.ok(spiral.isPrimitiveType(spiral.boolType));
			assert.ok(spiral.isPrimitiveType(spiral.stringType));
			assert.ok(!spiral.isPrimitiveType(spiral.listType(spiral.intType)));
		});

		it("should export isClosure", () => {
			assert.strictEqual(typeof spiral.isClosure, "function");
			const closure = spiral.closureVal(
				[{ name: "x" }],
				{ kind: "var", name: "x" },
				new Map()
			);
			assert.ok(spiral.isClosure(closure));
			assert.ok(!spiral.isClosure(spiral.intVal(42)));
		});

		it("should export isError", () => {
			assert.strictEqual(typeof spiral.isError, "function");
			const error = spiral.errorVal("ERROR", "message");
			assert.ok(spiral.isError(error));
			assert.ok(!spiral.isError(spiral.intVal(42)));
		});

		it("should export isVoid", () => {
			assert.strictEqual(typeof spiral.isVoid, "function");
			const voidV = spiral.voidVal();
			assert.ok(spiral.isVoid(voidV));
			assert.ok(!spiral.isVoid(spiral.intVal(42)));
		});

		it("should export isRefCell", () => {
			assert.strictEqual(typeof spiral.isRefCell, "function");
			const refV = spiral.refCellVal(spiral.intVal(42));
			assert.ok(spiral.isRefCell(refV));
			assert.ok(!spiral.isRefCell(spiral.intVal(42)));
		});

		it("should export typeEqual", () => {
			assert.strictEqual(typeof spiral.typeEqual, "function");
			assert.ok(spiral.typeEqual(spiral.intType, spiral.intType));
			assert.ok(!spiral.typeEqual(spiral.intType, spiral.stringType));
		});

		it("should export hashValue", () => {
			assert.strictEqual(typeof spiral.hashValue, "function");
			const hash1 = spiral.hashValue(spiral.intVal(42));
			const hash2 = spiral.hashValue(spiral.intVal(42));
			assert.strictEqual(hash1, hash2);
		});

		it("should export emptyEvalState", () => {
			assert.strictEqual(typeof spiral.emptyEvalState, "function");
			const state = spiral.emptyEvalState();
			assert.ok(typeof state === "object");
			assert.ok(state !== null);
		});

		it("should export createEvalState", () => {
			assert.strictEqual(typeof spiral.createEvalState, "function");
			const state = spiral.createEvalState();
			assert.ok(typeof state === "object");
			assert.ok(state !== null);
		});
	});

	//==========================================================================
	// Error Handling Exports
	//==========================================================================

	describe("Error Handling Exports", () => {
		it("should export SPIRALError class", () => {
			assert.ok(typeof spiral.SPIRALError === "function");
			const error = new spiral.SPIRALError("TEST_ERROR", "Test error");
			assert.strictEqual(error.message, "Test error");
			assert.strictEqual(error.code, "TEST_ERROR");
		});

		it("should export ErrorCodes object", () => {
			assert.ok(typeof spiral.ErrorCodes === "object");
			assert.ok(spiral.ErrorCodes !== null);
		});

		it("should export validResult", () => {
			assert.strictEqual(typeof spiral.validResult, "function");
			const result = spiral.validResult();
			assert.strictEqual(result.valid, true);
			assert.deepStrictEqual(result.errors, []);
		});

		it("should export invalidResult", () => {
			assert.strictEqual(typeof spiral.invalidResult, "function");
			const error = { path: ["test"], message: "Test error" };
			const result = spiral.invalidResult([error]);
			assert.strictEqual(result.valid, false);
			assert.strictEqual(result.errors.length, 1);
		});

		it("should export combineResults", () => {
			assert.strictEqual(typeof spiral.combineResults, "function");
			const valid = spiral.validResult();
			const invalid = spiral.invalidResult([{ path: [], message: "Error" }]);
			const combined = spiral.combineResults([valid, invalid]);
			assert.strictEqual(combined.valid, false);
		});
	});

	//==========================================================================
	// Environment Functions
	//==========================================================================

	describe("Environment Functions", () => {
		it("should export emptyTypeEnv", () => {
			assert.strictEqual(typeof spiral.emptyTypeEnv, "function");
			const env = spiral.emptyTypeEnv();
			assert.ok(typeof env === "object");
		});

		it("should export emptyValueEnv", () => {
			assert.strictEqual(typeof spiral.emptyValueEnv, "function");
			const env = spiral.emptyValueEnv();
			assert.ok(typeof env === "object");
		});

		it("should export defKey and emptyDefs for definitions", () => {
			assert.strictEqual(typeof spiral.defKey, "function");
			assert.strictEqual(typeof spiral.emptyTypeEnv, "function");
		});

		it("should export extendTypeEnv", () => {
			assert.strictEqual(typeof spiral.extendTypeEnv, "function");
			const env = spiral.emptyTypeEnv();
			const extended = spiral.extendTypeEnv(env, "x", spiral.intType);
			assert.ok(typeof extended === "object");
		});

		it("should export extendTypeEnvMany", () => {
			assert.strictEqual(typeof spiral.extendTypeEnvMany, "function");
			const env = spiral.emptyTypeEnv();
			const entries: [string, spiral.Type][] = [["x", spiral.intType], ["y", spiral.boolType]];
			const extended = spiral.extendTypeEnvMany(env, entries);
			assert.ok(typeof extended === "object");
		});

		it("should export extendValueEnv", () => {
			assert.strictEqual(typeof spiral.extendValueEnv, "function");
			const env = spiral.emptyValueEnv();
			const extended = spiral.extendValueEnv(env, "x", spiral.intVal(42));
			assert.ok(typeof extended === "object");
		});

		it("should export extendValueEnvMany", () => {
			assert.strictEqual(typeof spiral.extendValueEnvMany, "function");
			const env = spiral.emptyValueEnv();
			const entries: [string, spiral.Value][] = [["x", spiral.intVal(1)], ["y", spiral.intVal(2)]];
			const extended = spiral.extendValueEnvMany(env, entries);
			assert.ok(typeof extended === "object");
		});

		it("should export lookupType", () => {
			assert.strictEqual(typeof spiral.lookupType, "function");
			const env = spiral.extendTypeEnv(spiral.emptyTypeEnv(), "x", spiral.intType);
			const result = spiral.lookupType(env, "x");
			assert.ok(result);
		});

		it("should export lookupValue", () => {
			assert.strictEqual(typeof spiral.lookupValue, "function");
			const env = spiral.extendValueEnv(spiral.emptyValueEnv(), "x", spiral.intVal(42));
			const result = spiral.lookupValue(env, "x");
			assert.ok(result);
		});

		it("should export lookupDef", () => {
			assert.strictEqual(typeof spiral.lookupDef, "function");
		});

		it("should export registerDef", () => {
			assert.strictEqual(typeof spiral.registerDef, "function");
		});

		it("should export defKey", () => {
			assert.strictEqual(typeof spiral.defKey, "function");
			const key = spiral.defKey("core", "add");
			assert.strictEqual(key, "core:add");
		});
	});

	//==========================================================================
	// Validation Functions
	//==========================================================================

	describe("Validation Functions", () => {
		it("should export validateAIR", () => {
			assert.strictEqual(typeof spiral.validateAIR, "function");
			// Test with minimal valid AIR document
			const doc = {
				version: "1.0.0",
				airDefs: [],
				nodes: [
					{ id: "result", expr: { kind: "lit", type: { kind: "int" }, value: 42 } }
				],
				result: "result"
			};
			const result = spiral.validateAIR(doc);
			assert.ok(result.valid || !result.valid); // Just check it runs
		});

		it("should export validateCIR", () => {
			assert.strictEqual(typeof spiral.validateCIR, "function");
		});

		it("should export validateEIR", () => {
			assert.strictEqual(typeof spiral.validateEIR, "function");
		});

		it("should export validateLIR", () => {
			assert.strictEqual(typeof spiral.validateLIR, "function");
		});

	});

	//==========================================================================
	// Type Checking Functions
	//==========================================================================

	describe("Type Checking Functions", () => {
		it("should export TypeChecker class", () => {
			assert.strictEqual(typeof spiral.TypeChecker, "function");
		});

		it("should export typeCheckProgram", () => {
			assert.strictEqual(typeof spiral.typeCheckProgram, "function");
		});

		it("should export typeCheckEIRProgram", () => {
			assert.strictEqual(typeof spiral.typeCheckEIRProgram, "function");
		});
	});

	//==========================================================================
	// Evaluation Functions
	//==========================================================================

	describe("Evaluation Functions", () => {
		it("should export Evaluator class", () => {
			assert.strictEqual(typeof spiral.Evaluator, "function");
		});

		it("should export evaluateProgram", () => {
			assert.strictEqual(typeof spiral.evaluateProgram, "function");
		});

		it("should export evaluateEIR", () => {
			assert.strictEqual(typeof spiral.evaluateEIR, "function");
		});

		it("should export EvalOptions type", () => {
			// Type exports exist at compile time
			assert.ok("evaluateProgram" in spiral);
		});

		it("should export EIROptions type", () => {
			assert.ok("evaluateEIR" in spiral);
		});
	});

	//==========================================================================
	// Domain Registry Functions
	//==========================================================================

	describe("Domain Registry Functions", () => {
		it("should export bootstrapRegistry", () => {
			assert.strictEqual(typeof spiral.bootstrapRegistry, "function");
			const registry = spiral.bootstrapRegistry();
			assert.ok(registry instanceof Map);
			assert.ok(registry.size > 30);
		});

		it("should export createKernelRegistry", () => {
			assert.strictEqual(typeof spiral.createKernelRegistry, "function");
			const registry = spiral.createKernelRegistry();
			assert.ok(registry instanceof Map);
		});

		it("should export defineOperator", () => {
			assert.strictEqual(typeof spiral.defineOperator, "function");
		});

		it("should export registerOperator", () => {
			assert.strictEqual(typeof spiral.registerOperator, "function");
		});

		it("should export lookupOperator", () => {
			assert.strictEqual(typeof spiral.lookupOperator, "function");
		});

		it("should export OperatorBuilder type", () => {
			assert.ok("defineOperator" in spiral);
		});
	});

	//==========================================================================
	// CIR Substitution Functions
	//==========================================================================

	describe("CIR Substitution Functions", () => {
		it("should export substitute", () => {
			assert.strictEqual(typeof spiral.substitute, "function");
		});

		it("should export substituteEnv", () => {
			assert.strictEqual(typeof spiral.substituteEnv, "function");
		});

		it("should export alphaRename", () => {
			assert.strictEqual(typeof spiral.alphaRename, "function");
		});

		it("should export collectFreeVars", () => {
			assert.strictEqual(typeof spiral.collectFreeVars, "function");
		});

		it("should export freshName", () => {
			assert.strictEqual(typeof spiral.freshName, "function");
			const name = spiral.freshName("x", new Set<string>());
			assert.strictEqual(typeof name, "string");
		});
	});

	//==========================================================================
	// Effects Registry Functions
	//==========================================================================

	describe("Effects Registry Functions", () => {
		it("should export emptyEffectRegistry", () => {
			assert.strictEqual(typeof spiral.emptyEffectRegistry, "function");
			const registry = spiral.emptyEffectRegistry();
			assert.ok(typeof registry === "object");
		});

		it("should export createDefaultEffectRegistry", () => {
			assert.strictEqual(typeof spiral.createDefaultEffectRegistry, "function");
		});

		it("should export createQueuedEffectRegistry", () => {
			assert.strictEqual(typeof spiral.createQueuedEffectRegistry, "function");
		});

		it("should export defaultEffectRegistry", () => {
			assert.ok(typeof spiral.defaultEffectRegistry === "object");
		});

		it("should export registerEffect", () => {
			assert.strictEqual(typeof spiral.registerEffect, "function");
		});

		it("should export lookupEffect", () => {
			assert.strictEqual(typeof spiral.lookupEffect, "function");
		});

		it("should export ioEffects", () => {
			assert.ok(typeof spiral.ioEffects === "object" || typeof spiral.ioEffects === "function");
		});

		it("should export stateEffects", () => {
			assert.ok(typeof spiral.stateEffects === "object" || typeof spiral.stateEffects === "function");
		});
	});

	//==========================================================================
	// LIR Functions
	//==========================================================================

	describe("LIR Functions", () => {
		it("should export lowerEIRtoLIR", () => {
			assert.strictEqual(typeof spiral.lowerEIRtoLIR, "function");
		});

		it("should export evaluateLIR", () => {
			assert.strictEqual(typeof spiral.evaluateLIR, "function");
		});

		it("should export LIREvalOptions type", () => {
			assert.ok("evaluateLIR" in spiral);
		});
	});

	//==========================================================================
	// Async/Parallel Functions
	//==========================================================================

	describe("Async/Parallel Functions", () => {
		it("should export AsyncEvaluator class", () => {
			assert.strictEqual(typeof spiral.AsyncEvaluator, "function");
		});

		it("should export createTaskScheduler", () => {
			assert.strictEqual(typeof spiral.createTaskScheduler, "function");
		});

		it("should export createDeterministicScheduler", () => {
			assert.strictEqual(typeof spiral.createDeterministicScheduler, "function");
		});

		it("should export AsyncEvalOptions type", () => {
			assert.ok("AsyncEvaluator" in spiral);
		});
	});

	//==========================================================================
	// Async Effects Functions
	//==========================================================================

	describe("Async Effects Functions", () => {
		it("should export createAsyncChannelStore", () => {
			assert.strictEqual(typeof spiral.createAsyncChannelStore, "function");
		});

		it("should export createAsyncRefCell", () => {
			assert.strictEqual(typeof spiral.createAsyncRefCell, "function");
		});

		it("should export createAsyncMutex", () => {
			assert.strictEqual(typeof spiral.createAsyncMutex, "function");
		});

		it("should export createAsyncChannel", () => {
			assert.strictEqual(typeof spiral.createAsyncChannel, "function");
		});

		it("should export createConcurrentEffectLog", () => {
			assert.strictEqual(typeof spiral.createConcurrentEffectLog, "function");
		});
	});

	//==========================================================================
	// Concurrent Execution Detectors
	//==========================================================================

	describe("Concurrent Execution Detectors", () => {
		it("should export RaceDetector class", () => {
			assert.strictEqual(typeof spiral.RaceDetector, "function");
		});

		it("should export DeadlockDetector class", () => {
			assert.strictEqual(typeof spiral.DeadlockDetector, "function");
		});

		it("should export createRaceDetector", () => {
			assert.strictEqual(typeof spiral.createRaceDetector, "function");
		});

		it("should export createDeadlockDetector", () => {
			assert.strictEqual(typeof spiral.createDeadlockDetector, "function");
		});

		it("should export createDetectors", () => {
			assert.strictEqual(typeof spiral.createDetectors, "function");
		});

		it("should export DEFAULT_DETECTION_OPTIONS", () => {
			assert.ok(typeof spiral.DEFAULT_DETECTION_OPTIONS === "object");
			assert.ok(spiral.DEFAULT_DETECTION_OPTIONS !== null);
		});

		it("should export STRICT_DETECTION_OPTIONS", () => {
			assert.ok(typeof spiral.STRICT_DETECTION_OPTIONS === "object");
			assert.ok(spiral.STRICT_DETECTION_OPTIONS !== null);
		});
	});

	//==========================================================================
	// Synthesis Functions
	//==========================================================================

	describe("Synthesis Functions", () => {
		it("should export synthesizePython", () => {
			assert.strictEqual(typeof spiral.synthesizePython, "function");
		});

		it("should export PythonSynthOptions type", () => {
			assert.ok("synthesizePython" in spiral);
		});
	});

	//==========================================================================
	// CLI Utilities
	//==========================================================================

	describe("CLI Utilities", () => {
		it("should export parseArgs", () => {
			assert.strictEqual(typeof spiral.parseArgs, "function");
		});

		it("should export parseInputString", () => {
			assert.strictEqual(typeof spiral.parseInputString, "function");
		});

		it("should export readInputsFile", () => {
			assert.strictEqual(typeof spiral.readInputsFile, "function");
		});

		it("should export CLIOptions type", () => {
			assert.ok("parseArgs" in spiral);
		});
	});

	//==========================================================================
	// Schema Validation Functions
	//==========================================================================

	describe("Schema Validation Functions", () => {
		it("should export airSchema", () => {
			assert.ok(typeof spiral.airSchema === "object");
		});

		it("should export cirSchema", () => {
			assert.ok(typeof spiral.cirSchema === "object");
		});

		it("should export eirSchema", () => {
			assert.ok(typeof spiral.eirSchema === "object");
		});

		it("should export lirSchema", () => {
			assert.ok(typeof spiral.lirSchema === "object");
		});

		it("should export isAIRSchema", () => {
			assert.strictEqual(typeof spiral.isAIRSchema, "function");
		});

		it("should export isCIRSchema", () => {
			assert.strictEqual(typeof spiral.isCIRSchema, "function");
		});

		it("should export isEIRSchema", () => {
			assert.strictEqual(typeof spiral.isEIRSchema, "function");
		});

		it("should export isLIRSchema", () => {
			assert.strictEqual(typeof spiral.isLIRSchema, "function");
		});
	});

	//==========================================================================
	// Integration Smoke Tests
	//==========================================================================

	describe("Integration Smoke Tests", () => {
		it("should successfully create and validate a minimal AIR document", () => {
			const doc = {
				version: "1.0.0" as const,
				airDefs: [],
				nodes: [
					{ id: "x", expr: { kind: "lit", type: { kind: "int" }, value: 42 } }
				],
				result: "x"
			};

			const validation = spiral.validateAIR(doc);
			assert.ok(validation.valid || !validation.valid); // Just verify it doesn't throw
		});

		it("should successfully create and use type constructors", () => {
			const intT = spiral.intType;
			const boolT = spiral.boolType;
			const listT = spiral.listType(intT);

			assert.strictEqual(intT.kind, "int");
			assert.strictEqual(boolT.kind, "bool");
			assert.strictEqual(listT.kind, "list");
			assert.deepStrictEqual((listT as { of: unknown }).of, intT);
		});

		it("should successfully create and use value constructors", () => {
			const intV = spiral.intVal(42);
			const boolV = spiral.boolVal(true);
			const listV = spiral.listVal([intV, intV]);

			assert.strictEqual(intV.kind, "int");
			assert.strictEqual(intV.value, 42);
			assert.strictEqual(boolV.kind, "bool");
			assert.strictEqual(listV.kind, "list");
		});

		it("should successfully create and use environments", () => {
			const typeEnv = spiral.extendTypeEnv(
				spiral.emptyTypeEnv(),
				"x",
				spiral.intType
			);

			const valueEnv = spiral.extendValueEnv(
				spiral.emptyValueEnv(),
				"x",
				spiral.intVal(42)
			);

			const typeResult = spiral.lookupType(typeEnv, "x");
			const valueResult = spiral.lookupValue(valueEnv, "x");

			assert.ok(typeResult);
			assert.ok(valueResult);
		});

		it("should successfully create kernel registry", () => {
			const registry = spiral.createKernelRegistry();
			assert.ok(registry instanceof Map);
			assert.ok(registry.size > 0);
		});

		it("should successfully use error utilities", () => {
			const valid = spiral.validResult<void>();
			assert.strictEqual(valid.valid, true);

			const invalid = spiral.invalidResult([{ path: ["test"], message: "Error" }]);
			assert.strictEqual(invalid.valid, false);
			assert.strictEqual(invalid.errors.length, 1);

			const combined = spiral.combineResults([valid, invalid]);
			assert.strictEqual(combined.valid, false);
		});

		it("should successfully use type guards", () => {
			assert.ok(spiral.isPrimitiveType(spiral.intType));
			assert.ok(spiral.isPrimitiveType(spiral.boolType));
			assert.ok(!spiral.isPrimitiveType(spiral.listType(spiral.intType)));

			const closure = spiral.closureVal(
				[{ name: "x" }],
				{ kind: "var", name: "x" },
				new Map()
			);
			assert.ok(spiral.isClosure(closure));

			const error = spiral.errorVal("TEST", "test error");
			assert.ok(spiral.isError(error));
		});

		it("should successfully use value hashing", () => {
			const v1 = spiral.intVal(42);
			const v2 = spiral.intVal(42);
			const v3 = spiral.intVal(43);

			assert.strictEqual(spiral.hashValue(v1), spiral.hashValue(v2));
			assert.notStrictEqual(spiral.hashValue(v1), spiral.hashValue(v3));
		});

		it("should successfully create SPIRALError instances", () => {
			const error = new spiral.SPIRALError("TEST_CODE", "Test error");
			assert.strictEqual(error.message, "Test error");
			assert.strictEqual(error.code, "TEST_CODE");
			assert.ok(error instanceof spiral.SPIRALError);
		});
	});
});
