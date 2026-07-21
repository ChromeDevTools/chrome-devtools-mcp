---
## Largest Contentful Paint (LCP)

Quick check for Largest Contentful Paint, a Core Web Vital that measures loading performance. LCP marks when the largest content element becomes visible in the viewport.

**Script:** `scripts/LCP.js`

**Thresholds:**

| Rating | Time | Meaning |
|--------|------|---------|
| 🟢 Good | ≤ 2.5s | Fast, content appears quickly |
| 🟡 Needs Improvement | ≤ 4s | Moderate delay |
| 🔴 Poor | > 4s | Slow, users may abandon |
---
## Cumulative Layout Shift (CLS)

Quick check for Cumulative Layout Shift, a Core Web Vital that measures visual stability. CLS tracks how much the page layout shifts unexpectedly during its lifetime, providing a single score that represents the worst batch impact of all unexpected layout shifts.

**Script:** `scripts/CLS.js`

**Usage:** Run `CLS.js` once on page load. It returns the current score immediately and keeps tracking. Call `getCLS()` later to get an updated value after further page interactions.

**Thresholds:**

| Rating | Score | Meaning |
|--------|-------|---------|
| 🟢 Good | ≤ 0.1 | Stable, minimal shifting |
| 🟡 Needs Improvement | ≤ 0.25 | Noticeable shifting |
| 🔴 Poor | > 0.25 | Significant layout instability |
---
## Interaction to Next Paint (INP)

Tracks Interaction to Next Paint, a Core Web Vital that measures responsiveness. INP evaluates how quickly a page responds to user interactions throughout the entire page visit.

**Script:** `scripts/INP.js`

**Usage:** Run `INP.js` once to start measuring. It returns `status: "measuring"` immediately. After the user interacts with the page, call `getINP()` to retrieve the current INP value.

**Thresholds:**

| Rating | Time | Meaning |
|--------|------|---------|
| 🟢 Good | ≤ 200ms | Responsive, feels responsive |
| 🟡 Needs Improvement | ≤ 500ms | Noticeable delay |
| 🔴 Poor | > 500ms | Slow, frustrating experience |
---
## LCP Subparts

Breaks down Largest Contentful Paint into its four phases to identify optimization opportunities. Understanding which phase is slowest helps focus optimization efforts where they'll have the most impact.

**Script:** `scripts/LCP-Subparts.js`

**Subparts:**

| Phase | Target | Description |
|-------|--------|-------------|
| Time to First Byte (TTFB) | ≤ 800ms | Navigation start → first HTML byte |
| Resource Load Delay | < 10% of LCP | TTFB → browser starts loading LCP resource |
| Resource Load Duration | ~40% of LCP | Time spent waiting for the downloading of the LCP resource |
| Element Render Delay | < 10% of LCP | Resource downloaded → LCP element rendered |
---
## LCP Trail

Tracks every LCP candidate element during page load and highlights each one with a distinct colored dashed outline — so you can see the full trail from first candidate to final LCP.

**Script:** `scripts/LCP-Trail.js`

**Returns:** Array of all LCP candidates in order, with selector, time, element type, and URL (if applicable). The last entry is the final LCP element.
---
## LCP Video Candidate

Detects whether the LCP element is a `<video>` and audits the configuration. Chrome considers both the poster image and the first frame of the video as LCP candidates.

**Script:** `scripts/LCP-Video-Candidate.js`

**Checks:**
- Whether the LCP source is the poster image or the first video frame (`lcpSource`)
- Whether a `poster` attribute exists (recommended for explicit control)
- Whether the poster is preloaded with `<link rel="preload" as="image">`
- Whether `fetchpriority="high"` is set on the preload
- Whether the poster uses a modern format (AVIF, WebP)
- Whether cross-origin timing is obscured (`renderTime = 0`)
