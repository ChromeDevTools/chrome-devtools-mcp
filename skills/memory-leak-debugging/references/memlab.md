# Using Memlab

[Memlab](https://facebook.github.io/memlab/) is an E2E testing and analysis framework for finding JavaScript memory leaks.

## Important Rule

**NEVER read raw `.heapsnapshot` files directly.** They are too large and will exceed context limits. Always use `memlab` commands to analyze them.

## Analyzing Snapshots

You can use the `take_memory_snapshot` tool provided by the `chrome-devtools-mcp` extension to generate heap snapshots during an investigation. To find leaks, you generally need 3 snapshots:

1.  **Baseline:** Before the suspect action.
2.  **Target:** After the suspect action.
3.  **Final:** After reverting the suspect action (e.g., closing a modal, navigating away).

Once you have these 3 snapshots saved to disk, you can use `memlab` to find leaks:

```bash
npx memlab find-leaks --baseline <path-to-baseline> --target <path-to-target> --final <path-to-final>
```

You can also parse a single snapshot to find the largest objects or explore it individually:

```bash
npx memlab analyze snapshot --snapshot <path-to-snapshot>
```

Memlab will output the retainer traces for identified leaks. Use these traces to guide your search in the codebase.
