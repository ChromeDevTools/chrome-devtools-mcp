---
name: memory-leak-debugging
description: Diagnoses and resolves memory leaks in JavaScript/Node.js applications. Use when a user reports high memory usage, OOM errors, or wants to analyze heapsnapshots or run memory leak detection tools like memlab.
---

# Memory Leak Debugging

This skill provides expert guidance and workflows for finding, diagnosing, and fixing memory leaks in JavaScript and Node.js applications.

## Core Principles

- **Prefer `memlab`:** Do NOT attempt to read raw `.heapsnapshot` files directly, as they are extremely large and will consume too many tokens. Always recommend and use `memlab` to process snapshots and identify leak traces.
- **Isolate the Leak:** Determine if the leak is in the browser (client-side) or Node.js (server-side).
- **Common Culprits:** Look for detached DOM nodes, unhandled closures, global variables, event listeners not being removed, and caches growing unbounded. _Note: Detached DOM nodes are sometimes intentional caches; always ask the user before nulling them._

## Workflows

### 1. Capturing Snapshots

When investigating a frontend web application memory leak, utilize the `chrome-devtools-mcp` tools to interact with the application and take snapshots.

- Use tools like `click`, `navigate_page`, `fill`, etc., to manipulate the page into the desired state.
- Revert the page back to the original state after interactions to see if memory is released.
- Repeat the same user interactions 10 times to amplify the leak.
- Use `take_memory_snapshot` to save `.heapsnapshot` files to disk at baseline, target (after actions), and final (after reverting actions) states.

### 2. Using Memlab to Find Leaks (Recommended)

Once you have generated `.heapsnapshot` files using `take_memory_snapshot`, use `memlab` to automatically find memory leaks.

- Read [references/memlab.md](references/memlab.md) for how to use `memlab` to analyze the generated heapsnapshots.
- Do **not** read raw `.heapsnapshot` files using `read_file` or `cat`.

### 3. Identifying Common Leaks

When you have found a leak trace (e.g., via `memlab` output), you must identify the root cause in the code.

- Read [references/common-leaks.md](references/common-leaks.md) for examples of common memory leaks and how to fix them.

### 4. Fallback: Comparing Snapshots Manually

If `memlab` is not available, you MUST use the fallback script in the references directory to compare two `.heapsnapshot` files and identify the top growing objects and common leak types.

Run the script using Node.js:

```bash
node compare_snapshots.js <baseline.heapsnapshot> <target.heapsnapshot>
```

The script will analyze and output the top growing objects by size and highlight the 3 most common types of memory leaks (e.g., Detached DOM nodes, closures, Contexts) if they are present.
