# max-value

Demonstrates hybrid documents that mix **expression nodes** and **CFG block nodes**.

## Structure

```
nodes:
  - x (expr): literal 42
  - y (expr): literal 73
  - maxValue (blocks): CFG that compares x > y and returns the larger
```

## Key Concepts

1. **Expression nodes** (`x`, `y`) define values declaratively using `expr`
2. **Block node** (`maxValue`) uses CFG control flow with `blocks` and `entry`
3. **Cross-referencing**: The block node's CFG references expression node values by ID

## Control Flow

```
entry: compare x > y
  ├── true  → returnX (return x)
  └── false → returnY (return y)
```

## Result

Since x=42 and y=73, the comparison x>y is false, so the block returns y=73.
