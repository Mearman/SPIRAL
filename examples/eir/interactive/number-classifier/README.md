# number-classifier

**Interactive Example**: Reads an integer and classifies it as zero, positive, or negative with appropriate output.

## What This Demonstrates

- `readInt` effect: reads an integer from user input
- `print` and `printInt` effects: output text and integer values
- Nested conditional (`if-then-else`) expressions
- Sequential composition with `seq` for multiple effects
- Comparison operators (`eq`, `gt`)
- Arithmetic operations on effect results

## Flow

1. Read an integer from input
2. Check if it equals zero → print "Zero"
3. Else: check if it's positive → print "Positive: " followed by the value
4. Else: print "Negative: " followed by the absolute value

## Running Interactively

```bash
pnpm run-example eir/interactive/number-classifier
# Input: 5
# Output: Positive: 5
```

## Running with Predefined Input

```bash
pnpm run-example eir/interactive/number-classifier --inputs "5,-3,0"
```

Each invocation uses one integer from the list.

Or with JSON array format:

```bash
pnpm run-example eir/interactive/number-classifier --inputs "[5, -3, 0]"
```

## Using a Custom Input File

```bash
pnpm run-example eir/interactive/number-classifier --inputs-file my-inputs.json
```

Where `my-inputs.json` contains:
```json
[5, -3, 0]
```

## Testing

Tests automatically use the `number-classifier.inputs.json` fixture:

```bash
pnpm test:examples
```

The fixture provides three test cases:
- `5` → outputs "Positive: 5"
- `-3` → outputs "Negative: 3"
- `0` → outputs "Zero"

## EIR vs LIR Representation

This example has both EIR and LIR implementations:

- **EIR** (`number-classifier.eir.json`): Expression-based representation with nested `if-then-else` and `seq` expressions. Decision points are expressed as conditionals that return effect expressions.

- **LIR** (`../../../lir/interactive/number-classifier/number-classifier.lir.json`): Control-flow graph with basic blocks. Each decision path (zero, positive, negative) is a separate block with its own effect instructions, merging at an exit block with phi nodes.

The EIR version emphasizes declarative structure, while the LIR version shows the control-flow structure suitable for code generation and optimization.
