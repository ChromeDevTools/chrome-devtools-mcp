# Implementation Plan: Chrome DevTools CLI Optimizations

To sustainably improve agent efficiency (tokens/time/accuracy), we will implement the following optimizations in the `chrome-devtools` CLI. These changes focus on reducing the volume of DOM data transmitted to the LLM by performing the heavy lifting of filtering and diffing on the local machine.

## 1. Native Semantic Filtering
**Objective**: Enable agents to request only specific types of elements from the accessibility tree.
*   **Flags**: `--role <role>`, `--name <pattern>`, `--text <pattern>`
*   **Proposed Logic**:
    1.  Call CDP `Accessibility.getFullAXTree`.
    2.  Traverse the tree nodes and apply filters based on the provided flags.
    3.  Only serialize and return nodes that match (e.g., return all `button` roles).
*   **Impact**: Enables "targeted extraction" natively, eliminating the need for complex `grep` pipes and reducing context usage by up to 95% for specific lookup tasks.

## 2. Built-in "Interactive Only" Mode
**Objective**: Automatically strip non-actionable "noise" from snapshots to provide a high-signal view of the page.
*   **Flag**: `--interactive` (or `-i`)
*   **Proposed Logic**:
    1.  Filter the accessibility tree to include only "interactive" roles:
        *   `button`, `link`, `menuitem`, `checkbox`, `radio`, `textbox`, `searchbox`, `combobox`.
    2.  Always include nodes with explicit `aria-label` or those with event listeners (detected via `DOMDebugger.getEventListeners`).
    3.  Prune empty `generic` or `layoutTable` containers that do not house interactive children.
*   **Impact**: Provides the model with exactly what it needs to "act" without the clutter of layout divs, typically reducing snapshot sizes by 70-80%.

## 3. Session-Based Snapshot Diffs
**Objective**: Track the agent's "current knowledge" and only send what has changed since the last observation.
*   **Flag**: `take_snapshot --diff`
*   **Proposed Logic**:
    1.  The `chrome-devtools` server maintains a **session-level cache** of the last accessibility tree successfully sent to the agent, keyed by `pageId`.
    2.  When `take_snapshot --diff` is called:
        *   Capture the current live accessibility tree.
        *   Compare it against the cached "last seen" tree for the current page.
        *   Generate a semantic diff showing:
            *   **[ADDED]**: New elements/UIDs that appeared (e.g., a success message).
            *   **[REMOVED]**: UIDs that were in the previous snapshot but are now gone.
            *   **[CHANGED]**: Elements with updated text, values, or states (e.g., `expanded: true`).
        *   Update the session cache with the new tree.
    3.  **Automatic Flush**: The cache for a `pageId` is automatically **flushed (reset)** whenever a navigation event occurs (e.g., `navigate_page`, `new_page`, or a detected page reload). The first `take_snapshot` after a flush returns the full snapshot.
*   **Impact**: Minimizes redundant data transfer in multi-turn tasks. Instead of the LLM processing the same 50 elements every turn, it only sees the specific delta resulting from its last action.
