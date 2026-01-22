# prompt-echo

**Interactive Example**: Reads a line of text from input and echoes it back to output.

## What This Demonstrates

- `readLine` effect: reads a string from user input
- `print` effect: outputs a string value
- Basic EIR sequencing with effects

## Running Interactively

```bash
pnpm run-example eir/interactive/prompt-echo
# Input: hello world
# Output: hello world
```

## Running with Predefined Input

```bash
pnpm run-example eir/interactive/prompt-echo --inputs "hello world"
```

## Using a Custom Input File

```bash
pnpm run-example eir/interactive/prompt-echo --inputs-file my-inputs.json
```

Where `my-inputs.json` contains:
```json
["hello world"]
```

## Testing

Tests automatically use the `prompt-echo.inputs.json` fixture:

```bash
pnpm test:examples
```
