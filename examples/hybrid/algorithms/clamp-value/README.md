# clamp-value

Clamps a value between minimum and maximum bounds using a hybrid document.

## Structure

```
nodes:
  - value (expr): literal 150
  - minBound (expr): literal 0
  - maxBound (expr): literal 100
  - clampedValue (blocks): CFG that clamps value between bounds
```

## Control Flow

```
checkMin: is value < minBound?
  ├── true  → returnMin (return minBound)
  └── false → checkMax: is value > maxBound?
                ├── true  → returnMax (return maxBound)
                └── false → returnValue (return value)
```

## Result

Since value=150 is above maxBound=100, the result is 100.
