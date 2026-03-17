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

Quick check for Cumulative Layout Shift, a Core Web Vital that measures visual stability. CLS tracks how much the page layout shifts unexpectedly during its lifetime, providing a single score that represents the cumulative impact of all unexpected layout shifts.

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

Tracks Interaction to Next Paint, a Core Web Vital that measures responsiveness. INP evaluates how quickly a page responds to user interactions throughout the entire page visit, replacing First Input Delay (FID) as a Core Web Vital in March 2024.

**Script:** `scripts/INP.js`

**Usage:** Run `INP.js` once to start tracking. It returns `status: "tracking"` immediately. After the user interacts with the page, call `getINP()` to retrieve the current INP value.

**Thresholds:**

| Rating | Time | Meaning |
|--------|------|---------|
| 🟢 Good | ≤ 200ms | Responsive, feels instant |
| 🟡 Needs Improvement | ≤ 500ms | Noticeable delay |
| 🔴 Poor | > 500ms | Slow, frustrating experience |
---
## LCP Sub-Parts

Breaks down Largest Contentful Paint into its four phases to identify optimization opportunities. Understanding which phase is slowest helps focus optimization efforts where they'll have the most impact.

**Script:** `scripts/LCP-Sub-Parts.js`

**Sub-parts:**

| Phase | Target | Description |
|-------|--------|-------------|
| Time to First Byte (TTFB) | ≤ 800ms | Navigation start → first HTML byte |
| Resource Load Delay | < 10% of LCP | TTFB → browser starts loading LCP resource |
| Resource Load Time | ~40% of LCP | Time to download the LCP resource |
| Element Render Delay | < 10% of LCP | Resource downloaded → LCP element rendered |
---
## LCP Trail

Tracks every LCP candidate element during page load and highlights each one with a distinct colored dashed outline — so you can see the full trail from first candidate to final LCP.

**Script:** `scripts/LCP-Trail.js`

**Returns:** Array of all LCP candidates in order, with selector, time, element type, and URL (if applicable). The last entry is the final LCP element.
---
## LCP Image Entropy

Checks if images qualify as LCP candidates based on their entropy (bits per pixel). Since Chrome 112, low-entropy images are ignored for LCP measurement.

**Script:** `scripts/LCP-Image-Entropy.js`

**Thresholds:**

| BPP | Entropy | LCP Eligible | Example |
|-----|---------|--------------|---------|
| < 0.05 | 🔴 Low | ❌ No | Solid colors, simple gradients, placeholders |
| ≥ 0.05 | 🟢 Normal | ✅ Yes | Photos, complex graphics |
---
## LCP Video Candidate

Detects whether the LCP element is a `<video>` and audits the poster image configuration — the most common source of avoidable LCP delay when video is the hero element.

**Script:** `scripts/LCP-Video-Candidate.js`

**Checks:**
- Whether a `poster` attribute exists
- Whether the poster is preloaded with `<link rel="preload" as="image">`
- Whether `fetchpriority="high"` is set on the preload
- Whether the poster uses a modern format (AVIF, WebP)
- Whether cross-origin timing is obscured (`renderTime = 0`)
