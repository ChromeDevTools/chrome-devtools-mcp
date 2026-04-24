(() => {
  const HIGHLIGHT = window.__cwvHighlight !== false;

  const valueToRating = (ms) =>
    ms <= 2500 ? "good" : ms <= 4000 ? "needs-improvement" : "poor";

  const SUB_PARTS = [
    { name: "Time to First Byte", key: "ttfb", target: 800 },
    { name: "Resource Load Delay", key: "loadDelay", targetPercent: 10 },
    { name: "Resource Load Duration", key: "loadDuration", targetPercent: 40 },
    { name: "Element Render Delay", key: "renderDelay", targetPercent: 10 },
  ];

  const getNavigationEntry = () => {
    const navEntry = performance.getEntriesByType("navigation")[0];
    if (navEntry?.responseStart > 0 && navEntry.responseStart < performance.now()) {
      return navEntry;
    }
    return null;
  };

  const calcSubParts = (lcpEntry, navEntry) => {
    const lcpResEntry = performance
      .getEntriesByType("resource")
      .find((e) => e.name === lcpEntry.url);
    const activationStart = navEntry.activationStart || 0;
    const ttfb = Math.max(0, navEntry.responseStart - activationStart);
    const lcpRequestStart = Math.max(
      ttfb,
      lcpResEntry ? (lcpResEntry.requestStart || lcpResEntry.startTime) - activationStart : 0
    );
    const lcpResponseEnd = Math.max(
      lcpRequestStart,
      lcpResEntry ? lcpResEntry.responseEnd - activationStart : 0
    );
    const total = Math.max(lcpResponseEnd, lcpEntry.startTime - activationStart);
    return { ttfb, lcpRequestStart, lcpResponseEnd, total };
  };

  // Highlight LCP element and add Performance measures for DevTools timeline
  const observer = new PerformanceObserver((list) => {
    const lcpEntry = list.getEntries().at(-1);
    if (!lcpEntry) return;
    const navEntry = getNavigationEntry();
    if (!navEntry) return;

    const { ttfb, lcpRequestStart, lcpResponseEnd, total } = calcSubParts(lcpEntry, navEntry);

    if (HIGHLIGHT && lcpEntry.element) {
      lcpEntry.element.style.outline = "3px dashed lime";
      lcpEntry.element.style.outlineOffset = "2px";
    }

    SUB_PARTS.forEach((part) => performance.clearMeasures(part.name));
    const startTimes = { ttfb: 0, loadDelay: ttfb, loadTime: lcpRequestStart, renderDelay: lcpResponseEnd };
    const values = {
      ttfb,
      loadDelay: lcpRequestStart - ttfb,
      loadDuration: lcpResponseEnd - lcpRequestStart,
      renderDelay: total - lcpResponseEnd,
    };
    SUB_PARTS.forEach((part) => {
      performance.measure(part.name, {
        start: startTimes[part.key],
        end: startTimes[part.key] + values[part.key],
      });
    });
  });

  observer.observe({ type: "largest-contentful-paint", buffered: true });

  // Synchronous return for agent (buffered entries)
  const lcpEntry = performance.getEntriesByType("largest-contentful-paint").at(-1);
  if (!lcpEntry) {
    return { script: "LCP-Sub-Parts", status: "error", error: "No LCP entries yet" };
  }
  const navEntry = getNavigationEntry();
  if (!navEntry) {
    return { script: "LCP-Sub-Parts", status: "error", error: "No navigation entry" };
  }

  const { ttfb, lcpRequestStart, lcpResponseEnd, total } = calcSubParts(lcpEntry, navEntry);
  const totalMs = Math.round(total);
  const ttfbVal = Math.round(ttfb);
  const loadDelayVal = Math.round(lcpRequestStart - ttfb);
  const loadDurationVal = Math.round(lcpResponseEnd - lcpRequestStart);
  const renderDelayVal = Math.round(total - lcpResponseEnd);

  const slowestPhase = [
    { key: "ttfb", value: ttfbVal },
    { key: "resourceLoadDelay", value: loadDelayVal },
    { key: "resourceLoadDuration", value: loadDurationVal },
    { key: "elementRenderDelay", value: renderDelayVal },
  ].reduce((a, b) => (a.value > b.value ? a : b)).key;

  let selector = null;
  if (lcpEntry.element) {
    const el = lcpEntry.element;
    selector = el.tagName.toLowerCase();
    if (el.id) selector = `#${el.id}`;
    else if (el.className && typeof el.className === "string") {
      const classes = el.className.trim().split(/\s+/).slice(0, 2).join(".");
      if (classes) selector = `${el.tagName.toLowerCase()}.${classes}`;
    }
  }

  return {
    script: "LCP-Sub-Parts",
    status: "ok",
    metric: "LCP",
    value: totalMs,
    unit: "ms",
    rating: valueToRating(totalMs),
    thresholds: { good: 2500, needsImprovement: 4000 },
    details: {
      element: selector,
      url: lcpEntry.url ? lcpEntry.url.split("/").pop()?.split("?")[0] || null : null,
      subParts: {
        ttfb: { value: ttfbVal, percent: Math.round((ttfbVal / totalMs) * 100), overTarget: ttfbVal > 800 },
        resourceLoadDelay: { value: loadDelayVal, percent: Math.round((loadDelayVal / totalMs) * 100), overTarget: (loadDelayVal / totalMs) * 100 > 10 },
        resourceLoadDuration: { value: loadDurationVal, percent: Math.round((loadDurationVal / totalMs) * 100), overTarget: (loadDurationVal / totalMs) * 100 > 40 },
        elementRenderDelay: { value: renderDelayVal, percent: Math.round((renderDelayVal / totalMs) * 100), overTarget: (renderDelayVal / totalMs) * 100 > 10 },
      },
      slowestPhase,
    },
  };
})();
