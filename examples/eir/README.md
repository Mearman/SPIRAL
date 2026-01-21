# EIR Examples

EIR (Execution IR) extends CIR with imperative features: sequencing, variable mutation, loops, and side effects.

## Overview

EIR provides imperative programming constructs on top of the functional AIR/CIR foundation:

- **Sequential execution**: `seq` - Execute expressions in order
- **Variable mutation**: `assign` - Update variable bindings
- **Loops**: `while`, `for`, `iter` - Iteration constructs
- **Side effects**: `effect` - I/O and other effectful operations
- **Reference cells**: `refCell`, `deref` - Mutable memory cells

## Document Format

```json
{
  "version": "1.0.0",
  "description": "Example description",
  "airDefs": [...],
  "nodes": [
    {
      "id": "nodeId",
      "expr": { ... }
    }
  ],
  "result": "resultNodeId",
  "expected_result": ...,
  "note": "Additional explanation"
}
```

## Examples by Category

### Basics

| File | Description |
|------|-------------|
| `basics/sequencing.eir.json` | Sequential execution with `seq` |
| `basics/assignment.eir.json` | Variable mutation with `assign` |
| `basics/refcells.eir.json` | Reference cells (`refCell`, `deref`) |
| `basics/effects.eir.json` | I/O effects (`print`, `read`) |

### Loops

| File | Description |
|------|-------------|
| `loops/while-loop.eir.json` | While loop counter |
| `loops/for-loop.eir.json` | Traditional for loop |
| `loops/iter-loop.eir.json` | Iterator over list |
| `loops/nested-loops.eir.json` | Nested while loops |

### Algorithms

| File | Description |
|------|-------------|
| `algorithms/counter.eir.json` | Counter with mutation |
| `algorithms/factorial.eir.json` | Factorial with while loop |
| `algorithms/sum-list.eir.json` | Sum list elements |
| `algorithms/accumulate.eir.json` | Accumulation pattern |

### Advanced

| File | Description |
|------|-------------|
| `advanced/state-machine.eir.json` | State mutation |
| `advanced/io-loop.eir.json` | Interactive I/O loop |
| `advanced/mutable-list.eir.json` | List with mutation |
| `advanced/side-effects.eir.json` | Effect composition |

## Expression Kinds

### Sequential Execution

```json
{
  "kind": "seq",
  "first": "nodeId1",
  "then": "nodeId2"
}
```

Evaluates `nodeId1`, then `nodeId2`, returning the result of `nodeId2`.

### Variable Assignment

```json
{
  "kind": "assign",
  "target": "variableName",
  "value": "sourceNodeId"
}
```

Updates the environment with a new binding for `target`.

### While Loop

```json
{
  "kind": "while",
  "cond": "conditionNodeId",
  "body": "bodyNodeId"
}
```

Repeatedly evaluates `body` while `cond` is true.

### For Loop

```json
{
  "kind": "for",
  "var": "loopVar",
  "init": "initNodeId",
  "cond": "conditionNodeId",
  "update": "updateNodeId",
  "body": "bodyNodeId"
}
```

C-style for loop with init, condition, update, and body.

### Iterator Loop

```json
{
  "kind": "iter",
  "var": "elementVar",
  "iter": "listNodeId",
  "body": "bodyNodeId"
}
```

Iterates over elements of a list or set.

### Effect

```json
{
  "kind": "effect",
  "op": "operationName",
  "args": ["argNodeId1", ...]
}
```

Executes a side-effecting operation.

### Reference Cell

```json
{
  "kind": "refCell",
  "target": "variableName"
}
```

Creates a reference cell for an existing variable.

```json
{
  "kind": "deref",
  "target": "variableName"
}
```

Reads the value through a reference cell.

## Running Examples

```bash
# Run an EIR example
pnpm run-example eir/basics/sequencing

# Validate EIR document
pnpm validate eir/basics/sequencing.eir.json

# Evaluate EIR document
pnpm evaluate eir/basics/sequencing.eir.json
```

## Evaluation Semantics

EIR evaluation uses a mutable state structure:

```typescript
interface EvalState {
  env: ValueEnv;        // Variable bindings
  refCells: Map<string, Value>;  // Reference cells
  effects: Effect[];    // Executed effects
  steps: number;        // Execution steps
  maxSteps: number;     // Step limit
}
```

The evaluator:

1. Initializes state from inputs
2. Processes nodes sequentially
3. Handles EIR expressions specially (seq, assign, loops, effects)
4. Delegates CIR expressions to the base evaluator
5. Returns result plus final state

## Lowering to LIR

EIR can be lowered to LIR (CFG-based representation) via `lowerEIRtoLIR()`:

- Sequential expressions become straight-line code
- Assignments become LIR assign instructions
- Loops become CFG blocks with back-edges
- Effects become effect instructions

This transformation enables optimizations and code generation.
