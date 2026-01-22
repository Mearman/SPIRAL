# survey-collector

**Interactive Example**: Collects survey responses in a for loop. Prompts for 3 respondent names, reads input, and confirms each response.

## What This Demonstrates

- **For loop pattern**: C-style for loop with counter initialization, condition check, and update
- **Sequential I/O effects**: Multiple effects chained with `seq` nodes
- **Nested effects in loop body**: Print prompt → read input → print confirmation in each iteration
- **String and integer output**: Using `printStr` for labels/messages and `printInt` for loop counter
- **Interactive input**: Using `readLine` effect to capture user responses

## I/O Flow

```
Iteration 0:
  Print "Respondent "
  Print 0
  Print ": "
  Read input (expects: "Alice")
  Print "Response recorded."

Iteration 1:
  Print "Respondent "
  Print 1
  Print ": "
  Read input (expects: "Bob")
  Print "Response recorded."

Iteration 2:
  Print "Respondent "
  Print 2
  Print ": "
  Read input (expects: "Charlie")
  Print "Response recorded."

After loop:
  Print "Survey complete!"
```

## Running Interactively

```bash
pnpm run-example eir/interactive/survey-collector
# Prompts for 3 respondent names
```

## Running with Predefined Input

```bash
pnpm run-example eir/interactive/survey-collector --inputs "Alice,Bob,Charlie"
```

Or with JSON array format:

```bash
pnpm run-example eir/interactive/survey-collector --inputs '["Alice", "Bob", "Charlie"]'
```

## Using the Fixture File

```bash
pnpm run-example eir/interactive/survey-collector --inputs-file ./examples/eir/interactive/survey-collector/survey-collector.inputs.json
```

## Testing

Tests automatically use the `survey-collector.inputs.json` fixture:

```bash
pnpm test:examples
```

## EIR Pattern Breakdown

### For Loop Structure

The example uses EIR's `for` construct with:

- **init**: References `zero` node (0)
- **cond**: Calls `core.lt` to check if loop counter < 3
- **update**: Calls `core.add` to increment counter
- **body**: Contains all the I/O effect nodes

### Sequential Effects

Effects are chained using `seq` nodes:

```json
{
  "kind": "seq",
  "first": "printQuestion",
  "then": { "kind": "effect", "op": "printInt", "args": ["questionNum"] }
}
```

This ensures left-to-right evaluation: print first, then print counter.

### Loop Variable Access

Inside the loop body, the loop variable `i` is accessed via:

```json
{
  "kind": "var",
  "name": "i"
}
```

The variable `i` is bound by the `for` construct and is available throughout the loop body.

## LIR Equivalent

See `lir/interactive/survey-collector/` for the CFG-based lowering of this pattern.
