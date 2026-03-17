(() => {
  const valueToRating = (ms) =>
    ms <= 2500 ? "good" : ms <= 4000 ? "needs-improvement" : "poor";

  const getActivationStart = () => {
    const navEntry = performance.getEntriesByType("navigation")[0];
    return navEntry?.activationStart || 0;
  };

  // Highlight LCP element as candidates update
  const observer = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const lastEntry = entries[entries.length - 1];
    if (!lastEntry) return;
    const element = lastEntry.element;
    if (element) {
      element.style.outline = "3px dashed lime";
      element.style.outlineOffset = "2px";
    }
  });

  observer.observe({ type: "largest-contentful-paint", buffered: true });

  // Synchronous return for agent (buffered entries)
  const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
  const lastLcpEntry = lcpEntries.at(-1);
  if (!lastLcpEntry) {
    return { script: "LCP", status: "error", error: "No LCP entries yet" };
  }

  const activationStart = getActivationStart();
  const value = Math.round(Math.max(0, lastLcpEntry.startTime - activationStart));
  const el = lastLcpEntry.element;
  let selector = null;
  let elementType = null;

  if (el) {
    selector = el.tagName.toLowerCase();
    if (el.id) selector = `#${el.id}`;
    else if (el.className && typeof el.className === "string") {
      const classes = el.className.trim().split(/\s+/).slice(0, 2).join(".");
      if (classes) selector = `${el.tagName.toLowerCase()}.${classes}`;
    }
    const tag = el.tagName.toLowerCase();
    elementType =
      tag === "img" ? "Image" :
      tag === "video" ? "Video poster" :
      el.style?.backgroundImage ? "Background image" :
      (tag === "h1" || tag === "p" ? "Text block" : tag);

    el.style.outline = "3px dashed lime";
    el.style.outlineOffset = "2px";
  }

  return {
    script: "LCP",
    status: "ok",
    metric: "LCP",
    value,
    unit: "ms",
    rating: valueToRating(value),
    thresholds: { good: 2500, needsImprovement: 4000 },
    details: {
      element: selector,
      elementType,
      url: lastLcpEntry.url || null,
      sizePixels: lastLcpEntry.size || null,
    },
  };
})();
