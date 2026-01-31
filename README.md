# SPIRAL (**Stratified Progressive Intermediate Representation Architecture Language**)

[![npm](https://img.shields.io/npm/v/spiral)](https://www.npmjs.com/package/spiral)
[![Node](https://img.shields.io/node/v/spiral)](https://nodejs.org)

SPIRAL is a JSON-first intermediate representation spanning AIR, CIR, EIR, PIR, and LIR. All layers support expression and CFG block forms (hybrid documents).

## Layers & Computational Classes

| Layer | Name | Computational Class | Key Feature |
|-------|------|---------------------|-------------|
| **AIR** | Algebraic IR | Primitive Recursive (bounded) | Pure, no recursion, always terminates |
| **CIR** | Computational IR | Turing-Complete | Lambdas, `fix` combinator for recursion |
| **EIR** | Execution IR | Turing-Complete | Sequencing, mutation, loops, effects |
| **PIR** | Parallel IR | Turing-Complete | Async/parallel primitives (`spawn`, `await`, channels) |
| **LIR** | Low-Level IR | Turing-Complete | CFG-based, SSA with phi nodes |

### Stratified Capability Lattice

SPIRAL's layers form a strict capability hierarchy where each transition adds
constructs the previous layer cannot express:

```
AIR (pure, bounded)
 |  +lambda, +fix, +callExpr, +do
CIR (functional, recursive)
 |  +seq, +assign, +while, +for, +iter, +effect, +refCell, +deref, +try
EIR (imperative, effectful)
 |  +spawn, +await, +par, +channel, +send, +recv, +select, +race
PIR (concurrent, async)
 |  lowered to CFG
LIR (control-flow graph, SSA)
```

This is analogous to the Chomsky hierarchy of formal languages, where each level
adds a capability the previous provably lacks. The analogy is imperfect: while
AIR is strictly less powerful than CIR (primitive recursive vs Turing-complete),
CIR/EIR/PIR are all Turing-complete. Their distinction is in *expressible
programming paradigms*, not raw computational power. An EIR program can simulate
concurrency but cannot directly express `spawn` or `await`; these require PIR.

Layer enforcement is structural: each layer's Zod schema restricts which
expression kinds are permitted. A CIR document containing a `spawn` expression
will fail validation.

See [wiki/Architecture.md](wiki/Architecture.md) for details.

## Quick start
```bash
pnpm install
pnpm build
pnpm test
```

Run examples (folder or file stem):
```bash
pnpm run-example air/basics/arithmetic
pnpm run-example air/basics/arithmetic/arithmetic
```

## Wiki
- Wiki home & navigation: [wiki/Home.md](wiki/Home.md)
- Quick start: [wiki/Quick-Start.md](wiki/Quick-Start.md)
- Examples & learning path: [wiki/Examples.md](wiki/Examples.md)
- Architecture (layers, expression/CFG hybrids): [wiki/Architecture.md](wiki/Architecture.md)
- Specification (sections): [wiki/Specification.md](wiki/Specification.md)
- Appendices: [wiki/Appendices.md](wiki/Appendices.md)
- Schemas and references: [wiki/Schemas-and-References.md](wiki/Schemas-and-References.md)
