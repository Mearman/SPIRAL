# Hybrid Examples

These examples demonstrate **hybrid documents** that mix expression nodes and CFG block nodes within the same document.

## What is a Hybrid Document?

A hybrid document contains nodes of different types:
- **Expression nodes** use `"expr": { ... }` for declarative/algebraic computation
- **Block nodes** use `"blocks": [...], "entry": "..."` for CFG-based control flow

Block nodes can reference expression node values by ID, enabling:
- Declarative definition of constants and intermediate values
- Imperative control flow for complex decision logic
- Clean separation of "what" (expressions) and "how" (control flow)

## Examples

| Example | Description |
|---------|-------------|
| [max-value](./basics/max-value/) | Simple comparison using expression nodes for values and block node for branching |
| [clamp-value](./algorithms/clamp-value/) | Clamps a value between bounds using nested branches |

## Structure Pattern

```json
{
  "nodes": [
    { "id": "x", "expr": { "kind": "lit", "value": 42 } },
    { "id": "y", "expr": { "kind": "lit", "value": 73 } },
    { "id": "result",
      "blocks": [
        { "id": "entry", "instructions": [...], "terminator": {...} },
        ...
      ],
      "entry": "entry"
    }
  ],
  "result": "result"
}
```

## Cross-Referencing

Block node instructions and terminators can reference expression node IDs:
- In `op` instruction args: `"args": ["x", "y"]`
- In `return` terminator: `"value": "x"`
- In `branch` terminator: `"cond": "someExprNode"`
