(() => {
  const LCP_THRESHOLD = 0.05; // Chrome's threshold for low-entropy (Chrome 112+)

  const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
  const lcpEntry = lcpEntries.at(-1);
  const lcpElement = lcpEntry?.element ?? null;
  const lcpUrl = lcpEntry?.url ?? null;

  const images = [...document.images]
    .filter((img) => {
      const src = img.currentSrc || img.src;
      return src && !src.startsWith("data:image");
    })
    .map((img) => {
      const src = img.currentSrc || img.src;
      const resource = performance.getEntriesByName(src)[0];
      const fileSize = resource?.encodedBodySize || 0;
      const pixels = img.naturalWidth * img.naturalHeight;
      const bpp = pixels > 0 ? (fileSize * 8) / pixels : 0;
      const isLowEntropy = bpp > 0 && bpp < LCP_THRESHOLD;
      const isLCP = lcpElement === img || lcpUrl === src;
      return {
        url: src.split("/").pop()?.split("?")[0] || src,
        width: img.naturalWidth,
        height: img.naturalHeight,
        fileSizeBytes: fileSize,
        bpp: Math.round(bpp * 10000) / 10000,
        isLowEntropy,
        lcpEligible: !isLowEntropy && bpp > 0,
        isLCP,
      };
    })
    .filter((img) => img.bpp > 0);

  const lowEntropyCount = images.filter((img) => img.isLowEntropy).length;
  const lcpImage = images.find((img) => img.isLCP);
  const issues = [];

  if (lowEntropyCount > 0) {
    issues.push({
      severity: "warning",
      message: `${lowEntropyCount} image(s) have low entropy and are not considered for LCP`,
    });
  }
  if (lcpImage?.isLowEntropy) {
    issues.push({
      severity: "error",
      message: "Current LCP image has low entropy and may be skipped by Chrome",
    });
  }

  return {
    script: "LCP-Image-Entropy",
    status: "ok",
    count: images.length,
    details: {
      totalImages: images.length,
      lowEntropyCount,
      lcpImageEligible: lcpImage ? !lcpImage.isLowEntropy : null,
      lcpImage: lcpImage
        ? { url: lcpImage.url, bpp: lcpImage.bpp, isLowEntropy: lcpImage.isLowEntropy }
        : null,
    },
    items: images,
    issues,
  };
})();
