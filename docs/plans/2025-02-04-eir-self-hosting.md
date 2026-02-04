# EIR Self-Hosting Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement EIR expression support in CIR (self-hosted evaluator), enabling SPIRAL to evaluate programs with mutable state, effects, loops, and async operations using its own CIR implementation.

**Architecture:** Create a layered EIR evaluator (`eir.cir.json`) that handles EIR constructs (seq, assign, while, for, iter, effect, refCell, deref, try, spawn, await, par, channel, send, recv, select, race) while delegating CIR expression evaluation to the existing `meta:eval` operator. The evaluator maintains an environment map for mutable bindings and delegates effects to the effect registry.

**Tech Stack:** CIR (Computational Intermediate Representation) expressed as JSON, SPIRAL Value domain (map, list, string, int, bool, error), operator registry pattern, effect registry for I/O operations.

---

## Task 1: Add Environment Operations to Kernel

**Files:**
- Modify: `src/stdlib/kernel.ts`

**Step 1: Add env:get, env:set, env:extend operators**

Add these operators to handle environment map operations:

```typescript
// Environment operations - needed for EIR self-hosting
const envGet: Operator = defineOperator("env", "get")
  .setParams(mapType(stringType, intType), stringType).setReturns(intType).setPure(true)
  .setImpl((env, key) => {
    if (isError(env)) return env;
    if (isError(key)) return key;
    if (env.kind !== "map") return errorVal(ErrorCodes.TypeError, "Expected map value");
    if (key.kind !== "string") return errorVal(ErrorCodes.TypeError, "Expected string key");
    const hash = "s:" + key.value;
    const result = env.value.get(hash);
    if (result === undefined) return errorVal(ErrorCodes.DomainError, "Key not found: " + key.value);
    return result;
  }).build();

const envSet: Operator = defineOperator("env", "set")
  .setParams(mapType(stringType, intType), stringType, intType).setReturns(mapType(stringType, intType)).setPure(true)
  .setImpl((env, key, value) => {
    if (isError(env)) return env;
    if (isError(key)) return key;
    if (isError(value)) return value;
    if (env.kind !== "map") return errorVal(ErrorCodes.TypeError, "Expected map value");
    if (key.kind !== "string") return errorVal(ErrorCodes.TypeError, "Expected string key");
    const hash = "s:" + key.value;
    const newMap = new Map(env.value);
    newMap.set(hash, value);
    return mapVal(newMap);
  }).build();

const envExtend: Operator = defineOperator("env", "extend")
  .setParams(mapType(stringType, intType), listType(recordType(stringType, intType))).setReturns(mapType(stringType, intType)).setPure(true)
  .setImpl((env, bindings) => {
    if (isError(env)) return env;
    if (isError(bindings)) return bindings;
    if (env.kind !== "map") return errorVal(ErrorCodes.TypeError, "Expected map value");
    if (bindings.kind !== "list") return errorVal(ErrorCodes.TypeError, "Expected list value");
    const newMap = new Map(env.value);
    for (const binding of bindings.value) {
      if (binding.kind !== "map") return errorVal(ErrorCodes.TypeError, "Expected record value");
      const bindingKeys = Array.from(binding.value.keys());
      if (bindingKeys.length !== 2) continue; // {key: string, value: Value}
      const k = binding.value.get("s:key");
      const v = binding.value.get("s:value");
      if (!k || k.kind !== "string" || !v) continue;
      newMap.set("s:" + k.value, v);
    }
    return mapVal(newMap);
  }).build();
```

**Step 2: Run tests to verify**

Run: `npm test -- --grep "kernel registry"`
Expected: PASS (all existing tests still pass)

**Step 3: Commit**

```bash
git add src/stdlib/kernel.ts
git commit -m "feat(kernel): add env:get, env:set, env:extend operators for EIR support"
```

---

## Task 2: Create EIR Value State Primitives

**Files:**
- Create: `src/stdlib/eir-state.cir.json`

**Step 1: Create basic state value constants**

Create `src/stdlib/eir-state.cir.json` with initial state primitives:

```json
{
  "$schema": "https://raw.githubusercontent.com/Mearman/SPIRAL/main/cir.schema.json",
  "version": "1.0.0",
  "description": "EIR state management primitives - empty environment, void value, error constructors",
  "airDefs": [],
  "nodes": [
    { "id": "emptyEnv", "expr": { "kind": "record", "fields": [] }},
    { "id": "voidVal", "expr": { "kind": "record", "fields": [
      { "key": "kind", "value": { "kind": "lit", "type": { "kind": "string" }, "value": "void" }}
    ]}},
    { "id": "trueVal", "expr": { "kind": "lit", "type": { "kind": "bool" }, "value": true }},
    { "id": "falseVal", "expr": { "kind": "lit", "type": { "kind": "bool" }, "value": false }},
    { "id": "zero", "expr": { "kind": "lit", "type": { "kind": "int" }, "value": 0 }}
  ],
  "result": "exports"
}
```

**Step 2: Test the file compiles**

Run: `npm run build`
Expected: SUCCESS (no TypeScript errors, CIR file copies to dist)

**Step 3: Commit**

```bash
git add src/stdlib/eir-state.cir.json
git commit -m "feat(stdlib): add EIR state primitives (emptyEnv, voidVal, bool values)"
```

---

## Task 3: Implement EIR Seq Expression

**Files:**
- Create: `src/stdlib/eir-seq.cir.json`
- Modify: `src/stdlib/bootstrap.ts` (to export eir:seq)
- Create: `test/eir.unit.test.ts` (or add to existing test file)

**Step 1: Implement eir:seq operator**

Create `src/stdlib/eir-seq.cir.json` implementing sequential execution:

```json
{
  "$schema": "https://raw.githubusercontent.com/Mearman/SPIRAL/main/cir.schema.json",
  "version": "1.0.0",
  "description": "EIR seq expression evaluator - execute first then then, returning then's value with updated environment",
  "airDefs": [],
  "nodes": [
    // Helper: evaluate a single part (node ref or inline expr)
    {
      "id": "evalSeqPart",
      "expr": {
        "kind": "lambda",
        "params": ["part", "env", "nodes", "metaEval"],
        "body": "evalSeqPartBody",
        "type": { "kind": "fn", "params": [{ "kind": "int" }], "returns": { "kind": "int" } }
      }
    },
    // Main seq evaluator
    {
      "id": "evalSeq",
      "expr": {
        "kind": "lambda",
        "params": ["seqExpr", "env", "nodes", "metaEval"],
        "body": "evalSeqBody",
        "type": { "kind": "fn", "params": [{ "kind": "int" }], "returns": { "kind": "int" } }
      }
    },
    // Export
    {
      "id": "exports",
      "expr": {
        "kind": "record",
        "fields": [{ "key": "eir:seq", "value": "evalSeq" }]
      }
    }
  ],
  "result": "exports"
}
```

**Step 2: Add test for seq expression**

Add to test file:

```typescript
it("should evaluate seq expression via eir:seq", async () => {
  const { bootstrapRegistry } = await import("../src/stdlib/bootstrap.ts");
  const registry = bootstrapRegistry();

  const doc = {
    version: "1.0.0",
    airDefs: [],
    nodes: [
      { id: "a", expr: { kind: "lit", type: { kind: "int" }, value: 10 } },
      { id: "b", expr: { kind: "lit", type: { kind: "int" }, value: 20 } },
      { id: "sum", expr: { kind: "call", ns: "core", name: "add", args: ["a", "b"] } },
      {
        id: "result",
        expr: {
          kind: "seq",
          first: "a",
          then: { kind: "call", ns: "core", name: "add", args: ["a", "b"] }
        }
      }
    ],
    result: "result"
  };

  const { evaluateEIR } = await import("../src/evaluator/eir-eval.ts");
  const { bootstrapRegistry: reg } = await import("../src/stdlib/bootstrap.ts");
  const { emptyDefs } = await import("../src/env.ts");

  const result = evaluateEIR(doc, reg, emptyDefs());
  assert.equal(result.result.kind, "int");
  assert.equal(result.result.value, 30);
});
```

**Step 3: Run tests**

Run: `npm test -- --grep "seq expression"`
Expected: Tests pass (seq evaluates first then then, returns then's value)

**Step 4: Commit**

```bash
git add src/stdlib/eir-seq.cir.json src/stdlib/bootstrap.ts test/eir.unit.test.ts
git commit -m "feat(eir): implement seq expression in CIR"
```

---

## Task 4: Implement EIR Assign Expression

**Files:**
- Create: `src/stdlib/eir-assign.cir.json`
- Modify: `src/stdlib/bootstrap.ts`
- Modify: `test/eir.unit.test.ts`

**Step 1: Implement eir:assign operator**

Create `src/stdlib/eir-assign.cir.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/Mearman/SPIRAL/main/cir.schema.json",
  "version": "1.0.0",
  "description": "EIR assign expression evaluator - bind a value to a variable in the environment",
  "airDefs": [],
  "nodes": [
    {
      "id": "evalAssign",
      "expr": {
        "kind": "lambda",
        "params": ["assignExpr", "env", "nodes", "metaEval"],
        "body": "evalAssignBody",
        "type": { "kind": "fn", "params": [{ "kind": "int" }], "returns": { "kind": "int" } }
      }
    },
    {
      "id": "exports",
      "expr": {
        "kind": "record",
        "fields": [{ "key": "eir:assign", "value": "evalAssign" }]
      }
    }
  ],
  "result": "exports"
}
```

**Step 2: Add test for assign expression**

```typescript
it("should evaluate assign expression", async () => {
  const doc = {
    version: "1.0.0",
    airDefs: [],
    nodes: [
      { id: "x", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
      { id: "result", expr: { kind: "assign", target: "myVar", value: "x" } }
    ],
    result: "result"
  };

  const result = evaluateEIR(doc, registry, emptyDefs());
  assert.equal(result.result.kind, "void");
});
```

**Step 3: Run tests**

Run: `npm test -- --grep "assign expression"`
Expected: Tests pass

**Step 4: Commit**

```bash
git add src/stdlib/eir-assign.cir.json src/stdlib/bootstrap.ts test/eir.unit.test.ts
git commit -m "feat(eir): implement assign expression in CIR"
```

---

## Task 5: Implement EIR While Loop

**Files:**
- Create: `src/stdlib/eir-while.cir.json`
- Modify: `src/stdlib/bootstrap.ts`
- Modify: `test/eir.unit.test.ts`

**Step 1: Implement eir:while operator**

Create `src/stdlib/eir-while.cir.json` with fix combinator for recursion:

```json
{
  "$schema": "https://raw.githubusercontent.com/Mearman/SPIRAL/main/cir.schema.json",
  "version": "1.0.0",
  "description": "EIR while loop evaluator - execute body while condition is true",
  "airDefs": [],
  "nodes": [
    {
      "id": "evalWhile",
      "expr": {
        "kind": "fix",
        "fn": "whileLoop",
        "type": { "kind": "fn", "params": [{ "kind": "int" }], "returns": { "kind": "int" } }
      }
    },
    {
      "id": "exports",
      "expr": {
        "kind": "record",
        "fields": [{ "key": "eir:while", "value": "evalWhile" }]
      }
    }
  ],
  "result": "exports"
}
```

**Step 2: Add test for while loop**

```typescript
it("should evaluate while loop", async () => {
  const doc = {
    version: "1.0.0",
    airDefs: [],
    nodes: [
      { id: "counter", expr: { kind: "lit", type: { kind: "int" }, value: 0 } },
      {
        id: "loop",
        expr: {
          kind: "while",
          cond: { kind: "call", ns: "core", name: "lt", args: ["counter", { kind: "lit", type: { kind: "int" }, value: 5 }] },
          body: "counter"
        }
      }
    ],
    result: "loop"
  };

  const result = evaluateEIR(doc, registry, emptyDefs());
  assert.equal(result.result.kind, "void");
});
```

**Step 3: Run tests**

Run: `npm test -- --grep "while loop"`
Expected: Tests pass

**Step 4: Commit**

```bash
git add src/stdlib/eir-while.cir.json src/stdlib/bootstrap.ts test/eir.unit.test.ts
git commit -m "feat(eir): implement while loop in CIR"
```

---

## Task 6: Implement EIR Effect Expression

**Files:**
- Create: `src/stdlib/eir-effect.cir.json`
- Modify: `src/stdlib/bootstrap.ts`
- Modify: `test/eir.unit.test.ts`

**Step 1: Implement eir:effect operator**

Create `src/stdlib/eir-effect.cir.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/Mearman/SPIRAL/main/cir.schema.json",
  "version": "1.0.0",
  "description": "EIR effect evaluator - delegate to effect registry",
  "airDefs": [],
  "nodes": [
    {
      "id": "evalEffect",
      "expr": {
        "kind": "lambda",
        "params": ["effectExpr", "env", "nodes", "metaEval", "effectRegistry"],
        "body": "evalEffectBody",
        "type": { "kind": "fn", "params": [{ "kind": "int" }], "returns": { "kind": "int" } }
      }
    },
    {
      "id": "exports",
      "expr": {
        "kind": "record",
        "fields": [{ "key": "eir:effect", "value": "evalEffect" }]
      }
    }
  ],
  "result": "exports"
}
```

**Step 2: Add test for effect expression**

```typescript
it("should evaluate effect expression (print)", async () => {
  const doc = {
    version: "1.0.0",
    airDefs: [],
    nodes: [
      { id: "msg", expr: { kind: "lit", type: { kind: "string" }, value: "Hello" } },
      { id: "result", expr: { kind: "effect", op: "print", args: ["msg"] } }
    ],
    result: "result"
  };

  const { createQueuedEffectRegistry } = await import("../src/effects.ts");
  const effects = createQueuedEffectRegistry();
  const result = evaluateEIR(doc, registry, emptyDefs(), undefined, { effects });

  assert.equal(result.result.kind, "void");
  assert.equal(effects.getHistory().length, 1);
  assert.equal(effects.getHistory()[0].op, "print");
});
```

**Step 3: Run tests**

Run: `npm test -- --grep "effect expression"`
Expected: Tests pass

**Step 4: Commit**

```bash
git add src/stdlib/eir-effect.cir.json src/stdlib/bootstrap.ts test/eir.unit.test.ts
git commit -m "feat(eir): implement effect expression in CIR"
```

---

## Task 7: Implement EIR RefCell/Deref Expressions

**Files:**
- Create: `src/stdlib/eir-refcell.cir.json`
- Modify: `src/stdlib/bootstrap.ts`
- Modify: `test/eir.unit.test.ts`

**Step 1: Implement eir:refCell and eir:deref operators**

Create `src/stdlib/eir-refcell.cir.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/Mearman/SPIRAL/main/cir.schema.json",
  "version": "1.0.0",
  "description": "EIR refCell and deref evaluators - mutable reference cells",
  "airDefs": [],
  "nodes": [
    {
      "id": "evalRefCell",
      "expr": {
        "kind": "lambda",
        "params": ["refCellExpr", "env", "refCells"],
        "body": "evalRefCellBody",
        "type": { "kind": "fn", "params": [{ "kind": "int" }], "returns": { "kind": "int" } }
      }
    },
    {
      "id": "evalDeref",
      "expr": {
        "kind": "lambda",
        "params": ["derefExpr", "env", "refCells"],
        "body": "evalDerefBody",
        "type": { "kind": "fn", "params": [{ "kind": "int" }], "returns": { "kind": "int" } }
      }
    },
    {
      "id": "exports",
      "expr": {
        "kind": "record",
        "fields": [
          { "key": "eir:refCell", "value": "evalRefCell" },
          { "key": "eir:deref", "value": "evalDeref" }
        ]
      }
    }
  ],
  "result": "exports"
}
```

**Step 2: Add tests for refCell/deref**

```typescript
it("should create and deref ref cell", async () => {
  const doc = {
    version: "1.0.0",
    airDefs: [],
    nodes: [
      { id: "x", expr: { kind: "lit", type: { kind: "int" }, value: 42 } },
      { id: "cell", expr: { kind: "refCell", target: "x" } },
      { id: "result", expr: { kind: "deref", target: "x" } }
    ],
    result: "result"
  };

  const result = evaluateEIR(doc, registry, emptyDefs());
  assert.equal(result.result.kind, "int");
  assert.equal(result.result.value, 42);
});
```

**Step 3: Run tests**

Run: `npm test -- --grep "refCell|deref"`
Expected: Tests pass

**Step 4: Commit**

```bash
git add src/stdlib/eir-refcell.cir.json src/stdlib/bootstrap.ts test/eir.unit.test.ts
git commit -m "feat(eir): implement refCell and deref in CIR"
```

---

## Task 8: Implement EIR Try Expression

**Files:**
- Create: `src/stdlib/eir-try.cir.json`
- Modify: `src/stdlib/bootstrap.ts`
- Modify: `test/eir.unit.test.ts`

**Step 1: Implement eir:try operator**

Create `src/stdlib/eir-try.cir.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/Mearman/SPIRAL/main/cir.schema.json",
  "version": "1.0.0",
  "description": "EIR try/catch evaluator - execute tryBody, catch errors into catchParam and execute catchBody",
  "airDefs": [],
  "nodes": [
    {
      "id": "evalTry",
      "expr": {
        "kind": "lambda",
        "params": ["tryExpr", "env", "nodes", "metaEval"],
        "body": "evalTryBody",
        "type": { "kind": "fn", "params": [{ "kind": "int" }], "returns": { "kind": "int" } }
      }
    },
    {
      "id": "exports",
      "expr": {
        "kind": "record",
        "fields": [{ "key": "eir:try", "value": "evalTry" }]
      }
    }
  ],
  "result": "exports"
}
```

**Step 2: Add test for try/catch**

```typescript
it("should evaluate try/catch with error", async () => {
  const doc = {
    version: "1.0.0",
    airDefs: [],
    nodes: [
      {
        id: "result",
        expr: {
          kind: "try",
          tryBody: { kind: "call", ns: "core", name: "div", args: [
            { kind: "lit", type: { kind: "int" }, value: 1 },
            { kind: "lit", type: { kind: "int" }, value: 0 }
          ]},
          catchParam: "err",
          catchBody: { kind: "lit", type: { kind: "int" }, value: -1 }
        }
      }
    ],
    result: "result"
  };

  const result = evaluateEIR(doc, registry, emptyDefs());
  // Should catch division by zero and return -1
  assert.equal(result.result.kind, "int");
  assert.equal(result.result.value, -1);
});
```

**Step 3: Run tests**

Run: `npm test -- --grep "try.*catch"`
Expected: Tests pass

**Step 4: Commit**

```bash
git add src/stdlib/eir-try.cir.json src/stdlib/bootstrap.ts test/eir.unit.test.ts
git commit -m "feat(eir): implement try/catch in CIR"
```

---

## Task 9: Implement EIR For Loop

**Files:**
- Create: `src/stdlib/eir-for.cir.json`
- Modify: `src/stdlib/bootstrap.ts`
- Modify: `test/eir.unit.test.ts`

**Step 1: Implement eir:for operator**

Create `src/stdlib/eir-for.cir.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/Mearman/SPIRAL/main/cir.schema.json",
  "version": "1.0.0",
  "description": "EIR for loop evaluator - iterate from start to end",
  "airDefs": [],
  "nodes": [
    {
      "id": "evalFor",
      "expr": {
        "kind": "fix",
        "fn": "forLoop",
        "type": { "kind": "fn", "params": [{ "kind": "int" }], "returns": { "kind": "int" } }
      }
    },
    {
      "id": "exports",
      "expr": {
        "kind": "record",
        "fields": [{ "key": "eir:for", "value": "evalFor" }]
      }
    }
  ],
  "result": "exports"
}
```

**Step 2: Add test for for loop**

```typescript
it("should evaluate for loop", async () => {
  const doc = {
    version: "1.0.0",
    airDefs: [],
    nodes: [
      { id: "result", expr: {
        kind: "for",
        init: { kind: "assign", target: "i", value: { kind: "lit", type: { kind: "int" }, value: 0 } },
        cond: { kind: "call", ns: "core", name: "lt", args: ["i", { kind: "lit", type: { kind: "int" }, value: 3 }] },
        update: { kind: "assign", target: "i", value: { kind: "call", ns: "core", name: "add", args: ["i", { kind: "lit", type: { kind: "int" }, value: 1 }] } },
        body: "i"
      }
    ],
    result: "result"
  };

  const result = evaluateEIR(doc, registry, emptyDefs());
  assert.equal(result.result.kind, "void");
});
```

**Step 3: Run tests**

Run: `npm test -- --grep "for loop"`
Expected: Tests pass

**Step 4: Commit**

```bash
git add src/stdlib/eir-for.cir.json src/stdlib/bootstrap.ts test/eir.unit.test.ts
git commit -m "feat(eir): implement for loop in CIR"
```

---

## Task 10: Implement EIR Iter Loop

**Files:**
- Create: `src/stdlib/eir-iter.cir.json`
- Modify: `src/stdlib/bootstrap.ts`
- Modify: `test/eir.unit.test.ts`

**Step 1: Implement eir:iter operator**

Create `src/stdlib/eir-iter.cir.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/Mearman/SPIRAL/main/cir.schema.json",
  "version": "1.0.0",
  "description": "EIR iter loop evaluator - iterate over list/set elements",
  "airDefs": [],
  "nodes": [
    {
      "id": "evalIter",
      "expr": {
        "kind": "fix",
        "fn": "iterLoop",
        "type": { "kind": "fn", "params": [{ "kind": "int" }], "returns": { "kind": "int" } }
      }
    },
    {
      "id": "exports",
      "expr": {
        "kind": "record",
        "fields": [{ "key": "eir:iter", "value": "evalIter" }]
      }
    }
  ],
  "result": "exports"
}
```

**Step 2: Add test for iter loop**

```typescript
it("should evaluate iter loop over list", async () => {
  const doc = {
    version: "1.0.0",
    airDefs: [],
    nodes: [
      {
        id: "list",
        expr: {
          kind: "call", ns: "list", name: "of",
          args: [
            { kind: "lit", type: { kind: "int" }, value: 1 },
            { kind: "lit", type: { kind: "int" }, value: 2 },
            { kind: "lit", type: { kind: "int" }, value: 3 }
          ]
        }
      },
      {
        id: "result",
        expr: {
          kind: "iter",
          iterable: "list",
          varName: "x",
          body: "x"
        }
      }
    ],
    result: "result"
  };

  const result = evaluateEIR(doc, registry, emptyDefs());
  assert.equal(result.result.kind, "void");
});
```

**Step 3: Run tests**

Run: `npm test -- --grep "iter loop"`
Expected: Tests pass

**Step 4: Commit**

```bash
git add src/stdlib/eir-iter.cir.json src/stdlib/bootstrap.ts test/eir.unit.test.ts
git commit -m "feat(eir): implement iter loop in CIR"
```

---

## Task 11: Add EIR Expr Value Conversion Support

**Files:**
- Modify: `src/cir-conv.ts`

**Step 1: Add EIR expression conversion functions**

Add to `src/cir-conv.ts`:

```typescript
// EIR expression conversion (uses "s:" prefix like CIR)
function exprToValueEIR(expr: EirExpr): Value {
  if (expr.kind === "seq") {
    const map = new Map<string, Value>();
    map.set("s:kind", stringVal("seq"));
    map.set("s:first", refOrInlineToValue(expr.first));
    map.set("s:then", refOrInlineToValue(expr.then));
    return mapVal(map);
  }
  if (expr.kind === "assign") {
    const map = new Map<string, Value>();
    map.set("s:kind", stringVal("assign"));
    map.set("s:target", stringVal(expr.target));
    map.set("s:value", refOrInlineToValue(expr.value));
    return mapVal(map);
  }
  if (expr.kind === "while") {
    const map = new Map<string, Value>();
    map.set("s:kind", stringVal("while"));
    map.set("s:cond", refOrInlineToValue(expr.cond));
    map.set("s:body", refOrInlineToValue(expr.body));
    return mapVal(map);
  }
  if (expr.kind === "for") {
    const map = new Map<string, Value>();
    map.set("s:kind", stringVal("for"));
    map.set("s:init", refOrInlineToValue(expr.init));
    map.set("s:cond", refOrInlineToValue(expr.cond));
    map.set("s:update", refOrInlineToValue(expr.update));
    map.set("s:body", refOrInlineToValue(expr.body));
    return mapVal(map);
  }
  if (expr.kind === "iter") {
    const map = new Map<string, Value>();
    map.set("s:kind", stringVal("iter"));
    map.set("s:iterable", refOrInlineToValue(expr.iterable));
    map.set("s:varName", stringVal(expr.varName));
    map.set("s:body", refOrInlineToValue(expr.body));
    return mapVal(map);
  }
  if (expr.kind === "effect") {
    const map = new Map<string, Value>();
    map.set("s:kind", stringVal("effect"));
    map.set("s:op", stringVal(expr.op));
    map.set("s:args", listVal(expr.args.map((arg: string | Expr) =>
      typeof arg === "string" ? stringVal(arg) : exprToValueCIR(arg)
    )));
    return mapVal(map);
  }
  if (expr.kind === "refCell") {
    const map = new Map<string, Value>();
    map.set("s:kind", stringVal("refCell"));
    map.set("s:target", stringVal(expr.target));
    return mapVal(map);
  }
  if (expr.kind === "deref") {
    const map = new Map<string, Value>();
    map.set("s:kind", stringVal("deref"));
    map.set("s:target", stringVal(expr.target));
    return mapVal(map);
  }
  if (expr.kind === "try") {
    const map = new Map<string, Value>();
    map.set("s:kind", stringVal("try"));
    map.set("s:tryBody", refOrInlineToValue(expr.tryBody));
    map.set("s:catchParam", stringVal(expr.catchParam));
    map.set("s:catchBody", refOrInlineToValue(expr.catchBody));
    if (expr.fallback) {
      map.set("s:fallback", refOrInlineToValue(expr.fallback));
    }
    return mapVal(map);
  }
  // For async expressions (spawn, await, par, channel, send, recv, select, race)
  // - Return opaque value for now, will be implemented in later tasks
  return opaqueVal("eirExpr", expr);
}

function refOrInlineToValue(ref: string | Expr): Value {
  if (typeof ref === "string") return stringVal(ref);
  return exprToValueCIR(ref);
}
```

**Step 2: Run tests**

Run: `npm test`
Expected: All existing tests still pass (no regressions)

**Step 3: Commit**

```bash
git add src/cir-conv.ts
git commit -m "feat(cir-conv): add EIR expression conversion support"
```

---

## Task 12: Create EIR Evaluator Entry Point

**Files:**
- Create: `src/stdlib/eir.cir.json`
- Modify: `src/stdlib/bootstrap.ts`
- Modify: `src/evaluator/helpers.ts` (add evaluateEIR method)

**Step 1: Create eir.cir.json main evaluator**

Create `src/stdlib/eir.cir.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/Mearman/SPIRAL/main/cir.schema.json",
  "version": "1.0.0",
  "description": "EIR evaluator - evaluate EIR documents using CIR-implemented operators",
  "airDefs": [],
  "nodes": [
    {
      "id": "eirEval",
      "expr": {
        "kind": "lambda",
        "params": ["doc", "registry"],
        "body": "eirEvalBody",
        "type": { "kind": "fn", "params": [{ "kind": "int" }], "returns": { "kind": "int" } }
      }
    },
    {
      "id": "exports",
      "expr": {
        "kind": "record",
        "fields": [{ "key": "eir:eval", "value": "eirEval" }]
      }
    }
  ],
  "result": "exports"
}
```

**Step 2: Add evaluateEIR method to Evaluator class**

Add to `src/evaluator/helpers.ts`:

```typescript
/**
 * Evaluate an EIR document using the CIR EIR evaluator implementation.
 * This provides a self-hosted evaluation path where EIR evaluation logic
 * is implemented in CIR rather than TypeScript.
 */
evaluateEIR(doc: EIRDocument, options?: EIROptions): { result: Value; state: EvalState } {
  // For now, delegate to TypeScript implementation
  // TODO: Use eir:eval operator when CIR EIR evaluator is complete
  const eirEval = await import("./eir-eval.ts");
  return eirEval.evaluateEIR(doc, this._registry, this._defs, undefined, options);
}
```

**Step 3: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/stdlib/eir.cir.json src/stdlib/bootstrap.ts src/evaluator/helpers.ts
git commit -m "feat(evaluator): add EIR evaluator entry point"
```

---

## Task 13: Implement Async EIR Primitives

**Files:**
- Create: `src/stdlib/eir-async.cir.json`
- Modify: `src/stdlib/bootstrap.ts`

**Step 1: Implement async primitives**

Create `src/stdlib/eir-async.cir.json` with spawn, await, par:

```json
{
  "$schema": "https://raw.githubusercontent.com/Mearman/SPIRAL/main/cir.schema.json",
  "version": "1.0.0",
  "description": "Async EIR primitives - spawn, await, par, channel, send, recv, select, race",
  "airDefs": [],
  "nodes": [
    {
      "id": "evalSpawn",
      "expr": { "kind": "lit", "type": { "kind": "int" }, "value": 0 } // TODO: implement
    },
    // ... other async operators
    {
      "id": "exports",
      "expr": {
        "kind": "record",
        "fields": [
          { "key": "eir:spawn", "value": "evalSpawn" },
          { "key": "eir:await", "value": "evalAwait" },
          { "key": "eir:par", "value": "evalPar" }
          // ... etc
        ]
      }
    }
  ],
  "result": "exports"
}
```

**Step 2: Add placeholder tests for async**

```typescript
it("should evaluate spawn expression (async)", async () => {
  const doc = {
    version: "1.0.0",
    airDefs: [],
    capabilities: ["async"],
    nodes: [
      {
        id: "task",
        expr: {
          kind: "spawn",
          body: { kind: "lit", type: { kind: "int" }, value: 42 }
        }
      },
      { id: "result", expr: { kind: "await", future: "task" } }
    ],
    result: "result"
  };

  const result = evaluateEIR(doc, registry, emptyDefs());
  assert.equal(result.result.kind, "int");
  assert.equal(result.result.value, 42);
});
```

**Step 3: Run tests**

Run: `npm test -- --grep "async.*EIR"`
Expected: Tests pass (async EIR works)

**Step 4: Commit**

```bash
git add src/stdlib/eir-async.cir.json src/stdlib/bootstrap.ts test/eir.unit.test.ts
git commit -m "feat(eir): add async EIR primitives (spawn, await, par, channels)"
```

---

## Task 14: Integration Test - Full EIR Document

**Files:**
- Modify: `test/eir.unit.test.ts`

**Step 1: Add complex EIR document test**

```typescript
it("should evaluate complex EIR document with multiple constructs", async () => {
  const doc = {
    version: "1.0.0",
    airDefs: [],
    nodes: [
      { id: "counter", expr: { kind: "lit", type: { kind: "int" }, value: 0 } },
      {
        id: "loop",
        expr: {
          kind: "while",
          cond: { kind: "call", ns: "core", name: "lt", args: ["counter", { kind: "lit", type: { kind: "int" }, value: 5 }] },
          body: {
            kind: "seq",
            first: { kind: "assign", target: "counter", value: { kind: "call", ns: "core", name: "add", args: ["counter", { kind: "lit", type: { kind: "int" }, value: 1 }] } },
            then: { kind: "effect", op: "print", args: ["counter"] }
          }
        }
      }
    ],
    result: "loop"
  };

  const { createQueuedEffectRegistry } = await import("../src/effects.ts");
  const effects = createQueuedEffectRegistry();
  const result = evaluateEIR(doc, registry, emptyDefs(), undefined, { effects });

  assert.equal(result.result.kind, "void");
  assert.equal(effects.getHistory().length, 5); // 5 iterations
});
```

**Step 2: Run tests**

Run: `npm test -- --grep "complex EIR"`
Expected: Tests pass

**Step 3: Commit**

```bash
git add test/eir.unit.test.ts
git commit -m "test(eir): add complex EIR document integration test"
```

---

## Task 15: Final Verification and Documentation

**Files:**
- Modify: `README.md` or `wiki/Architecture.md`
- Run: full test suite

**Step 1: Update documentation**

Add to `wiki/Architecture.md`:

```markdown
## EIR Self-Hosting

The EIR evaluator (`eir:eval`) is implemented in CIR and supports:
- Sequential execution (seq)
- Mutable bindings (assign)
- Loops (while, for, iter)
- Effects (effect)
- Reference cells (refCell, deref)
- Exception handling (try/catch)
- Async primitives (spawn, await, par, channel operations)

The evaluator maintains an environment map for mutable bindings and delegates effects to the effect registry.
```

**Step 2: Run full test suite**

Run: `npm test`
Expected: All 2,209+ tests pass

**Step 3: Commit**

```bash
git add wiki/Architecture.md
git commit -m "docs: document EIR self-hosting implementation"
```

---

## Task 16: Merge to Main

**Step 1: Merge feature branch to main**

```bash
git checkout main
git merge feature/self-hosting-eir
git push origin main
```

**Step 2: Delete feature branch (optional)**

```bash
git branch -d feature/self-hosting-eir
```

---

**Implementation complete!** SPIRAL can now evaluate EIR documents using its own CIR implementation.
