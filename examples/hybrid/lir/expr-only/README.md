# sum-literals (Expression-only)

LIR example using only expression nodes (no block nodes).

This demonstrates that LIR documents can contain pure expression nodes
without any CFG block nodes. Expression nodes in LIR are evaluated
sequentially and their values stored for later reference.

## Structure

```
nodes:
  - x (expr): literal 42
  - doubled (expr): literal 84
  - result (expr): literal 100
```

## Note

For more complex computations involving multiple expression nodes,
use the hybrid pattern where block nodes can reference expression
node values (see `hybrid/lir/basics/double-value.lir.json`).

## Result

Returns the literal value 100.
