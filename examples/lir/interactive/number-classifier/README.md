# number-classifier

**LIR Control-Flow Graph**: Demonstrates nested conditional branching with effects. Reads an integer, classifies it as zero, positive, or negative, and prints appropriate output.

## What This Demonstrates

- `readInt` and `print`/`printInt` effect instructions
- Nested branching with two levels of conditional decisions
- Multiple paths converging at an exit block
- Phi node merge for SSA form value selection
- Comparison operators in LIR form (`op` instruction)

## Block Structure

```
entry (read + first condition)
  ├─ zeroBlock (if zero) ──┐
  │                         │
  └─ checkPositiveBlock     │
     (if not zero)          │
     ├─ positiveBlock ──┐   │
     │                  │   │
     └─ negativeBlock ──┤   │
                        │   │
                   exitBlock (phi merge)
                        │
                      return
```

## Blocks

### entry
- Reads integer via `readInt` effect
- Computes `checkZero = number == 0`
- Branches to `zeroBlock` if true, else to `checkPositiveBlock`

### zeroBlock
- Prints "Zero"
- Jumps to `exitBlock`

### checkPositiveBlock
- Computes `checkPositive = number > 0`
- Branches to `positiveBlock` if true, else to `negativeBlock`

### positiveBlock
- Prints "Positive: " followed by the number
- Jumps to `exitBlock`

### negativeBlock
- Computes absolute value: `absValue = number * -1`
- Prints "Negative: " followed by the absolute value
- Jumps to `exitBlock`

### exitBlock
- Phi node merges the `output` values from all three paths
- Returns the final output

## Example Execution

With input `5`:
- `checkZero = (5 == 0)` → false
- `checkPositive = (5 > 0)` → true
- Executes `positiveBlock`
- Outputs: "Positive: 5"

With input `-3`:
- `checkZero = (-3 == 0)` → false
- `checkPositive = (-3 > 0)` → false
- Executes `negativeBlock`
- `absValue = -3 * -1 = 3`
- Outputs: "Negative: 3"

With input `0`:
- `checkZero = (0 == 0)` → true
- Executes `zeroBlock`
- Outputs: "Zero"

## Comparison with EIR

This LIR representation differs from the EIR version in several ways:

- **Expression vs Blocks**: EIR uses nested `if-then-else` expressions; LIR uses explicit basic blocks and branches
- **Control Flow**: EIR's decision points are expressions; LIR's branches are terminators with explicit jump targets
- **Merging**: EIR relies on expression evaluation structure; LIR uses explicit phi nodes at merge points
- **Effects in Context**: EIR effects are embedded in expressions; LIR effects are instructions within blocks
- **Code Generation**: LIR is more directly translatable to machine code or high-level language loops

## Phi Node Details

The `exitBlock` phi node:
```json
{
  "kind": "phi",
  "target": "finalOutput",
  "sources": [
    {"block": "zeroBlock", "id": "output"},
    {"block": "positiveBlock", "id": "output"},
    {"block": "negativeBlock", "id": "output"}
  ]
}
```

This selects the `output` value from whichever block was the immediate predecessor, ensuring SSA form (each variable assigned exactly once on each path).
