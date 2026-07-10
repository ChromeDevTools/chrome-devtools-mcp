---
name: memory-leak-debugging
description: Diagnoses and resolves memory leaks in JavaScript/Node.js applications. Use when a user reports high memory usage, OOM errors, or wants to capture, compare, or inspect heap snapshots with Chrome DevTools MCP memory tools.
---

# Memory Leak Debugging

This skill provides expert guidance and workflows for finding, diagnosing, and fixing memory leaks in JavaScript and Node.js applications using Chrome DevTools MCP.

## Core Principles

- **Prefer MCP memory tools:** Do NOT attempt to read raw `.heapsnapshot` files directly, as they are extremely large and will consume too many tokens. Use the Chrome DevTools MCP heap snapshot tools to summarize, compare, and inspect snapshots.
- **Isolate the Leak:** Determine if the leak is in the browser (client-side) or Node.js (server-side).
- **Common Culprits:** Look for detached DOM nodes, unhandled closures, global variables, event listeners not being removed, and caches growing unbounded. _Note: Detached DOM nodes are sometimes intentional caches; always ask the user before nulling them._
- **Close Loaded Snapshots:** Heap snapshots can be large. After completing an investigation, use `close_heapsnapshot` for each loaded snapshot to release memory held by the MCP server.

## Workflows

### 1. Capturing Snapshots

When investigating a frontend web application memory leak, utilize the `chrome-devtools-mcp` tools to interact with the application and take snapshots.

- Use tools like `click`, `navigate_page`, `fill`, etc., to manipulate the page into the desired state.
- Revert the page back to the original state after interactions to see if memory is released.
- Repeat the same user interactions 10 times to amplify the leak.
- Use `take_heapsnapshot` to save `.heapsnapshot` files to disk at baseline, target (after actions), and final (after reverting actions) states.

### 2. Comparing Snapshots

Once you have generated `.heapsnapshot` files using `take_heapsnapshot`, compare them with Chrome DevTools MCP memory tools.

- Start with `get_heapsnapshot_summary` for each snapshot to confirm that the files load and to compare high-level totals.
- Use `compare_heapsnapshots` to compare baseline and target snapshots. Start without `classIndex` for the summary diff, then request detailed class diffs only for suspicious growth.
- Use the summary output from `compare_heapsnapshots` before drilling into specific node IDs.

### 3. Inspecting Retainers

When a class or object type grows unexpectedly, inspect the retaining chain with the MCP tools before changing code.

- Use `get_heapsnapshot_class_nodes` to list instances of the suspicious class.
- Use `get_heapsnapshot_retainers`, `get_heapsnapshot_retaining_paths`, `get_heapsnapshot_dominators`, and `get_heapsnapshot_edges` to understand why representative nodes are still reachable.
- Use `get_heapsnapshot_duplicate_strings` when string growth dominates the diff.
- Read [references/common-leaks.md](references/common-leaks.md) for examples of common memory leaks and how to fix them after the retaining path points at application code.

### 4. External Tool Fallback

If the built-in MCP memory tools are not enough, use external tools as a fallback rather than reading raw snapshots directly.

- Read [references/memlab.md](references/memlab.md) for how to use `memlab` to analyze generated heap snapshots.
- If `memlab` is not available, use the fallback script in the references directory to compare two `.heapsnapshot` files and identify the top growing objects and common leak types.

Run the fallback script using Node.js:

```bash
node skills/memory-leak-debugging/references/compare_snapshots.js <baseline.heapsnapshot> <target.heapsnapshot>
```

The script will analyze and output the top growing objects by size and highlight the 3 most common types of memory leaks (for example, detached DOM nodes, closures, and contexts) if they are present.
