---
name: memory-leak-debugging
description: Diagnoses and resolves memory leaks in JavaScript/Node.js applications. Use when a user reports high memory usage, OOM errors, or wants to analyze heapsnapshots or run memory leak detection tools like memlab.
---

# Memory Leak Debugging

This skill provides expert guidance and workflows for finding, diagnosing, and fixing memory leaks in JavaScript and Node.js applications.

## Core Principles

- **Prefer `memlab`:** Do NOT attempt to read raw `.heapsnapshot` files directly, as they are extremely large and will consume too many tokens. Always recommend and use `memlab` to process snapshots and identify leak traces.
- **Isolate the Leak:** Determine if the leak is in the browser (client-side) or Node.js (server-side).
- **Common Culprits:** Look for detached DOM nodes, unhandled closures, global variables, event listeners not being removed, and caches growing unbounded.

## Workflows

### 1. Using Memlab (Recommended)

When users provide `.heapsnapshot` files or want to find a memory leak, use `memlab` to automatically find memory leaks.

- Read [references/memlab.md](references/memlab.md) for how to use `memlab` to analyze existing heapsnapshots or run automated E2E test scenarios to find leaks.
- Do **not** read raw `.heapsnapshot` files using `read_file` or `cat`.

### 2. Identifying Common Leaks

When you have found a leak trace (e.g., via `memlab` output), you must identify the root cause in the code.

- Read [references/common-leaks.md](references/common-leaks.md) for examples of common memory leaks and how to fix them.

### 3. Creating Memlab Scenarios

To help users reproduce and test for leaks automatically, you can create a Memlab scenario file.

- An example template is available at `scripts/memlab-scenario.js`.
