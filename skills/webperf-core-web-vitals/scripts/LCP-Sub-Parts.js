// LCP Sub-Parts Analysis
// https://webperf-snippets.nucliweb.net

(() => {
  const formatMs = (ms) => `${Math.round(ms)}ms`;
  const formatPercent = (value, total) => `${Math.round((value / total) * 100)}%`;

  const valueToRating = (ms) =>
    ms <= 2500 ? "good" : ms <= 4000 ? "needs-improvement" : "poor";

  const RATING = {
    good: { icon: "🟢", color: "#0CCE6A" },
    "needs-improvement": { icon: "🟡", color: "#FFA400" },
    poor: { icon: "🔴", color: "#FF4E42" },
  };

  const SUB_PARTS = [
    { name: "Time to First Byte", key: "ttfb", target: 800 },
    { name: "Resource Load Delay", key: "loadDelay", targetPercent: 10 },
    { name: "Resource Load Time", key: "loadTime", targetPercent: 40 },
    { name: "Element Render Delay", key: "renderDelay", targetPercent: 10 },
  ];

  const getNavigationEntry = () => {
    const navEntry = performance.getEntriesByType("navigation")[0];
    if (navEntry?.responseStart > 0 && navEntry.responseStart < performance.now()) {
      return navEntry;
    }
    return null;
  };

  const observer = new PerformanceObserver((list) => {
    const lcpEntry = list.getEntries().at(-1);
    if (!lcpEntry) return;

    const navEntry = getNavigationEntry();
    if (!navEntry) return;

    const lcpResEntry = performance
      .getEntriesByType("resource")
      .find((e) => e.name === lcpEntry.url);

    const activationStart = navEntry.activationStart || 0;

    // Calculate sub-parts
    const ttfb = Math.max(0, navEntry.responseStart - activationStart);

    const lcpRequestStart = Math.max(
      ttfb,
      lcpResEntry
        ? (lcpResEntry.requestStart || lcpResEntry.startTime) - activationStart
        : 0
    );

    const lcpResponseEnd = Math.max(
      lcpRequestStart,
      lcpResEntry ? lcpResEntry.responseEnd - activationStart : 0
    );

    const lcpRenderTime = Math.max(
      lcpResponseEnd,
      lcpEntry.startTime - activationStart
    );

    const subPartValues = {
      ttfb: ttfb,
      loadDelay: lcpRequestStart - ttfb,
      loadTime: lcpResponseEnd - lcpRequestStart,
      renderDelay: lcpRenderTime - lcpResponseEnd,
    };

    // LCP Rating
    const rating = valueToRating(lcpRenderTime);
    const { icon, color } = RATING[rating];

    console.group(
      `%cLCP: ${icon} ${formatMs(lcpRenderTime)} (${rating})`,
      `color: ${color}; font-weight: bold; font-size: 14px;`
    );

    // Element info
    if (lcpEntry.element) {
      const el = lcpEntry.element;
      let selector = el.tagName.toLowerCase();
      if (el.id) selector = `#${el.id}`;
      else if (el.className && typeof el.className === "string") {
        const classes = el.className.trim().split(/\s+/).slice(0, 2).join(".");
        if (classes) selector = `${el.tagName.toLowerCase()}.${classes}`;
      }

      console.log("");
      console.log("%cLCP Element:", "font-weight: bold;");
      console.log(`   ${selector}`, el);
      if (lcpEntry.url) {
        const shortUrl = lcpEntry.url.split("/").pop()?.split("?")[0] || lcpEntry.url;
        console.log(`   URL: ${shortUrl}`);
      }

      // Highlight
      el.style.outline = "3px dashed lime";
      el.style.outlineOffset = "2px";
    }

    // Sub-parts table
    console.log("");
    console.log("%cSub-Parts Breakdown:", "font-weight: bold;");

    // Find the slowest phase
    const phases = SUB_PARTS.map((part) => ({
      ...part,
      value: subPartValues[part.key],
      percent: (subPartValues[part.key] / lcpRenderTime) * 100,
    }));

    const slowest = phases.reduce((a, b) => (a.value > b.value ? a : b));

    const tableData = phases.map((part) => {
      const isSlowest = part.key === slowest.key;
      const isOverTarget = part.target
        ? part.value > part.target
        : part.percent > part.targetPercent;

      return {
        "Sub-part": isSlowest ? `⚠️ ${part.name}` : part.name,
        Time: formatMs(part.value),
        "%": formatPercent(part.value, lcpRenderTime),
        Status: isOverTarget ? "🔴 Over target" : "✅ OK",
      };
    });

    console.table(tableData);

    // Visual bar
    const barWidth = 40;
    const bars = phases.map((p) => {
      const width = Math.max(1, Math.round((p.value / lcpRenderTime) * barWidth));
      return { key: p.key, bar: width };
    });

    const ttfbBar = "█".repeat(bars[0].bar);
    const delayBar = "▓".repeat(bars[1].bar);
    const loadBar = "▒".repeat(bars[2].bar);
    const renderBar = "░".repeat(bars[3].bar);

    console.log("");
    console.log(`   ${ttfbBar}${delayBar}${loadBar}${renderBar}`);
    console.log("   █ TTFB  ▓ Load Delay  ▒ Load Time  ░ Render Delay");

    // Recommendations based on slowest phase
    console.log("");
    console.log("%c💡 Optimization Focus:", "font-weight: bold; color: #3b82f6;");
    console.log(`   Slowest phase: ${slowest.name} (${formatPercent(slowest.value, lcpRenderTime)})`);

    if (slowest.key === "ttfb") {
      console.log("   → Use a CDN to reduce latency");
      console.log("   → Enable server-side caching");
      console.log("   → Optimize server response time");
    } else if (slowest.key === "loadDelay") {
      console.log("   → Preload the LCP image: <link rel=\"preload\" as=\"image\" href=\"...\">");
      console.log("   → Remove render-blocking resources");
      console.log("   → Inline critical CSS");
    } else if (slowest.key === "loadTime") {
      console.log("   → Compress and resize the LCP image");
      console.log("   → Use modern formats (WebP, AVIF)");
      console.log("   → Use a CDN for faster delivery");
    } else if (slowest.key === "renderDelay") {
      console.log("   → Reduce render-blocking JavaScript");
      console.log("   → Avoid client-side rendering for LCP element");
      console.log("   → Use fetchpriority=\"high\" on LCP image");
    }

    // Performance entries for DevTools
    SUB_PARTS.forEach((part) => performance.clearMeasures(part.name));

    phases.forEach((part) => {
      const startTimes = {
        ttfb: 0,
        loadDelay: ttfb,
        loadTime: lcpRequestStart,
        renderDelay: lcpResponseEnd,
      };
      performance.measure(part.name, {
        start: startTimes[part.key],
        end: startTimes[part.key] + part.value,
      });
    });

    console.log("");
    console.log("%c📊 Measures added to Performance timeline", "color: #666;");
    console.log("   Open DevTools → Performance → reload to see waterfall");

    console.groupEnd();
  });

  observer.observe({ type: "largest-contentful-paint", buffered: true });

  console.log("%c📊 LCP Sub-Parts Analysis Active", "font-weight: bold; font-size: 14px;");
  console.log("   Waiting for LCP...");

  // Synchronous return for agent (buffered entries)
  const lcpBuffered = performance.getEntriesByType("largest-contentful-paint");
  const lcpEntry = lcpBuffered.at(-1);
  if (!lcpEntry) {
    return { script: "LCP-Sub-Parts", status: "error", error: "No LCP entries yet" };
  }
  const navEntrySync = getNavigationEntry();
  if (!navEntrySync) {
    return { script: "LCP-Sub-Parts", status: "error", error: "No navigation entry" };
  }
  const lcpResEntrySync = performance.getEntriesByType("resource")
    .find((e) => e.name === lcpEntry.url);
  const activationStartSync = navEntrySync.activationStart || 0;
  const ttfbSync = Math.max(0, navEntrySync.responseStart - activationStartSync);
  const lcpRequestStartSync = Math.max(ttfbSync,
    lcpResEntrySync ? (lcpResEntrySync.requestStart || lcpResEntrySync.startTime) - activationStartSync : 0
  );
  const lcpResponseEndSync = Math.max(lcpRequestStartSync,
    lcpResEntrySync ? lcpResEntrySync.responseEnd - activationStartSync : 0
  );
  const lcpRenderTimeSync = Math.max(lcpResponseEndSync, lcpEntry.startTime - activationStartSync);
  const totalSync = Math.round(lcpRenderTimeSync);
  const ratingSync = valueToRating(totalSync);
  const ttfbVal = Math.round(ttfbSync);
  const loadDelayVal = Math.round(lcpRequestStartSync - ttfbSync);
  const loadTimeVal = Math.round(lcpResponseEndSync - lcpRequestStartSync);
  const renderDelayVal = Math.round(lcpRenderTimeSync - lcpResponseEndSync);
  const subPartsForRank = [
    { key: "ttfb", value: ttfbVal },
    { key: "resourceLoadDelay", value: loadDelayVal },
    { key: "resourceLoadTime", value: loadTimeVal },
    { key: "elementRenderDelay", value: renderDelayVal },
  ];
  const slowestPhaseSync = subPartsForRank.reduce((a, b) => a.value > b.value ? a : b).key;
  let lcpSelectorSync = null;
  if (lcpEntry.element) {
    const el = lcpEntry.element;
    lcpSelectorSync = el.tagName.toLowerCase();
    if (el.id) lcpSelectorSync = `#${el.id}`;
    else if (el.className && typeof el.className === "string") {
      const classes = el.className.trim().split(/\s+/).slice(0, 2).join(".");
      if (classes) lcpSelectorSync = `${el.tagName.toLowerCase()}.${classes}`;
    }
  }
  const shortUrlSync = lcpEntry.url
    ? (lcpEntry.url.split("/").pop()?.split("?")[0] || lcpEntry.url)
    : null;
  return {
    script: "LCP-Sub-Parts",
    status: "ok",
    metric: "LCP",
    value: totalSync,
    unit: "ms",
    rating: ratingSync,
    thresholds: { good: 2500, needsImprovement: 4000 },
    details: {
      element: lcpSelectorSync,
      url: shortUrlSync,
      subParts: {
        ttfb: { value: ttfbVal, percent: Math.round((ttfbVal / totalSync) * 100), overTarget: ttfbVal > 800 },
        resourceLoadDelay: { value: loadDelayVal, percent: Math.round((loadDelayVal / totalSync) * 100), overTarget: (loadDelayVal / totalSync) * 100 > 10 },
        resourceLoadTime: { value: loadTimeVal, percent: Math.round((loadTimeVal / totalSync) * 100), overTarget: (loadTimeVal / totalSync) * 100 > 40 },
        elementRenderDelay: { value: renderDelayVal, percent: Math.round((renderDelayVal / totalSync) * 100), overTarget: (renderDelayVal / totalSync) * 100 > 10 },
      },
      slowestPhase: slowestPhaseSync,
    },
  };
})();
