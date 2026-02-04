# SPIRAL Self-Hosting

## Overview

SPIRAL is partially self-hosting: the core typechecker and evaluator are implemented in SPIRAL CIR (Computational Intermediate Representation) format and loaded at runtime.

## Current State

### Self-Hosted Components

| Component | File | Lines | Status |
|-----------|------|-------|--------|
| Typechecker | `dist/stdlib/typecheck.cir.json` | ~125KB | ✅ Loaded and callable |
| Meta-circular evaluator | `dist/stdlib/meta.cir.json` | ~49KB | ✅ Loaded and callable |
| Validator | `dist/stdlib/validate.cir.json` | ~55KB | ✅ Loaded and callable |
| Schema handling | `dist/stdlib/schema.cir.json` | ~79KB | ✅ Loaded and callable |
| Parser | `dist/stdlib/parse.cir.json` | ~45KB | ✅ Loaded and callable |
| Synth (TypeScript) | `dist/stdlib/synth-typescript.cir.json` | ~32KB | ✅ Loaded and callable |
| Registry operations | `dist/stdlib/registry.cir.json` | ~8KB | ✅ Loaded and callable |
| Effect system | `dist/stdlib/effects.cir.json` | ~7KB | ✅ Loaded and callable |

### Bootstrap Process

1. **Kernel Registry** (`src/stdlib/kernel.ts`): Native TypeScript operators (arithmetic, comparison, etc.)
2. **CIR Stdlib Loading** (`src/stdlib/loader.ts`): Loads `.cir.json` files and extracts operators
3. **Operator Registration**: CIR closures are wrapped as TypeScript operators

```typescript
import { bootstrapRegistry } from "./dist/index.js";

const registry = bootstrapRegistry();
// Registry now contains 132 operators, including:
// - typecheck:typecheck (CIR implementation)
// - meta:eval (CIR implementation)
// - validate:validate (CIR implementation)
// - registry:* (CIR implementation)
// - effects:* (CIR implementation)
```

## Conversion Layer

The `cir-conv.ts` module provides bidirectional conversion between TypeScript `CIRDocument` objects and SPIRAL `Value` types:

```typescript
import { cirDocumentToValue, valueToCirDocument } from "./dist/index.js";

// Convert TypeScript CIRDocument to SPIRAL Value
const doc = {
  version: "1.0.0",
  airDefs: [],
  nodes: [
    { id: "x", expr: { kind: "lit", type: { kind: "int" }, value: 42 } }
  ],
  result: "x"
};
const value = cirDocumentToValue(doc);

// Round-trip conversion
const roundTripped = valueToCirDocument(value);
```

### Conversion Support

| Type | CIRDocument → Value | Value → CIRDocument |
|------|---------------------|---------------------|
| Literals (int, bool, string, float) | ✅ | ✅ |
| Ref expressions | ✅ | ✅ |
| Var expressions | ✅ | ✅ |
| Call expressions | ⚠️ Opaque | ❌ Not supported |
| Lambda expressions | ⚠️ Opaque | ❌ Not supported |
| Other expressions | ⚠️ Opaque | ❌ Not supported |

Note: Opaque values preserve the original data for round-trip verification but cannot be converted back to Expr without additional implementation.

## Irreducible Kernel

The following components **cannot** be eliminated because they provide native runtime capabilities:

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| Kernel operators | `src/stdlib/kernel.ts` | ~454 | Native arithmetic, comparison |
| Operator registry | `src/domains/registry.ts` | ~100 | Operator dispatch |
| Effect registry | `src/effects.ts` | ~267 | I/O and state effects |
| Error types | `src/errors.ts` | ~296 | Error handling |
| JSON parsing | `src/utils/json-pointer.ts` | ~444 | JSON Pointer implementation |
| Canonicalization | `src/canonicalize.ts` | ~200 | Crypto/hashing |

**Total**: ~1,761 lines of TypeScript (cannot be reduced)

## Usage Examples

### Using the CIR Typechecker

```typescript
import { bootstrapRegistry, cirDocumentToValue } from "./dist/index.js";

const registry = bootstrapRegistry();
const typecheckOp = registry.get("typecheck:typecheck");

// The CIR typechecker expects a Value, not a CIRDocument
const docValue = cirDocumentToValue(myDoc);

// Note: Calling the CIR typechecker requires proper Value formatting
// This is currently used internally by the stdlib loader
```

### Using the CIR Evaluator

```typescript
import { bootstrapRegistry, cirDocumentToValue } from "./dist/index.js";

const registry = bootstrapRegistry();
const metaEval = registry.get("meta:eval");

// The CIR evaluator expects a Value (converted from CIRDocument)
const docValue = cirDocumentToValue(myDoc);

// Note: Full evaluation requires proper closure and environment setup
```

## Testing

Self-hosting tests verify:

1. **CIR Stdlib Loading**: Operators are loaded from CIR files (132+ operators)
2. **Conversion Layer**: Round-trip conversion works for supported types
3. **TypeScript vs CIR**: Both implementations produce equivalent results
4. **Registry Operators**: CIR registry operations (empty, opKey, lookup, register)
5. **Effect System Operators**: CIR effect system operations (empty, lookup, register, createIO, createState)

Run tests:
```bash
npm test
# Or specific test file:
node --test test/self-hosting.test.ts
```

## CIR-Implemented Infrastructure

### Registry Operations (`registry.cir.json`)

The operator registry data operations are implemented in CIR:

| Operator | Purpose |
|----------|---------|
| `registry:empty` | Create empty registry |
| `registry:opKey` | Create qualified key from ns:name |
| `registry:makeOpKey` | Extract key from operator map |
| `registry:lookup` | Look up operator by qualified key |
| `registry:register` | Register operator in registry |

**Note**: The actual function dispatch remains in TypeScript because it stores JavaScript closures. The CIR implementation handles data manipulation only.

### Effect System (`effects.cir.json`)

Effect registry data operations are implemented in CIR:

| Operator | Purpose |
|----------|---------|
| `effects:empty` | Create empty effect registry |
| `effects:lookup` | Look up effect by name |
| `effects:register` | Register effect in registry |
| `effects:createIO` | Create IO effect operation record |
| `effects:createState` | Create state effect operation record |

**Note**: Actual I/O and state operations remain in TypeScript because they need host runtime access. The CIR implementation handles data structures only.

## Future Work

To increase self-hosting coverage:

1. **Expand Conversion Layer**: Support full Expr round-trip (call, lambda, etc.)
2. ~~**Port Registry**: Implement operator registry in CIR~~ ✅ Done (data operations only)
3. ~~**Port Effects**: Implement effect system in CIR~~ ✅ Done (data operations only)
4. **Direct CIR Evaluation**: Enable `meta:eval` to work without TypeScript wrapper
5. **Port More Stdlib**: Implement additional utility libraries in CIR

## Statistics

| Metric | Value |
|--------|-------|
| Total TypeScript (source) | ~22,000 lines |
| Self-hosted CIR stdlib | ~700KB (22 files) |
| Irreducible kernel | ~1,761 lines |
| Operators in registry | 132 |
| Test coverage | 2,195 tests passing |

See [wiki/Self-Hosting.md](../wiki/Self-Hosting.md) for architectural details.
