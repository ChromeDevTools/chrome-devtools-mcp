---
name: webperf-core-web-vitals
description: Intelligent Core Web Vitals analysis with automated workflows and decision trees. Measures LCP, CLS, INP with guided debugging that automatically determines follow-up analysis based on results. Includes workflows for LCP deep dive (5 phases), CLS investigation (loading vs interaction), INP debugging (latency breakdown + attribution), and cross-skill integration with loading, interaction, and media skills. Use when the user asks about Core Web Vitals, LCP optimization, layout shifts, or interaction responsiveness.
context: fork
---

# WebPerf: Core Web Vitals

JavaScript snippets for measuring web performance in Chrome DevTools. Execute with `evaluate_script`, capture output with `get_console_message`.

## Scripts

- `scripts/CLS.js` — Cumulative Layout Shift (CLS)
- `scripts/INP.js` — Interaction to Next Paint (INP)
- `scripts/LCP-Sub-Parts.js` — LCP Sub-Parts
- `scripts/LCP-Trail.js` — LCP Trail
- `scripts/LCP-Video-Candidate.js` — LCP Video Candidate
- `scripts/LCP.js` — Largest Contentful Paint (LCP)

Descriptions, thresholds, and return schemas: `references/snippets.md`, `references/schema.md`

## Script Execution Patterns

Scripts fall into two execution patterns:

### Synchronous (LCP, CLS, LCP-Sub-Parts, LCP-Trail, LCP-Video-Candidate)

Run via `evaluate_script` and return structured JSON immediately from buffered performance data. The page must have already loaded.

### Measuring (INP)

INP requires real user interactions to measure. The workflow is:

1. Run `INP.js` via `evaluate_script` → returns `{ status: "measuring", getDataFn: "getINP" }`
2. **Tell the user:** "INP measuring is now active. Please interact with the page — click buttons, open menus, fill form fields — then let me know when you're done."
3. Wait for the user to confirm they've interacted.
4. Call `evaluate_script("getINP()")` to collect results.
5. If `getINP()` returns `status: "error"` → the user has not interacted yet. Remind them and wait.
6. For a full breakdown of all interactions, call `evaluate_script("getINPDetails()")` — returns all recorded interactions sorted by duration.

> The agent cannot interact with the page on behalf of the user for INP measurement. Real user interactions are required.

## Common Workflows

### Complete Core Web Vitals Audit

When the user asks for a comprehensive Core Web Vitals analysis or "audit CWV":

1. **LCP.js** - Measure Largest Contentful Paint
2. **CLS.js** - Measure Cumulative Layout Shift
3. **INP.js** - Measure Interaction to Next Paint
4. **LCP-Subparts.js** - Break down LCP timing phases
5. **LCP-Trail.js** - Track LCP candidate evolution

### LCP Deep Dive

When LCP is slow or the user asks "debug LCP" or "why is LCP slow":

1. **LCP.js** - Establish baseline LCP value
2. **LCP-Subparts.js** - Break down into TTFB, resource load, render delay
3. **LCP-Trail.js** - Identify all LCP candidates and changes
4. **LCP-Video-Candidate.js** - Detect if LCP is a video (poster or first frame)

### CLS Investigation

When layout shifts are detected or the user asks "debug CLS" or "layout shift issues":

1. **CLS.js** - Measure overall CLS score
2. Call `getCLS()` after page interactions to capture post-load shifts

### INP Debugging

When interactions feel slow or the user asks "debug INP" or "slow interactions":

1. **INP.js** - Start measuring. Tell the user to interact with the page and confirm when done.
2. Call `getINP()` to collect results once the user confirms.
3. Call `getINPDetails()` to see all interactions ranked by duration.

### Video as LCP Investigation

When LCP is a video element (detected by LCP-Video-Candidate.js):

1. **LCP-Video-Candidate.js** - Identify video as LCP candidate, detect `lcpSource` (poster or first frame)
2. **LCP-Subparts.js** - Analyze video loading phases

### Image as LCP Investigation

When LCP is an image (most common case):

1. **LCP.js** - Measure LCP timing
2. **LCP-Subparts.js** - Break down timing phases
3. **LCP-Trail.js** - Track all LCP candidates to confirm final element

## Decision Tree

Use this decision tree to automatically run follow-up snippets based on results:

### After LCP.js

- **If LCP > 2.5s** → Run **LCP-Sub-Parts.js** to diagnose which phase is slow
- **If LCP > 4.0s (poor)** → Run full LCP deep dive workflow
- **If LCP candidate is a video** → Run **LCP-Video-Candidate.js**
- **Always run** → **LCP-Trail.js** to understand candidate evolution

### After LCP-Subparts.js

- **If TTFB phase > 600ms** → Investigate server response time and redirects
- **If Resource Load Time > 1500ms** → Check preload hints and fetch priority for the LCP resource
- **If Render Delay > 200ms** → Investigate render-blocking resources and main thread work

### After LCP-Trail.js

- **If many LCP candidate changes (>3)** → Visual instability; run **CLS.js** to check layout shifts
- **If final LCP candidate appears late** → Investigate resource preloading for the LCP element
- **If early candidate was replaced** → Likely a CLS issue; run **CLS.js**

### After LCP-Video-Candidate.js

- **If `lcpSource === "poster"`** → Check poster preload and `fetchpriority="high"`; run **LCP-Subparts.js**
- **If `lcpSource === "first-frame"`** → Ensure `autoplay` + `muted` + `playsinline` are set; adding a poster gives explicit control
- **If `lcpSource === "unknown"`** → No poster URL or video URL detectable; run **LCP-Subparts.js** for timing breakdown

### After CLS.js

- **If CLS > 0.1** → Check `sources` in the result for the shifting elements; inspect for missing `width`/`height` attributes, late-loading fonts, or dynamic content insertion
- **If CLS > 0.25 (poor)** → Call `getCLS()` after interactions to confirm the score accumulates over time
- **If CLS = 0** → Confirm with multiple page loads (might be timing-dependent)

### After INP.js

- **If INP > 200ms** → Call `getINPDetails()` to list all interactions ranked by duration and identify the slowest one
- **If INP > 500ms (poor)** → Check `phases` in the worst interaction: high `inputDelay` suggests main thread blocking; high `processingDuration` suggests heavy event handler work
- **If specific interaction type is slow (e.g., keyboard)** → Focus `getINPDetails()` on that interaction type

## Error Recovery

When a script returns `status: "error"`:

- **LCP/CLS/LCP-Sub-Parts/LCP-Trail** → The page may not have finished loading. Ask the user to wait for full load or reload, then re-run the script.
- **INP** (`getINP()` returns error) → No interactions have been recorded yet. Remind the user to interact with the page, then call `getINP()` again.
- **LCP-Video-Candidate** → No LCP entries found; see LCP error recovery above.

## Visual Highlighting

By default, scripts highlight the LCP element(s) with colored dashed outlines — useful when the user is watching the browser while the agent runs. To disable:

```js
window.__cwvHighlight = false;
// then run any LCP script
```

Scripts that support this flag: `LCP.js`, `LCP-Sub-Parts.js`, `LCP-Trail.js`.
