# square (CFG-only)

EIR example using only block nodes (no expression nodes).

## Structure

```
nodes:
  - result (blocks): CFG that assigns a literal and computes its square
```

## Control Flow

```
entry:
  assign x = 7
  compute squared = x * x
  return squared
```

## Result

7 * 7 = 49
