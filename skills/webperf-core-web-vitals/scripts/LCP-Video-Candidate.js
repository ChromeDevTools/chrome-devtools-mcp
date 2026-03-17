(() => {
  const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
  if (lcpEntries.length === 0) {
    return { script: "LCP-Video-Candidate", status: "error", error: "No LCP entries found" };
  }

  const lcp = lcpEntries[lcpEntries.length - 1];
  const element = lcp.element;

  const valueToRating = (ms) =>
    ms <= 2500 ? "good" : ms <= 4000 ? "needs-improvement" : "poor";

  const getActivationStart = () => {
    const navEntry = performance.getEntriesByType("navigation")[0];
    return navEntry?.activationStart || 0;
  };

  const detectFormat = (url) => {
    if (!url) return "unknown";
    const ext = url.toLowerCase().split("?")[0].match(/\.(avif|webp|jxl|png|gif|jpg|jpeg|svg)(?:[?#]|$)/);
    if (ext) return ext[1] === "jpeg" ? "jpg" : ext[1];
    return "unknown";
  };

  const normalizeUrl = (url) => {
    try { return new URL(url, location.origin).href; }
    catch { return url; }
  };

  const activationStart = getActivationStart();

  if (!element || element.tagName !== "VIDEO") {
    return {
      script: "LCP-Video-Candidate",
      status: "ok",
      metric: "LCP",
      value: Math.round(Math.max(0, lcp.startTime - activationStart)),
      unit: "ms",
      rating: valueToRating(Math.max(0, lcp.startTime - activationStart)),
      thresholds: { good: 2500, needsImprovement: 4000 },
      details: { isVideo: false },
      issues: [],
    };
  }

  const posterAttr = element.getAttribute("poster") || "";
  const posterUrl = posterAttr ? normalizeUrl(posterAttr) : "";
  const lcpUrl = lcp.url || "";
  const posterFormat = detectFormat(lcpUrl || posterUrl);
  const isModernFormat = ["avif", "webp", "jxl"].includes(posterFormat);
  const isCrossOrigin = lcp.renderTime === 0 && lcp.loadTime > 0;

  const posterPreload = Array.from(
    document.querySelectorAll('link[rel="preload"][as="image"]')
  ).find((link) => {
    const href = link.getAttribute("href");
    if (!href) return false;
    try { return normalizeUrl(href) === posterUrl || normalizeUrl(href) === lcpUrl; }
    catch { return false; }
  }) ?? null;

  const preload = element.getAttribute("preload");
  const autoplay = element.hasAttribute("autoplay");
  const muted = element.hasAttribute("muted") || element.muted;
  const playsinline = element.hasAttribute("playsinline");

  const issues = [];
  if (!posterAttr) {
    issues.push({ severity: "error", message: "No poster attribute — the browser has no image to use as LCP candidate" });
  }
  if (posterAttr && !posterPreload) {
    issues.push({ severity: "warning", message: 'No <link rel="preload" as="image"> for the poster — browser discovers it late' });
  } else if (posterPreload && posterPreload.getAttribute("fetchpriority") !== "high") {
    issues.push({ severity: "info", message: 'Preload found but missing fetchpriority="high" — may be deprioritised' });
  }
  if (posterAttr && !isModernFormat && posterFormat !== "unknown") {
    issues.push({ severity: "info", message: `Poster uses ${posterFormat} — AVIF or WebP would reduce file size and LCP load time` });
  }
  if (isCrossOrigin) {
    issues.push({ severity: "info", message: "renderTime is 0 — poster is cross-origin and the server does not send Timing-Allow-Origin" });
  }
  if (!autoplay && preload === "none") {
    issues.push({ severity: "warning", message: 'preload="none" on a non-autoplay video may delay poster image loading in some browsers' });
  }

  const lcpValue = Math.round(Math.max(0, lcp.startTime - activationStart));
  return {
    script: "LCP-Video-Candidate",
    status: "ok",
    metric: "LCP",
    value: lcpValue,
    unit: "ms",
    rating: valueToRating(lcpValue),
    thresholds: { good: 2500, needsImprovement: 4000 },
    details: {
      isVideo: true,
      posterUrl: lcpUrl || posterUrl || null,
      posterFormat,
      posterPreloaded: !!posterPreload,
      fetchpriorityOnPreload: posterPreload?.getAttribute("fetchpriority") ?? null,
      isCrossOrigin,
      videoAttributes: { autoplay, muted, playsinline, preload },
    },
    issues,
  };
})();
