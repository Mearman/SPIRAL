# personalized-greeter

**Interactive Example**: Demonstrates the mixed-cadence I/O pattern with strategic user input reads interspersed with multiple outputs and value reuse across different program phases.

## What This Demonstrates

- **Mixed-cadence I/O pattern**: Outputs are not purely alternating with inputs (like add-two-ints), but follow a natural conversational flow
- `readLine` effect: reads a string (user's name)
- `readInt` effect: reads an integer (user's age)
- `print` effect: displays static messages
- `printInt` effect: displays integer values
- **Value capture and reuse**: The name read from input is referenced in two separate output messages (greeting and farewell)
- Sequential effect orchestration via nested `seq` expressions
- Multiple program phases with distinct I/O patterns

## Running Interactively

```bash
pnpm run-example eir/interactive/personalized-greeter
# Output: Welcome!
# Output: What is your name?
# Input: Alice
# Output: Hello,
# Output: Alice
# Output: What is your age?
# Input: 25
# Output: You are
# Output: 25
# Output: years old.
# Output: Goodbye,
# Output: Alice
```

## Running with Predefined Input

```bash
pnpm run-example eir/interactive/personalized-greeter --inputs "Alice,25"
```

Or with JSON format:

```bash
pnpm run-example eir/interactive/personalized-greeter --inputs '["Alice", 25]'
```

## Using a Custom Input File

```bash
pnpm run-example eir/interactive/personalized-greeter --inputs-file my-inputs.json
```

Where `my-inputs.json` contains:
```json
["Alice", 25]
```

## Testing

Tests automatically use the `personalized-greeter.inputs.json` fixture:

```bash
pnpm test:examples
```

## Flow Analysis

The program executes in this order:

1. **Welcome phase**: Print "Welcome!" → Print "What is your name?" → Read name (stored in `readName` node)
2. **Greeting phase**: Print "Hello, " → Print name (by referencing `readName`)
3. **Age phase**: Print "What is your age?" → Read age (stored in `readAge` node)
4. **Summary phase**: Print "You are " → Print age (printInt) → Print "years old."
5. **Farewell phase**: Print "Goodbye, " → Print name again (by referencing `readName`)

## Key Pattern: Value Reuse Across Program Phases

The node `readName` is referenced in two different effects:
- `printName` (after greeting prefix, during greeting phase)
- `printGoodbyeName` (after goodbye prefix, during farewell phase)

This demonstrates how input values persist through multiple subsequent operations and can influence multiple parts of the output. This is a common pattern in real interactive applications where a single user input affects program behavior across different execution phases.

## Comparison: Mixed vs Alternating Cadence

| Pattern | Example | I/O Sequence |
|---------|---------|----------|
| **Alternating** | add-two-ints | Input → Input → Output |
| **Mixed (this example)** | personalized-greeter | Output → Output → Input → Output → Output → Input → Output → Output → Output → Output |

The mixed cadence reflects natural dialogue flows where the program initiates conversation with questions and contextual prompts before collecting each response, then uses the collected values in subsequent interactions.
