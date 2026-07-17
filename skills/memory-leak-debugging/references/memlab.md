# Using the Built-in Heap Snapshot Tools

The `chrome-devtools-mcp` memory tools provide everything needed to investigate heap growth without relying on external memlab workflows.

## Important Rule

**NEVER read raw `.heapsnapshot` files directly.** They are too large and will exceed context limits. Inspect them through the built-in MCP tools instead.

## Recommended Workflow

You can use the `take_heapsnapshot` tool to generate heap snapshots during an investigation. To find leaks, you generally need 3 snapshots:

1. **Baseline:** Before the suspect action.
2. **Target:** After the suspect action.
3. **Final:** After reverting the suspect action (e.g., closing a modal, navigating away).

Once you have these 3 snapshots saved to disk, analyze them with:

- `compare_heapsnapshots` for a high-level growth diff.
- `get_heapsnapshot_summary` and `get_heapsnapshot_details` for aggregate statistics.
- `get_heapsnapshot_class_nodes` and `get_heapsnapshot_retainers` to inspect individual objects and the references keeping them alive.
- `get_heapsnapshot_retaining_paths` and `get_heapsnapshot_dominators` for the strongest evidence of why an object is retained.
- `get_heapsnapshot_duplicate_strings` if duplicate string data is a suspect.

If the MCP memory tools are unavailable, use the fallback script in the references directory to compare two `.heapsnapshot` files and identify the top growing objects.
