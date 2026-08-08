(() => {
  let cls = 0;

  const valueToRating = (score) =>
    score <= 0.1 ? "good" : score <= 0.25 ? "needs-improvement" : "poor";

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!entry.hadRecentInput) cls += entry.value;
    }
  });

  observer.observe({ type: "layout-shift", buffered: true });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") observer.takeRecords();
  });

  window.getCLS = () => ({
    script: "CLS",
    status: "ok",
    metric: "CLS",
    value: Math.round(cls * 10000) / 10000,
    unit: "score",
    rating: valueToRating(cls),
    thresholds: { good: 0.1, needsImprovement: 0.25 },
  });

  // Synchronous return for agent (buffered entries)
  const clsSync = performance
    .getEntriesByType("layout-shift")
    .reduce((sum, e) => (!e.hadRecentInput ? sum + e.value : sum), 0);

  return {
    script: "CLS",
    status: "ok",
    metric: "CLS",
    value: Math.round(clsSync * 10000) / 10000,
    unit: "score",
    rating: valueToRating(clsSync),
    thresholds: { good: 0.1, needsImprovement: 0.25 },
    message: "CLS measurement active. Call getCLS() for updated value after page interactions.",
  };
})();
