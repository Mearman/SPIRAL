# increment (CFG-only)

AIR example using only block nodes (no expression nodes).

## Structure

```
nodes:
  - result (blocks): CFG that assigns literals and computes increment
```

## Control Flow

```
entry:
  assign x = 5
  assign one = 1
  compute incremented = x + one
  return incremented
```

## Result

5 + 1 = 6
