# EIR Async I/O Examples

This directory contains examples demonstrating async I/O operations in EIR (Execution Intermediate Representation), including file I/O and HTTP requests with parallel execution patterns.

## Overview

EIR includes async I/O effects that return futures, enabling concurrent and parallel I/O operations. These examples show:

- **Concurrent file operations** - Read/write multiple files in parallel
- **Parallel HTTP requests** - Fetch multiple resources simultaneously
- **Timeout handling** - Use select with fallback for guaranteed completion
- **Error handling** - Try/catch around async operations
- **Channel patterns** - Producer-consumer for response aggregation

## Running the Examples

```bash
# Run async file operations example
pnpm run-example eir/io/async-file-ops

# Run parallel HTTP requests example
pnpm run-example eir/io/parallel-http

# Run with verbose output
pnpm run-example eir/io/parallel-http --verbose
```

## Examples

### 1. Async File Operations (`async-file-ops.eir.json`)

Demonstrates file I/O with concurrent reads and proper error handling.

#### Key Features

**Concurrent Reads with `par`**
```json
{
  "id": "concurrentReads",
  "expr": {
    "kind": "par",
    "branches": ["readOp1", "readOp2"]
  }
}
```

Reads multiple files simultaneously. Both `asyncRead` operations execute in parallel.

**Error Handling with `try/catch`**
```json
{
  "id": "safeRead",
  "expr": {
    "kind": "try",
    "tryBody": "readOp",
    "catchParam": "err",
    "catchBody": "errorFallback"
  }
}
```

Wraps async operations in try/catch to handle I/O errors gracefully.

**Timeout with `await`**
```json
{
  "id": "awaitWithTimeout",
  "expr": {
    "kind": "await",
    "future": "readOp1",
    "timeout": "readWithTimeout",
    "fallback": "timeoutFallback"
  }
}
```

Guarantees completion within a time limit, using fallback on timeout.

#### I/O Effects

**asyncRead** - Asynchronously read file contents
- Arguments: `filePath` (string)
- Returns: `Future<string>` with file contents

**asyncWrite** - Asynchronously write to a file
- Arguments: `filePath` (string), `content` (string)
- Returns: `Future<unit>` when write completes

#### Changing Results

Modify the `result` field to see different behaviors:

1. **`"result": "concurrentReads"`** - Parallel file reads (fails if files don't exist)
2. **`"result": "safeConcurrentReads"`** - Parallel reads with error handling
3. **`"result": "awaitWithTimeout"`** - Single read with 5s timeout
4. **`"result": "processFile"`** - Read then write workflow

### 2. Parallel HTTP Requests (`parallel-http.eir.json`)

Demonstrates HTTP requests with parallel execution, race conditions, and channel-based response collection.

#### Key Features

**Parallel Requests with `par`**
```json
{
  "id": "parallelRequests",
  "expr": {
    "kind": "par",
    "branches": ["request1", "request2", "request3"]
  }
}
```

Executes multiple HTTP requests concurrently, returning all responses.

**Select with Timeout (Race)**
```json
{
  "id": "selectFirstResponse",
  "expr": {
    "kind": "select",
    "futures": ["request1", "request2", "request3"],
    "timeout": "timeout",
    "fallback": "fallbackResponse",
    "returnIndex": true
  }
}
```

Returns the first response to complete within 3s timeout. Returns `{index: -1, value: fallback}` if all timeout.

**Race All Requests**
```json
{
  "id": "raceRequests",
  "expr": {
    "kind": "race",
    "tasks": ["request1", "request2", "request3"]
  }
}
```

Executes all tasks in parallel and returns all results as a list.

**Channel-Based Producer-Consumer**
```json
{
  "id": "responseChannel",
  "expr": {
    "kind": "channel",
    "channelType": "mpsc",
    "bufferSize": "responseBufferSize"
  }
}
```

Multiple producers (HTTP requests) send responses to a single consumer through a buffered channel.

#### I/O Effects

**httpGet** - Asynchronously perform HTTP GET request
- Arguments: `url` (string)
- Returns: `Future<string>` with response body

#### Changing Results

Modify the `result` field to see different behaviors:

1. **`"result": "parallelRequests"`** - All 3 requests execute concurrently
2. **`"result": "selectFirstResponse"`** (default) - Race with 3s timeout, returns first response
3. **`"result": "raceRequests"`** - Execute all requests in parallel
4. **`"result": "selectWithShortTimeout"`** - 100ms timeout, likely returns fallback
5. **`"result": "allResponses"`** - Channel-based producer-consumer pattern
6. **`"result": "safeParallelRequests"`** - Parallel requests with error handling

## Async I/O Effect System

### Effect Syntax

Async I/O operations use the `effect` expression with async-specific operations:

```json
{
  "kind": "effect",
  "op": "asyncRead|asyncWrite|httpGet",
  "args": ["arg1", "arg2"]
}
```

When evaluated, async effects return a `Future` value that can be:
- Awaited with `await` expression
- Raced with `select` expression
- Parallelized with `par` expression

### Future Type

Async operations return typed futures:

```json
{
  "kind": "future",
  "of": { "kind": "string" }
}
```

## Parallel Computation Patterns

### 1. Concurrent Execution (`par`)

Execute multiple operations in parallel:

```json
{
  "kind": "par",
  "branches": ["op1", "op2", "op3"]
}
```

- All branches execute concurrently
- Returns when all branches complete
- Order of completion doesn't matter
- Use for independent operations

### 2. Race Condition (`select`)

Select first completion with timeout:

```json
{
  "kind": "select",
  "futures": ["future1", "future2"],
  "timeout": "timeoutValue",
  "fallback": "fallbackValue",
  "returnIndex": true
}
```

- Returns first future to complete
- Timeout prevents indefinite blocking
- `returnIndex: true` returns `{index: n, value: v}`
- Index -1 indicates timeout fired
- Index 0..n-1 indicates which future won

### 3. Parallel Execution (`race`)

Execute all tasks in parallel:

```json
{
  "kind": "race",
  "tasks": ["task1", "task2", "task3"]
}
```

- All tasks execute concurrently
- Returns list of all results
- Use for batched operations

### 4. Producer-Consumer (Channels)

Coordinate async operations with channels:

```json
{
  "id": "channel",
  "expr": {
    "kind": "channel",
    "channelType": "mpsc",
    "bufferSize": "bufferSize"
  }
}
```

**Producers** (multiple tasks):
```json
{
  "kind": "send",
  "channel": "channel",
  "value": "result"
}
```

**Consumer** (single receiver):
```json
{
  "kind": "recv",
  "channel": "channel"
}
```

## Error Handling Patterns

### Try/Catch Around Async Operations

```json
{
  "id": "safeOperation",
  "expr": {
    "kind": "try",
    "tryBody": "asyncEffect",
    "catchParam": "error",
    "catchBody": "fallbackValue"
  }
}
```

- Catches both sync and async errors
- Returns fallback on error
- Use around individual operations or entire workflows

### Timeout Fallbacks

```json
{
  "kind": "await",
  "future": "operation",
  "timeout": "timeoutMs",
  "fallback": "defaultValue"
}
```

- Guaranteed completion within timeout
- Prevents indefinite blocking
- Use for external API calls or file I/O

## Common Patterns

### Parallel File Processing

```json
{
  "reads": {
    "kind": "par",
    "branches": ["readFile1", "readFile2", "readFile3"]
  },
  "process": "processReads",
  "writes": {
    "kind": "par",
    "branches": ["writeFile1", "writeFile2"]
  }
}
```

### Aggregated HTTP Requests

```json
{
  "requests": {
    "kind": "par",
    "branches": ["httpGet1", "httpGet2", "httpGet3"]
  },
  "collect": {
    "kind": "select",
    "futures": ["requests"],
    "timeout": "5000",
    "fallback": "emptyResult"
  }
}
```

### Fan-In with Channels

```json
{
  "channel": "create mpsc channel",
  "producers": {
    "kind": "spawn",
    "task": {
      "kind": "par",
      "branches": ["producer1", "producer2", "producer3"]
    }
  },
  "consumer": {
    "kind": "seq",
    "first": "await producers",
    "then": "recvAll"
  }
}
```

## Performance Considerations

### Concurrency vs Parallelism

- **Concurrent** (`par`): Multiple operations make progress
- **Parallel**: Multiple operations execute simultaneously (hardware-dependent)

### Resource Limits

- File I/O: Limited by disk I/O bandwidth
- HTTP requests: Limited by network bandwidth and connection pool
- Channel buffers: Memory usage scales with buffer size

### Timeout Values

- Too short: Operations timeout before completing
- Too long: Delays error reporting
- Recommended: Set based on expected operation duration + margin

## Related Documentation

- [EIR README](../../eir/README.md) - EIR overview and expression reference
- [EIR Schema](../../eir.schema.json) - EIR document schema
- [EIR Effects](../../eir/basics/effects/README.md) - Basic synchronous effects
- [Async/Spawn](../async/spawn-await/README.md) - Basic async operations
- [Timeout/Select](../async/timeout-select/README.md) - Timeout and race patterns
- [Channels](../channels/README.md) - Channel-based communication

## Implementation Notes

These examples demonstrate async I/O patterns at the IR level. Actual I/O execution requires:

1. **Effect handlers** - Runtime implementation of asyncRead, asyncWrite, httpGet
2. **Async runtime** - Task scheduler and future evaluation
3. **I/O bindings** - Platform-specific file and network operations

The examples show the structure and patterns; actual execution depends on the runtime implementation.
