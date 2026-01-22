# add-two-ints

**Interactive Example**: Reads two integers from input, adds them, and prints the result.

## What This Demonstrates

- `readInt` effect: reads an integer from user input
- `printInt` effect: outputs an integer value
- Basic arithmetic operation on effects results
- Node reference chain in EIR

## Running Interactively

```bash
pnpm run-example eir/interactive/add-two-ints
# Input: 3
# Input: 4
# Output: 7
```

## Running with Predefined Input

```bash
pnpm run-example eir/interactive/add-two-ints --inputs "3,4"
```

Or with JSON format:

```bash
pnpm run-example eir/interactive/add-two-ints --inputs "[3, 4]"
```

## Using a Custom Input File

```bash
pnpm run-example eir/interactive/add-two-ints --inputs-file my-inputs.json
```

Where `my-inputs.json` contains:
```json
[3, 4]
```

## Testing

Tests automatically use the `add-two-ints.inputs.json` fixture:

```bash
pnpm test:examples
```
