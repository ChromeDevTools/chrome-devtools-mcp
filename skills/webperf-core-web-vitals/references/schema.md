# Script Return Value Schema

All scripts return a structured JSON object as the return value. This allows agents using `evaluate_script` to read structured data directly from the return value, rather than parsing human-readable console output.

## Base Shape

```typescript
{
  script: string;        // Script name, e.g. "LCP", "CLS", "INP"
  status: "ok"           // Script ran, has data
       | "monitoring"      // Observer active, data accumulates over time
       | "error"         // Failed or no data available
       | "unsupported";  // Browser API not supported

  // Metric scripts (LCP, CLS, INP)
  metric?: string;
  value?: number;        // Always a number, never a formatted string
  unit?: "ms" | "score" | "count" | "bytes" | "bpp" | "fps";
  rating?: "good" | "needs-improvement" | "poor";
  thresholds?: { good: number; needsImprovement: number };

  // Audit scripts
  count?: number;
  items?: object[];
  details?: object;
  issues?: Array<{ severity: "error" | "warning" | "info"; message: string }>;

  // Measurement scripts
  message?: string;
  getDataFn?: string;    // window function name: evaluate_script(`${getDataFn}()`)

  // Error info
  error?: string;
}
```

## Agent Workflow

```
// Synchronous scripts (LCP, CLS, LCP-Subparts, LCP-Trail, LCP-Video-Candidate)
result = evaluate_script(scriptCode)
// → { status: "ok", value: 1240, rating: "good", ... }

// Measurement scripts (INP)
result = evaluate_script(INP_js)
// → { status: "measuring", getDataFn: "getINP" }
// (user interacts with the page)
data = evaluate_script("getINP()")
// → { status: "ok", value: 350, rating: "needs-improvement", ... }

// CLS (hybrid: returns current value immediately, keeps measuring)
result = evaluate_script(CLS_js)
// → { status: "ok", value: 0.05, rating: "good", message: "Call getCLS() for updated value" }
// (after more page interactions)
data = evaluate_script("getCLS()")
// → { status: "ok", value: 0.08, rating: "good", ... }
```

## Making Decisions from Return Values

- `rating === "good"` → metric meets recommended thresholds
- `rating === "needs-improvement"` → investigate, check `details` and `issues`
- `rating === "poor"` → high priority fix, check `issues` for specific problems
- `status === "error"` → page may not have loaded yet, or metric has no data
- `status === "measuring"` → call `evaluate_script(result.getDataFn + "()")` after interaction

## Script-Specific Schemas

### LCP
```json
{
  "script": "LCP", "status": "ok", "metric": "LCP",
  "value": 1240, "unit": "ms", "rating": "good",
  "thresholds": { "good": 2500, "needsImprovement": 4000 },
  "details": { "element": "img.hero", "elementType": "Image", "url": "hero.jpg", "sizePixels": 756000 }
}
```

### CLS
```json
{
  "script": "CLS", "status": "ok", "metric": "CLS",
  "value": 0.05, "unit": "score", "rating": "good",
  "thresholds": { "good": 0.1, "needsImprovement": 0.25 },
  "message": "CLS measurement active. Call getCLS() for updated value after page interactions."
}
```

### INP (initial — measuring)
```
`getINP()` returns (after interactions):
```json
{
  "script": "INP", "status": "ok", "metric": "INP",
  "value": 350, "unit": "ms", "rating": "needs-improvement",
  "thresholds": { "good": 200, "needsImprovement": 500 },
  "details": { "totalInteractions": 5, "worstEvent": "click → button.submit", "phases": { "inputDelay": 120, "processingTime": 180, "presentationDelay": 50 } }
}
```
`getINP()` returns (no interactions yet):
```json
{ "script": "INP", "status": "error", "error": "No interactions recorded yet. Interact with the page and call getINP() again.", "getDataFn": "getINP" }
```
`getINPDetails()` returns all recorded interactions sorted by duration (useful for INP deep-dive):
```json
[
  { "formattedName": "click → button.submit", "duration": 350, "startTime": 4210, "phases": { "inputDelay": 120, "processingTime": 180, "presentationDelay": 50 } },
  { "formattedName": "keydown → input#search", "duration": 180, "startTime": 8540, "phases": { "inputDelay": 20, "processingTime": 140, "presentationDelay": 20 } }
]
```

### LCP-Subparts
      "ttfb": { "value": 450, "percent": 21, "overTarget": false },
      "resourceLoadDelay": { "value": 120, "percent": 6, "overTarget": false },
      "resourceLoadTime": { "value": 1200, "percent": 57, "overTarget": true },
      "elementRenderDelay": { "value": 330, "percent": 16, "overTarget": true }
    },
    "slowestPhase": "resourceLoadTime"
  }
}
```

### LCP-Trail
```json
{
  "script": "LCP-Trail", "status": "ok", "metric": "LCP",
  "value": 1240, "unit": "ms", "rating": "good",
  "thresholds": { "good": 2500, "needsImprovement": 4000 },
  "details": {
    "candidateCount": 2, "finalElement": "img.hero",
    "candidates": [
      { "index": 1, "selector": "h1", "time": 800, "elementType": "Text block" },
      { "index": 2, "selector": "img.hero", "time": 1240, "elementType": "Image", "url": "hero.jpg" }
    ]
  }
}
```

### LCP-Video-Candidate
```json
{
  "script": "LCP-Video-Candidate", "status": "ok", "metric": "LCP",
  "value": 1800, "unit": "ms", "rating": "good",
  "thresholds": { "good": 2500, "needsImprovement": 4000 },
  "details": {
    "isVideo": true, "lcpSource": "poster",
    "posterUrl": "https://example.com/hero.avif", "posterFormat": "avif",
    "posterPreloaded": true, "fetchpriorityOnPreload": "high", "isCrossOrigin": false,
    "videoAttributes": { "autoplay": true, "muted": true, "playsinline": true, "preload": "auto" }
  },
  "issues": []
}
```
