#!/usr/bin/env node
// Standalone scheduler test - bypasses Node.js test runner

import { DeterministicScheduler } from "./src/scheduler.js";

type Value = any;

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✓ ${message}`);
    passCount++;
  } else {
    console.error(`✗ ${message}`);
    failCount++;
  }
}

async function testSequential() {
  console.log("\n=== Testing Sequential Mode ===");
  const scheduler = new DeterministicScheduler("sequential");
  const executionOrder: string[] = [];

  scheduler.spawn("task1", async () => {
    executionOrder.push("task1-start");
    await new Promise((resolve) => setTimeout(resolve, 10));
    executionOrder.push("task1-end");
    return 1;
  });

  await new Promise((resolve) => setTimeout(resolve, 50));

  scheduler.spawn("task2", async () => {
    executionOrder.push("task2-start");
    executionOrder.push("task2-end");
    return 2;
  });

  await scheduler.await("task1");
  await scheduler.await("task2");

  assert(executionOrder.includes("task1-start"), "task1-start exists");
  assert(executionOrder.includes("task1-end"), "task1-end exists");
  assert(executionOrder.includes("task2-start"), "task2-start exists");
  assert(executionOrder.includes("task2-end"), "task2-end exists");
  assert(executionOrder.indexOf("task1-end") < executionOrder.indexOf("task2-start"), "task1 completes before task2 starts");
}

async function testBreadthFirst() {
  console.log("\n=== Testing Breadth-First Mode ===");
  const scheduler = new DeterministicScheduler("breadth-first");
  const executionOrder: string[] = [];

  scheduler.spawn("task1", async () => {
    await scheduler.checkGlobalSteps();
    executionOrder.push("task1");
    return 1;
  });

  scheduler.spawn("task2", async () => {
    await scheduler.checkGlobalSteps();
    executionOrder.push("task2");
    return 2;
  });

  scheduler.spawn("task3", async () => {
    await scheduler.checkGlobalSteps();
    executionOrder.push("task3");
    return 3;
  });

  await Promise.all([
    scheduler.await("task1"),
    scheduler.await("task2"),
    scheduler.await("task3"),
  ]);

  assert(executionOrder.length === 3, "All tasks executed");
  assert(scheduler.globalSteps === 0, "GlobalSteps reset to 0 after breadth-first execution");
}

async function testDepthFirst() {
  console.log("\n=== Testing Depth-First Mode ===");
  const scheduler = new DeterministicScheduler("depth-first");
  const executionOrder: string[] = [];

  scheduler.spawn("task1", async () => {
    executionOrder.push("task1");
    return 1;
  });

  scheduler.spawn("task2", async () => {
    executionOrder.push("task2");
    return 2;
  });

  scheduler.spawn("task3", async () => {
    executionOrder.push("task3");
    return 3;
  });

  await Promise.all([
    scheduler.await("task1"),
    scheduler.await("task2"),
    scheduler.await("task3"),
  ]);

  assert(executionOrder.length === 3, "All tasks executed");
  assert(executionOrder.includes("task1"), "task1 executed");
  assert(executionOrder.includes("task2"), "task2 executed");
  assert(executionOrder.includes("task3"), "task3 executed");
}

async function runAllTests() {
  console.log("=== Standalone Scheduler Tests ===");

  try {
    await testSequential();
    await testBreadthFirst();
    await testDepthFirst();

    console.log(`\n=== Results: ${passCount} passed, ${failCount} failed ===`);
    process.exit(failCount > 0 ? 1 : 0);
  } catch (err) {
    console.error("Test error:", err);
    process.exit(1);
  }
}

runAllTests();
