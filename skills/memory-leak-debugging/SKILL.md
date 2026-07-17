---
name: memory-leak-debugging
description: Diagnoses and resolves memory leaks in JavaScript/Node.js applications. Use when a user reports high memory usage, OOM errors, or wants to analyze heap snapshots and identify retained objects.
---

# Memory Leak Debugging

This skill provides expert guidance and workflows for finding, diagnosing, and fixing memory leaks in JavaScript and Node.js applications.

## Core Principles

- **Prefer the built-in memory tools:** Use `take_heapsnapshot` to capture snapshots, then analyze them with `compare_heapsnapshots`, `get_heapsnapshot_summary`, `get_heapsnapshot_details`, `get_heapsnapshot_class_nodes`, `get_heapsnapshot_retainers`, `get_heapsnapshot_retaining_paths`, `get_heapsnapshot_dominators`, and `get_heapsnapshot_duplicate_strings`.
- **Do not read raw `.heapsnapshot` files directly:** They are large and can exceed context limits. Inspect them through the MCP tools instead.
- **Isolate the Leak:** Determine if the leak is in the browser (client-side) or Node.js (server-side).
- **Common Culprits:** Look for detached DOM nodes, unhandled closures, global variables, event listeners not being removed, and caches growing unbounded. _Note: Detached DOM nodes are sometimes intentional caches; always ask the user before nulling them._

## Workflows

### 1. Capturing Snapshots

When investigating a frontend web application memory leak, use the `chrome-devtools-mcp` tools to interact with the application and take snapshots.

- Use tools like `click`, `navigate_page`, `fill`, etc., to manipulate the page into the desired state.
- Revert the page back to the original state after interactions to see if memory is released.
- Repeat the same user interactions 10 times to amplify the leak.
- Use `take_heapsnapshot` to save `.heapsnapshot` files to disk at baseline, target (after actions), and final (after reverting actions) states.

### 2. Comparing Snapshots with Built-in Tools

Once you have generated `.heapsnapshot` files using `take_heapsnapshot`, analyze them with the built-in heap snapshot tools.

- Start with `compare_heapsnapshots` to get a high-level diff between the baseline and target snapshots.
- If a class is suspicious, run `compare_heapsnapshots` again with `classIndex` to inspect the individual objects that grew.
- Use `get_heapsnapshot_summary` and `get_heapsnapshot_details` to inspect the snapshot structure and find the classes or objects that are growing.
- Use `get_heapsnapshot_class_nodes` together with `get_heapsnapshot_retainers` to find the objects that are still alive and the chain of references keeping them around.
- Use `get_heapsnapshot_retaining_paths` and `get_heapsnapshot_dominators` to understand why a node is not being garbage collected.
- Use `get_heapsnapshot_duplicate_strings` if duplicate string values are suspected to be contributing to memory growth.

### 3. Identifying Common Leaks

When you have found a suspicious object or retaining path, you must identify the root cause in the code.

- Read [references/common-leaks.md](references/common-leaks.md) for examples of common memory leaks and how to fix them.

### 4. Fallback: Comparing Snapshots Manually

If the memory debugging tools are not available in the current environment, use the fallback script in the references directory to compare two `.heapsnapshot` files and identify the top growing objects and common leak types.

Run the script using Node.js:

```bash
node skills/memory-leak-debugging/references/compare_snapshots.js <baseline.heapsnapshot> <target.heapsnapshot>
```

The script will analyze and output the top growing objects by size and highlight the 3 most common types of memory leaks (e.g., Detached DOM nodes, closures, Contexts) if they are present.
