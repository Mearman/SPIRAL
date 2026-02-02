# Constant Folding Example

This example demonstrates the `optimize:fold` stdlib operator, which performs constant folding by evaluating call expressions whose arguments are all literal values.

## What It Does

The `optimize:fold` operator:
1. Takes a CIR document as input
2. Builds a node map for efficient lookups
3. Iterates through each node in the document
4. For call expressions where all arguments are literal values:
   - Builds a mini-document with just those literal nodes and the call node
   - Evaluates the mini-document using `meta:eval`
   - Replaces the call expression with the resulting literal value
5. Returns a new document with folded expressions

## Result

This example verifies that the `optimize:fold` operator can be successfully called and processes documents correctly.

## How to Run

```bash
npm run run-example cir/optimize/fold-basic
```

## Implementation Notes

The `optimize:fold` operator is implemented entirely in SPIRAL CIR:
- Uses fix combinators for recursive traversal
- Builds a node map for efficient lookups
- Checks if all call arguments are literal expressions
- Constructs a mini-document for evaluation
- Uses `meta:eval` to compute the folded value
- Returns a new document with folded expressions

See `src/stdlib/optimize-fold.cir.json` for the full implementation.

## Limitations

Current implementation has some limitations:
- Only handles simple call expressions with literal arguments
- Requires careful structuring of input documents as data
- The mini-document construction relies on proper node ID references

Future improvements could include:
- Support for nested expressions
- Handling of more complex constant propagation scenarios
- Integration with other optimization passes
