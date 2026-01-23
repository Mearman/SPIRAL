# CAIRS (**Computational Algebraic & Iterative Representation System**)

[![npm](https://img.shields.io/npm/v/cairs)](https://www.npmjs.com/package/cairs)
[![Node](https://img.shields.io/node/v/cairs)](https://nodejs.org)

CAIRS is a JSON-first intermediate representation spanning AIR, CIR, EIR, PIR, and LIR. All layers support expression and CFG block forms (hybrid documents).

## Layers & Computational Classes

| Layer | Name | Computational Class | Key Feature |
|-------|------|---------------------|-------------|
| **AIR** | Algebraic IR | Primitive Recursive (bounded) | Pure, no recursion, always terminates |
| **CIR** | Computational IR | Turing-Complete | Lambdas, `fix` combinator for recursion |
| **EIR** | Execution IR | Turing-Complete | Sequencing, mutation, loops, effects |
| **PIR** | Parallel IR | Turing-Complete | Async/parallel primitives (`spawn`, `await`, channels) |
| **LIR** | Low-Level IR | Turing-Complete | CFG-based, SSA with phi nodes |

See [docs/Architecture.md](docs/Architecture.md) for details.

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
- Wiki home & navigation: [docs/Home.md](docs/Home.md)
- Quick start: [docs/Quick-Start.md](docs/Quick-Start.md)
- Examples & learning path: [docs/Examples.md](docs/Examples.md)
- Architecture (layers, expression/CFG hybrids): [docs/Architecture.md](docs/Architecture.md)
- Specification (sections): [docs/Specification.md](docs/Specification.md)
- Appendices: [docs/Appendices.md](docs/Appendices.md)
- Schemas and references: [docs/Schemas-and-References.md](docs/Schemas-and-References.md)
