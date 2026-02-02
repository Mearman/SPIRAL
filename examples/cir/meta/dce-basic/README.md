# Dead Code Elimination (DCE) Example

This example demonstrates the `optimize:dce` stdlib operator, which removes unreachable nodes from a CIR document.

## What It Does

Given a CIR document with 6 nodes:
- `litA` (literal 10) - **reachable**
- `litB` (literal 20) - **reachable**
- `callSum` (adds litA + litB) - **reachable** (result)
- `litC` (literal 1) - **dead** (never referenced)
- `litD` (literal 2) - **dead** (never referenced)
- `callUnused` (adds litC + litD) - **dead** (never referenced)

The DCE optimizer:
1. Starts from the result node (`callSum`)
2. Recursively follows all node references
3. Builds a set of reachable nodes
4. Filters the node list to only include reachable nodes

## Result

After optimization, the document contains only 3 nodes: `litA`, `litB`, and `callSum`.

## How to Run

```bash
pnpm run-example cir/meta/dce-basic
```

## Implementation Notes

The `optimize:dce` operator is implemented entirely in SPIRAL CIR:
- Uses `fix` combinators for recursive traversal
- Maintains a worklist and visited set (avoiding duplicates)
- Performs reachability analysis starting from the result node
- Returns a new document with filtered nodes

See `src/stdlib/optimize-dce.cir.json` for the full implementation.
