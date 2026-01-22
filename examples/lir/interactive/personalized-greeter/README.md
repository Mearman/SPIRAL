# personalized-greeter (LIR)

**Low-Level IR Example**: Straight-line code representation of the personalized-greeter mixed-cadence I/O pattern.

## Overview

This is a companion LIR example to the EIR personalized-greeter. It demonstrates how a mixed-cadence I/O pattern can be represented in low-level form with sequential effect instructions. Unlike the EIR version which uses actual `readLine` and `readInt` effects, this LIR version uses hardcoded values (Alice, 25) to work around current limitations in the LIR effect instruction system.

## Structure

The program is organized as a **single straight-line block** with sequential instructions:

```
entry:
  welcome_msg = "Welcome!"
  print(welcome_msg)
  name_prompt = "What is your name?"
  print(name_prompt)
  name = "Alice"                      // Hardcoded: simulates readLine()
  hello_prefix = "Hello, "
  print(hello_prefix)
  print(name)
  age_prompt = "What is your age?"
  print(age_prompt)
  age = 25                            // Hardcoded: simulates readInt()
  age_prefix = "You are "
  print(age_prefix)
  printInt(age)
  years_msg = "years old."
  print(years_msg)
  goodbye_msg = "Goodbye, "
  print(goodbye_msg)
  print(name)                         // Reuse name from earlier in block
  return
```

**Purpose**: Output a complete interactive-style conversation with prompts, simulated inputs, and personalized responses, demonstrating value capture and reuse within a single basic block.

## Key Features

### Value Capture and Reuse Within a Block

Variables `name` and `age` are assigned early in the block and reused multiple times:

- `name` is assigned from a hardcoded literal (simulating `readLine()`)
- `name` is then printed immediately in the greeting
- `name` is printed again in the farewell (demonstrating value reuse)

- `age` is assigned from a hardcoded literal (simulating `readInt()`)
- `age` is printed in the age summary (with `printInt`)

This demonstrates how, within a single block in SSA form, a value can be assigned once and then read any number of times by subsequent instructions.

### Hardcoded I/O Values

Because LIR effect instructions (like `readLine`, `readInt`) currently have limitations, this example uses hardcoded values ("Alice", 25) in assign instructions instead of actual input effects. The output sequence is identical to what it would be with real input effects.

### Effect Sequencing

All effects are explicit effect instructions:

- `readLine()` and `readInt()` have output targets
- `print()` operations are independent instructions
- No implicit sequencing through expressions; order depends on block order and instructions within blocks

### Single Block, No Phi Nodes

This example uses a single straight-line block with a simple `return` terminator. All instructions execute sequentially with no branching, so no phi nodes are required. Values persist for the duration of the block execution.

## Running

This example is typically invoked through the LIR test framework:

```bash
pnpm test:examples
```

Or directly (if a runner is available):

```bash
pnpm run-example lir/interactive/personalized-greeter
```

## Lowering from EIR

The EIR version uses nested `seq` expressions:

```
seq(print1, seq(print2, seq(read1, ...)))
```

When lowered to LIR, sequential operations become:

1. Instructions in the same block (for linear sequences without control flow)
2. Separate blocks joined by jumps (for major phase transitions)

The three-block structure reflects natural program phases:
- Phase 1: Introduction and name collection
- Phase 2: Age inquiry and summary
- Phase 3: Farewell

## Comparison: EIR vs LIR

| Aspect | EIR | LIR |
|--------|-----|-----|
| **Organization** | DAG of nodes with seq expressions | CFG with basic blocks |
| **Sequencing** | Explicit via seq() nodes | Implicit via block order and jumps |
| **Values** | Referenced by node id (reusable anywhere) | SSA variables (assigned once, block-scoped) |
| **Effects** | Part of expression tree | Instructions in blocks |
| **Value Reuse** | Name can be reused across phases (seq boundaries) | Values must be reused within their block |
| **Optimization** | Expression-level optimizations | Block-level and CFG optimizations |

### Key Difference: Value Scope (EIR vs LIR)

**EIR Version**:
- Uses `readName` and `readAge` as expression nodes that can be referenced anywhere
- Values are implicit through node references in the DAG
- Supports easy cross-phase value reuse

**LIR Version**:
- Variables are assigned in instructions and persist in SSA form within their block
- In a single-block version, all values are available to all subsequent instructions
- To reuse values across multiple blocks, phi nodes would be needed at merge points

This example demonstrates the simplest LIR pattern: straight-line code where all variables are assigned once and reused freely within the same block.

## Further Reading

- [EIR personalized-greeter](../../../eir/interactive/personalized-greeter/)
- [LIR Basics](../../../basics/) - Straight-line execution
- [LIR Control Flow](../../control-flow/) - Branching and loops
