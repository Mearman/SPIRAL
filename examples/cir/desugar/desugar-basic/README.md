# AIR Defs Desugaring Example

This example demonstrates the `desugar:airDefs` stdlib operator, which converts AIR definitions (airDefs) into lambda functions.

## What It Does

The `desugar:airDefs` operator transforms CIR documents by:
1. Extracting airDefs from the document
2. For each airDef (with ns, name, params, body, result):
   - Generating body node ID
   - Generating lambda node ID
   - Creating body node record
   - Creating lambda node record
3. Replacing airRef expressions with callExpr to the lambda
4. Returning document with airDefs=[] and augmented nodes

## Result

This example verifies that the `desugar:airDefs` operator can be successfully called and processes documents correctly.

## How to Run

```bash
npm run run-example cir/desugar/desugar-basic
```

## Implementation Notes

The `desugar:airDefs` operator is implemented entirely in SPIRAL CIR:
- Processes airDefs sequentially
- Generates unique node IDs for lambda and body
- Creates proper type signatures for lambdas
- Replaces airRef with callExpr using operator lookups
- Maintains document structure while transforming definitions

See `src/stdlib/desugar.cir.json` for the full implementation.

## Usage

To use the desugar:airDefs operator:
```json
{
  "nodes": [
    { "id": "doc", "expr": { "kind": "record", "fields": [...] } },
    { "id": "result", "expr": { "kind": "call", "ns": "desugar", "name": "airDefs", "args": ["doc"] } }
  ],
  "result": "result"
}
```

The operator takes a document with airDefs and returns a new document where:
- airDefs have been converted to lambda nodes
- airRef expressions have been replaced with callExpr
- The document structure is preserved
