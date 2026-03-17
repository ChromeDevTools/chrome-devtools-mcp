(() => {
  const PALETTE = [
    { color: "#EF4444" },
    { color: "#F97316" },
    { color: "#22C55E" },
    { color: "#3B82F6" },
    { color: "#A855F7" },
    { color: "#EC4899" },
  ];

  const valueToRating = (ms) =>
    ms <= 2500 ? "good" : ms <= 4000 ? "needs-improvement" : "poor";

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

  // Highlight each LCP candidate with a distinct color as they appear
  const seen = new Set();
  let colorIndex = 0;

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const { element } = entry;
      if (!element || seen.has(element)) continue;
      const { color } = PALETTE[colorIndex % PALETTE.length];
      element.style.outline = `3px dashed ${color}`;
      element.style.outlineOffset = "2px";
      seen.add(element);
      colorIndex++;
    }
  });

  observer.observe({ type: "largest-contentful-paint", buffered: true });

  // Synchronous return for agent (buffered entries)
  const trailEntries = performance.getEntriesByType("largest-contentful-paint");
  if (trailEntries.length === 0) {
    return { script: "LCP-Trail", status: "error", error: "No LCP entries yet" };
  }

  const activationStart = getActivationStart();
  const seenEls = new Set();
  const candidates = [];

  for (const entry of trailEntries) {
    const el = entry.element;
    if (!el || seenEls.has(el)) continue;
    seenEls.add(el);
    const { type, url } = getElementInfo(el, entry);
    candidates.push({
      index: candidates.length + 1,
      selector: getSelector(el),
      time: Math.round(Math.max(0, entry.startTime - activationStart)),
      elementType: type,
      ...(url ? { url: url.split("/").pop()?.split("?")[0] || url } : {}),
    });
  }

  if (candidates.length === 0) {
    return { script: "LCP-Trail", status: "error", error: "No LCP elements in DOM" };
  }

  const last = candidates.at(-1);
  return {
    script: "LCP-Trail",
    status: "ok",
    metric: "LCP",
    value: last.time,
    unit: "ms",
    rating: valueToRating(last.time),
    thresholds: { good: 2500, needsImprovement: 4000 },
    details: {
      candidateCount: candidates.length,
      finalElement: last.selector,
      candidates,
    },
  };
})();
