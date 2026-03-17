// CLS Quick Check
// https://webperf-snippets.nucliweb.net

(() => {
  let cls = 0;

  const valueToRating = (score) =>
    score <= 0.1 ? "good" : score <= 0.25 ? "needs-improvement" : "poor";

  const RATING = {
    good: { icon: "🟢", color: "#0CCE6A" },
    "needs-improvement": { icon: "🟡", color: "#FFA400" },
    poor: { icon: "🔴", color: "#FF4E42" },
  };

  const logCLS = () => {
    const rating = valueToRating(cls);
    const { icon, color } = RATING[rating];
    console.log(
      `%cCLS: ${icon} ${cls.toFixed(4)} (${rating})`,
      `color: ${color}; font-weight: bold; font-size: 14px;`
    );
  };

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!entry.hadRecentInput) {
        cls += entry.value;
      }
    }
    logCLS();
  });

  observer.observe({ type: "layout-shift", buffered: true });

  // Update on visibility change (final CLS)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      observer.takeRecords();
      console.log("%c📊 Final CLS (on page hide):", "font-weight: bold;");
      logCLS();
    }
  });

  // Expose function for manual check
  window.getCLS = () => {
    logCLS();
    const rating = valueToRating(cls);
    return {
      script: "CLS",
      status: "ok",
      metric: "CLS",
      value: Math.round(cls * 10000) / 10000,
      unit: "score",
      rating,
      thresholds: { good: 0.1, needsImprovement: 0.25 },
    };
  };

  console.log(
    "   Call %cgetCLS()%c anytime to check current value.",
    "font-family: monospace; background: #f3f4f6; padding: 2px 4px;",
    ""
  );

  // Synchronous return for agent (buffered entries)
  const clsSync = performance.getEntriesByType("layout-shift")
    .reduce((sum, e) => !e.hadRecentInput ? sum + e.value : sum, 0);
  const clsRating = valueToRating(clsSync);
  return {
    script: "CLS",
    status: "ok",
    metric: "CLS",
    value: Math.round(clsSync * 10000) / 10000,
    unit: "score",
    rating: clsRating,
    thresholds: { good: 0.1, needsImprovement: 0.25 },
  };
})();
