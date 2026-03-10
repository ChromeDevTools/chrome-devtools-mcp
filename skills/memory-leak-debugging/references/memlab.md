# Using Memlab

[Memlab](https://facebook.github.io/memlab/) is an E2E testing and analysis framework for finding JavaScript memory leaks.

## Important Rule

**NEVER read raw `.heapsnapshot` files directly.** They are too large and will exceed context limits. Use `memlab` commands to analyze them instead.

## Analyzing Existing Snapshots

If the user provides 3 snapshots (baseline, target, final), you can use `memlab` to find leaks:

```bash
npx memlab find-leaks --baseline <path-to-baseline> --target <path-to-target> --final <path-to-final>
```

You can also parse a single snapshot to find the largest objects:

```bash
npx memlab analyze snapshot --snapshot <path-to-snapshot>
```

## Running Automated Scenarios

Memlab can automatically open a browser, interact with a page, take snapshots, and find leaks.
You need a scenario file (e.g., `scenario.js`).

```bash
npx memlab run --scenario <path-to-scenario.js>
```

Memlab will output the retainer traces for identified leaks. Use these traces to guide your search in the codebase.
