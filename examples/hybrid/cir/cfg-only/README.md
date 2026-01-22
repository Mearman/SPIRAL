# decrement (CFG-only)

CIR example using only block nodes (no expression nodes).

## Structure

```
nodes:
  - result (blocks): CFG that assigns literals and computes decrement
```

## Control Flow

```
entry:
  assign x = 10
  assign one = 1
  compute decremented = x - one
  return decremented
```

## Result

10 - 1 = 9
