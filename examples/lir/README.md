# LIR Examples

LIR (Low-level IR) is a CFG-based (Control Flow Graph) intermediate representation used for optimization and code generation.

## Overview

LIR represents programs as:

- **Basic blocks**: Sequences of instructions with single entry/exit
- **Terminators**: Jump, branch, return, or exit at end of each block
- **Phi nodes**: SSA (Static Single Assignment) merging at control flow joins
- **Instructions**: Assign, call, op, phi, effect, assignRef

## Document Format

```json
{
  "version": "1.0.0",
  "description": "Example description",
  "blocks": [
    {
      "id": "blockId",
      "instructions": [...],
      "terminator": { ... }
    }
  ],
  "entry": "entryBlockId",
  "expected_result": ...,
  "note": "Additional explanation"
}
```

## Examples by Category

### Basics

| File | Description |
|------|-------------|
| `basics/straight-line.lir.json` | Sequential instructions |
| `basics/conditional.lir.json` | Branch with boolean condition |
| `basics/loop.lir.json` | Back-edge for iteration |

### Control Flow

| File | Description |
|------|-------------|
| `control-flow/if-else.lir.json` | If-then-else as CFG |
| `control-flow/while-cfg.lir.json` | While loop as CFG |
| `control-flow/nested-branch.lir.json` | Nested branching |

### Phi Nodes

| File | Description |
|------|-------------|
| `phi/merge-phi.lir.json` | SSA merging with phi |
| `phi/loop-phi.lir.json` | Loop-carried variables |

### Algorithms

| File | Description |
|------|-------------|
| `algorithms/factorial.lir.json` | Factorial as CFG |
| `algorithms/gcd.lir.json` | GCD as CFG |
| `algorithms/fizzbuzz.lir.json` | FizzBuzz with branches |
| `algorithms/min-max.lir.json` | Find min/max with phi |

## Instruction Types

### Assign

```json
{
  "kind": "assign",
  "target": "varName",
  "value": { "kind": "lit", "type": {...}, "value": ... }
}
```

Assigns a literal or variable value to a target.

### Operator Call

```json
{
  "kind": "op",
  "target": "resultVar",
  "ns": "core",
  "name": "add",
  "args": ["var1", "var2"]
}
```

Calls an operator with arguments and stores result.

### Phi Node

```json
{
  "kind": "phi",
  "target": "mergedVar",
  "sources": [
    { "block": "predBlock1", "id": "var1" },
    { "block": "predBlock2", "id": "var2" }
  ]
}
```

Merges values from multiple control flow predecessors (SSA form).

### Effect

```json
{
  "kind": "effect",
  "op": "print",
  "args": ["var1"]
}
```

Executes a side-effecting operation.

### Assign Reference

```json
{
  "kind": "assignRef",
  "target": "refCellName",
  "value": "sourceVar"
}
```

Assigns to a mutable reference cell.

## Terminator Types

### Jump

```json
{
  "kind": "jump",
  "to": "targetBlockId"
}
```

Unconditional jump to another block.

### Branch

```json
{
  "kind": "branch",
  "cond": "conditionVar",
  "then": "thenBlockId",
  "else": "elseBlockId"
}
```

Conditional branch based on boolean variable.

### Return

```json
{
  "kind": "return",
  "value": "returnVar"
}
```

Returns from the program with optional value.

### Exit

```json
{
  "kind": "exit",
  "code": "exitCodeVar"
}
```

Exits with optional exit code.

## Running Examples

```bash
# Run a LIR example
pnpm run-example lir/basics/straight-line

# Validate LIR document
pnpm validate lir/basics/straight-line.lir.json

# Evaluate LIR document
pnpm evaluate lir/basics/straight-line.lir.json
```

## CFG Structure

LIR programs are control flow graphs:

```
entry -> [condition] -> thenBranch --------> merge
               |                              ^
               v                              |
           elseBranch ------------------------
```

Key properties:

- Each block has a unique id
- Each block ends with exactly one terminator
- Execution starts at the entry block
- Phi nodes implement SSA merging
- Loops are created by back-edges (jumps to earlier blocks)

## SSA Form

LIR uses Static Single Assignment form:

- Each variable is assigned exactly once
- Phi nodes merge values at control flow joins
- Enables data flow analysis and optimizations

Example loop-carried variable:

```
loopHeader:
  i = phi(entry.initialI, loopBody.nextI)
  ...
```

The `i` variable gets its value from either:
1. `initialI` on first iteration (from entry block)
2. `nextI` on subsequent iterations (from loopBody block)

## Evaluation

LIR execution follows the CFG:

1. Start at entry block
2. Execute instructions sequentially
3. Execute terminator to determine next block
4. Repeat until return/exit terminator

The evaluator tracks:

```typescript
interface LIRRuntimeState {
  vars: ValueEnv;      // Variable bindings (SSA form)
  returnValue?: Value;
  effects: Effect[];
  steps: number;
  maxSteps: number;
}
```
