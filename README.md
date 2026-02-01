# SPIRAL (**Stratified Progressive Intermediate Representation Architecture Language**)

SPIRAL is a JSON-first intermediate representation spanning AIR, CIR, EIR, and LIR. All layers support expression and CFG block forms (hybrid documents).

## Layers & Computational Classes

| Layer | Name | Computational Class | Key Feature |
|-------|------|---------------------|-------------|
| **AIR** | Algebraic IR | Primitive Recursive (bounded) | Pure, no recursion, always terminates |
| **CIR** | Computational IR | Turing-Complete | Lambdas, `fix` combinator for recursion |
| **EIR** | Execution IR | Turing-Complete | Sequencing, mutation, loops, effects, async/parallel |
| **LIR** | Low-Level IR | Turing-Complete | CFG-based, SSA with phi nodes |

### When to use each layer

- **AIR** — Pure data transformations, arithmetic pipelines, config evaluation. Guaranteed termination makes it safe for untrusted or sandboxed execution.
- **CIR** — Recursive algorithms (factorial, tree traversal), higher-order functions (map, fold, compose). Functional style without side effects.
- **EIR** — Real-world programs with I/O, mutable state, loops, error handling, and concurrency (spawn/await, channels). The primary authoring layer for most use cases.
- **LIR** — Compiler backends, optimization passes, and code generation. Programs are lowered from EIR to explicit basic blocks with SSA phi nodes.

<details>
<summary><b>AIR</b> — Pure arithmetic: 10 + 20 = 30</summary>

```json
{
  "$schema": "https://raw.githubusercontent.com/Mearman/SPIRAL/main/air.schema.json",
  "version": "1.0.0",
  "airDefs": [],
  "nodes": [
    { "id": "ten",    "expr": { "kind": "lit", "type": { "kind": "int" }, "value": 10 } },
    { "id": "twenty", "expr": { "kind": "lit", "type": { "kind": "int" }, "value": 20 } },
    { "id": "sum",    "expr": { "kind": "call", "ns": "core", "name": "add", "args": ["ten", "twenty"] } }
  ],
  "result": "sum"
}
```

Nodes define literal values and pure function calls. No side effects, no recursion.
</details>

<details>
<summary><b>CIR</b> — Lambda closure: addFive(10) = 15</summary>

```json
{
  "$schema": "https://raw.githubusercontent.com/Mearman/SPIRAL/main/cir.schema.json",
  "version": "1.0.0",
  "airDefs": [],
  "nodes": [
    { "id": "five", "expr": { "kind": "lit", "type": { "kind": "int" }, "value": 5 } },
    { "id": "addFive", "expr": { "kind": "call", "ns": "core", "name": "add", "args": ["x", "five"] } },
    {
      "id": "addFiveLambda",
      "expr": {
        "kind": "lambda", "params": ["x"], "body": "addFive",
        "type": { "kind": "fn", "params": [{ "kind": "int" }], "returns": { "kind": "int" } }
      }
    },
    { "id": "ten", "expr": { "kind": "lit", "type": { "kind": "int" }, "value": 10 } },
    { "id": "result", "expr": { "kind": "callExpr", "fn": "addFiveLambda", "args": ["ten"] } }
  ],
  "result": "result"
}
```

Adds `lambda` and `callExpr` to AIR. The lambda captures `five` from its environment.
</details>

<details>
<summary><b>EIR</b> — Side effects: Hello, World!</summary>

```json
{
  "$schema": "https://raw.githubusercontent.com/Mearman/SPIRAL/main/eir.schema.json",
  "version": "1.0.0",
  "airDefs": [],
  "nodes": [
    { "id": "msg", "expr": { "kind": "lit", "type": { "kind": "string" }, "value": "Hello, World!" } },
    { "id": "greeting", "expr": { "kind": "effect", "op": "print", "args": ["msg"] } }
  ],
  "result": "greeting"
}
```

Adds `effect` for I/O. Also supports `seq`, `assign`, `while`, `spawn`, `await`, channels.
</details>

<details>
<summary><b>LIR</b> — Basic block CFG: x + y + z = 35</summary>

```json
{
  "$schema": "https://raw.githubusercontent.com/Mearman/SPIRAL/main/lir.schema.json",
  "version": "1.0.0",
  "nodes": [
    {
      "id": "main",
      "blocks": [
        {
          "id": "entry",
          "instructions": [
            { "kind": "assign", "target": "x", "value": { "kind": "lit", "type": { "kind": "int" }, "value": 10 } },
            { "kind": "assign", "target": "y", "value": { "kind": "lit", "type": { "kind": "int" }, "value": 20 } },
            { "kind": "op", "target": "sum", "ns": "core", "name": "add", "args": ["x", "y"] },
            { "kind": "assign", "target": "z", "value": { "kind": "lit", "type": { "kind": "int" }, "value": 5 } },
            { "kind": "op", "target": "result", "ns": "core", "name": "add", "args": ["sum", "z"] }
          ],
          "terminator": { "kind": "return", "value": "result" }
        }
      ],
      "entry": "entry"
    }
  ],
  "result": "main"
}
```

Explicit basic blocks with instructions and terminators. Supports `branch`, `jump`, and `phi` nodes for SSA.
</details>

### Stratified Capability Lattice

SPIRAL's layers form a strict capability hierarchy where each transition adds
constructs the previous layer cannot express:

```
AIR (pure, bounded)
 |  +lambda, +fix, +callExpr, +do
CIR (functional, recursive)
 |  +seq, +assign, +while, +for, +iter, +effect, +refCell, +deref, +try, +spawn, +await, +par, +channel, +send, +recv, +select, +race
EIR (imperative, effectful, concurrent)
 |  lowered to CFG
LIR (control-flow graph, SSA)
```

This is analogous to the Chomsky hierarchy of formal languages, where each level
adds a capability the previous provably lacks. The analogy is imperfect: while
AIR is strictly less powerful than CIR (primitive recursive vs Turing-complete),
CIR/EIR are all Turing-complete. Their distinction is in *expressible
programming paradigms*, not raw computational power. EIR extends CIR with
imperative constructs (sequencing, mutation, loops) and concurrent primitives
(`spawn`, `await`, channels).

Layer enforcement is structural: each layer's Zod schema restricts which
expression kinds are permitted. A CIR document containing a `spawn` expression
will fail validation.

See [wiki/Architecture.md](wiki/Architecture.md) for details.

## Comparison with Other Systems

SPIRAL is an intermediate representation, not a rule engine, query language, or policy engine. However, it shares the JSON ecosystem with several related systems. The table below shows where SPIRAL's layers sit relative to these tools:

| System | Format | Computational Power | Types | Side Effects | Primary Use |
|--------|--------|---------------------|-------|--------------|-------------|
| **SPIRAL (AIR)** | JSON | Primitive Recursive | Static | No | Pure transforms, safe eval |
| **SPIRAL (EIR)** | JSON | Turing-Complete | Static | Yes | General programs, I/O, concurrency |
| **JsonLogic** | JSON | Sub-primitive-recursive | Untyped | No | Business rules |
| **CEL** | Text | Primitive Recursive | Strong | No | Policy, validation |
| **JMESPath** | Text | Sub-primitive-recursive | Untyped | No | JSON querying |
| **OPA/Rego** | Text | Datalog + extensions | Inferred | No | Policy decisions |

For detailed comparisons, see [wiki/Comparisons.md](wiki/Comparisons.md).

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
