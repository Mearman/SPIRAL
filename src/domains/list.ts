// CAIRS List Domain
// List operators

import { ErrorCodes } from "../errors.js";
import type { Type } from "../types.js";
import {
  errorVal,
  intType,
  intVal,
  isError,
  listType,
  listVal,
} from "../types.js";
import {
  defineOperator,
  Operator,
  OperatorRegistry,
  registerOperator,
} from "./registry.js";

//==============================================================================
// List Operators
//==============================================================================

// map(list<A>, fn) -> list<B> - Higher order, requires closure support
// For now, we'll implement map as an operator that takes a list and returns a list
// The actual mapping function will be applied in the evaluator

// length(list<A>) -> int
const length: Operator = defineOperator("list", "length")
	.setParams(listType({ kind: "int" } as Type)) // Generic placeholder
	.setReturns(intType)
	.setPure(true)
	.setImpl((a) => {
		if (isError(a)) return a;
		if (a.kind !== "list") {
			return errorVal(ErrorCodes.TypeError, "Expected list value");
		}
		return intVal(a.value.length);
	})
	.build();

// concat(list<A>, list<A>) -> list<A>
const concat: Operator = defineOperator("list", "concat")
	.setParams(
		listType({ kind: "int" } as Type),
		listType({ kind: "int" } as Type),
	)
	.setReturns(listType({ kind: "int" } as Type))
	.setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		if (a.kind !== "list" || b.kind !== "list") {
			return errorVal(ErrorCodes.TypeError, "Expected list values");
		}
		return listVal([...a.value, ...b.value]);
	})
	.build();

// nth(list<A>, int) -> A
const nth: Operator = defineOperator("list", "nth")
	.setParams(listType({ kind: "int" } as Type), intType)
	.setReturns({ kind: "int" } as Type)
	.setPure(true)
	.setImpl((a, b) => {
		if (isError(a)) return a;
		if (isError(b)) return b;
		if (a.kind !== "list") {
			return errorVal(ErrorCodes.TypeError, "Expected list value");
		}
		if (b.kind !== "int") {
			return errorVal(ErrorCodes.TypeError, "Expected int index");
		}
		const idx = b.value;
		if (idx < 0 || idx >= a.value.length) {
			return errorVal(
				ErrorCodes.DomainError,
				"Index out of bounds: " + String(idx),
			);
		}
		return a.value[idx]!;
	})
	.build();

// reverse(list<A>) -> list<A>
const reverse: Operator = defineOperator("list", "reverse")
	.setParams(listType({ kind: "int" } as Type))
	.setReturns(listType({ kind: "int" } as Type))
	.setPure(true)
	.setImpl((a) => {
		if (isError(a)) return a;
		if (a.kind !== "list") {
			return errorVal(ErrorCodes.TypeError, "Expected list value");
		}
		return listVal([...a.value].reverse());
	})
	.build();

// fold(list<A>, B, fn(A, B) -> B) -> B
// For now, implemented as a simplified version that takes (list, initial) -> initial
// The actual folding will be done in the evaluator with closure support

// reduce(list<A>, fn(A, A) -> A) -> A
// Similar to fold, requires closure support

// filter(list<A>, fn(A) -> bool) -> list<A>
// Requires closure support

//==============================================================================
// Registry Creation
//==============================================================================

/**
 * Create the list domain registry with all list operators.
 */
export function createListRegistry(): OperatorRegistry {
	let registry: OperatorRegistry = new Map();

	registry = registerOperator(registry, length);
	registry = registerOperator(registry, concat);
	registry = registerOperator(registry, nth);
	registry = registerOperator(registry, reverse);

	return registry;
}
