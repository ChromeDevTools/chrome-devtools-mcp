// LCP Trail
// Tracks all LCP candidate elements during page load
// https://webperf-snippets.nucliweb.net

(() => {
  const PALETTE = [
    { color: "#EF4444", name: "Red" },
    { color: "#F97316", name: "Orange" },
    { color: "#22C55E", name: "Green" },
    { color: "#3B82F6", name: "Blue" },
    { color: "#A855F7", name: "Purple" },
    { color: "#EC4899", name: "Pink" },
  ];

  const valueToRating = (ms) =>
    ms <= 2500 ? "good" : ms <= 4000 ? "needs-improvement" : "poor";

  const RATING = {
    good: { icon: "🟢", color: "#0CCE6A" },
    "needs-improvement": { icon: "🟡", color: "#FFA400" },
    poor: { icon: "🔴", color: "#FF4E42" },
  };

  const getActivationStart = () => {
    const navEntry = performance.getEntriesByType("navigation")[0];
    return navEntry?.activationStart || 0;
  };

  const getSelector = (element) => {
    if (element.id) return `#${element.id}`;
    if (element.className && typeof element.className === "string") {
      const classes = element.className.trim().split(/\s+/).slice(0, 2).join(".");
      if (classes) return `${element.tagName.toLowerCase()}.${classes}`;
    }
    return element.tagName.toLowerCase();
  };

  const getElementInfo = (element, entry) => {
    const tag = element.tagName.toLowerCase();
    if (tag === "img") return { type: "Image", url: entry.url || element.src };
    if (tag === "video") return { type: "Video poster", url: entry.url || element.poster };
    if (element.style?.backgroundImage) return { type: "Background image", url: entry.url };
    return { type: tag === "h1" || tag === "p" ? "Text block" : tag };
  };

  const candidates = [];

  const logTrail = () => {
    const current = candidates[candidates.length - 1];
    if (!current) return;

    const rating = valueToRating(current.time);
    const { icon, color: ratingColor } = RATING[rating];

    console.group(
      `%cLCP: ${icon} ${(current.time / 1000).toFixed(2)}s (${rating})`,
      `color: ${ratingColor}; font-weight: bold; font-size: 14px;`
    );

    // Current LCP element attribution
    console.log("");
    console.log("%cLCP Element:", "font-weight: bold;");
    console.log(`   Element: ${current.selector}`, current.element);

    const { type, url } = getElementInfo(current.element, current.entry);
    console.log(`   Type: ${type}`);
    if (url) console.log(`   URL: ${url}`);
    if (current.element.naturalWidth) {
      console.log(
        `   Dimensions: ${current.element.naturalWidth}×${current.element.naturalHeight}`
      );
    }
    if (current.entry.size) {
      console.log(`   Size: ${current.entry.size.toLocaleString()} px²`);
    }

    // Trail legend
    console.log("");
    console.log("%cCandidates Trail:", "font-weight: bold;");
    candidates.forEach(({ index, selector, color, name, time, element }) => {
      const isCurrent = index === candidates.length;
      console.log(
        `%c  ● ${index}. ${selector}`,
        `color: ${color}; font-weight: ${isCurrent ? "bold" : "normal"};`,
        `| ${(time / 1000).toFixed(2)}s — ${name}${isCurrent ? " ← LCP" : ""}`,
        element
      );
    });

    console.log("");
    console.log(
      "%c✓ Each candidate highlighted with a colored dashed outline",
      "color: #22c55e;"
    );
    console.groupEnd();
  };

  const observer = new PerformanceObserver((list) => {
    const activationStart = getActivationStart();
    const seen = new Set(candidates.map((c) => c.element));

    for (const entry of list.getEntries()) {
      const { element } = entry;
      if (!element || seen.has(element)) continue;

      const { color, name } = PALETTE[candidates.length % PALETTE.length];

      element.style.outline = `3px dashed ${color}`;
      element.style.outlineOffset = "2px";

      candidates.push({
        index: candidates.length + 1,
        element,
        selector: getSelector(element),
        color,
        name,
        time: Math.max(0, entry.startTime - activationStart),
        entry,
      });

      seen.add(element);
    }

    logTrail();
  });

  observer.observe({ type: "largest-contentful-paint", buffered: true });

  console.log("%c⏱️ LCP Trail Active", "font-weight: bold; font-size: 14px;");
  console.log("   Highlights all LCP candidate elements with distinct colors.");

  // Synchronous return for agent (buffered entries)
  const trailEntries = performance.getEntriesByType("largest-contentful-paint");
  if (trailEntries.length === 0) {
    return { script: "LCP-Trail", status: "error", error: "No LCP entries yet" };
  }
  const trailActivationStart = getActivationStart();
  const seenEls = new Set();
  const syncCandidates = [];
  for (const entry of trailEntries) {
    const el = entry.element;
    if (!el || seenEls.has(el)) continue;
    seenEls.add(el);
    const selector = getSelector(el);
    const time = Math.round(Math.max(0, entry.startTime - trailActivationStart));
    const { type, url } = getElementInfo(el, entry);
    syncCandidates.push({
      index: syncCandidates.length + 1,
      selector,
      time,
      elementType: type,
      ...(url ? { url: url.split("/").pop()?.split("?")[0] || url } : {}),
    });
  }
  if (syncCandidates.length === 0) {
    return { script: "LCP-Trail", status: "error", error: "No LCP elements in DOM" };
  }
  const lastCandidate = syncCandidates.at(-1);
  const trailValue = lastCandidate.time;
  const trailRating = valueToRating(trailValue);
  return {
    script: "LCP-Trail",
    status: "ok",
    metric: "LCP",
    value: trailValue,
    unit: "ms",
    rating: trailRating,
    thresholds: { good: 2500, needsImprovement: 4000 },
    details: {
      candidateCount: syncCandidates.length,
      finalElement: lastCandidate.selector,
      candidates: syncCandidates,
    },
  };
})();
