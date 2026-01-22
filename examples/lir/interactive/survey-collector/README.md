# survey-collector (LIR)

**Low-Level IR Example**: CFG-based lowering of the survey-collector pattern. Demonstrates loop structure with control-flow blocks and sequential effects in a block body.

## What This Demonstrates

- **Loop CFG pattern**: Entry block, loop header with condition check, loop body with side effects, and exit block
- **Control-flow blocks**: Using jumps and conditional branches to implement looping
- **Sequential effects within block**: Multiple effect instructions in sequence within a basic block
- **Loop counter management**: Variable update at end of loop body and back-edge to header
- **Effect instructions**: Using `effect` kind instructions to represent I/O operations

## CFG Structure

```
┌─────────────────────┐
│      entry          │
│  i = 0              │
│  → jump loopHeader  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   loopHeader        │
│  limit = 3          │
│  shouldContinue =   │
│    i < limit        │
│  → branch on cond   │
└──────┬──────────────┘
       │
    ┌──┴──┐
    ▼     ▼
  true  false
   │      │
   ▼      ▼
┌──────────────┐  ┌──────────────┐
│  loopBody    │  │  loopExit    │
│              │  │              │
│  (print i+1) │  │ (completion  │
│  (read)      │  │  message)    │
│  (confirm)   │  │ → return     │
│  (i++)       │  │              │
│ → jump       │  └──────────────┘
│   loopHeader │
└──────────────┘
```

## Block-by-Block Breakdown

### entry Block

Initializes loop counter and jumps to loop header.

```
instructions:
  - assign i = 0
terminator: jump to loopHeader
```

### loopHeader Block

Evaluates loop condition and branches accordingly.

```
instructions:
  - assign limit = 3
  - op shouldContinue = core.lt(i, limit)
terminator: branch on shouldContinue
  then: loopBody
  else: loopExit
```

### loopBody Block

Executes the loop body: prints prompt, reads input, confirms response, increments counter.

```
instructions:
  - assign promptPrefix = "Respondent "
  - effect print1 = printStr(promptPrefix)
  - effect print2 = printInt(i)
  - assign promptSuffix = ": "
  - effect print3 = printStr(promptSuffix)
  - effect response = readLine()
  - assign recordedMsg = "Response recorded."
  - effect print4 = printStr(recordedMsg)
  - assign one = 1
  - op nextI = core.add(i, one)
  - assign i = nextI
terminator: jump to loopHeader
```

### loopExit Block

Executes after loop exits, prints completion message.

```
instructions:
  - assign completionMsg = "Survey complete!"
  - effect printFinal = printStr(completionMsg)
terminator: return
```

## Running

```bash
pnpm run-example lir/interactive/survey-collector --inputs "Alice,Bob,Charlie"
```

## LIR vs. EIR

| Aspect | EIR | LIR |
|--------|-----|-----|
| **Structure** | Expression DAG with `for` node | CFG with basic blocks |
| **Loop representation** | Single `for` node with init/cond/update/body | Multiple blocks with jumps/branches |
| **Effects** | Nested in `seq` expressions | Instructions in block body |
| **Condition evaluation** | Inside `for` node | Separate block (loopHeader) |
| **Control flow** | Implicit in expression tree | Explicit in block terminators |

## Testing

Tests use the `survey-collector.inputs.json` fixture fixture:

```bash
pnpm test:examples
```

Expected outputs:
- Prompts for 3 respondents with indices 0, 1, 2
- Reads "Alice", "Bob", "Charlie" from inputs
- Prints confirmation after each read
- Prints "Survey complete!" after loop
