// LCP Image Entropy Check
// https://webperf-snippets.nucliweb.net

(() => {
  const formatBytes = (bytes) => {
    if (!bytes) return "-";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + " " + sizes[i];
  };

  const LCP_THRESHOLD = 0.05; // Chrome's threshold for low-entropy

  // Get current LCP element
  let lcpElement = null;
  let lcpUrl = null;

  const lcpObserver = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const lastEntry = entries[entries.length - 1];
    if (lastEntry) {
      lcpElement = lastEntry.element;
      lcpUrl = lastEntry.url;
    }
  });

  lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });

  // Wait a tick to ensure LCP is captured (for human console output)
  setTimeout(() => {
    lcpObserver.disconnect();

    // Get all images
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
          element: img,
          src,
          shortSrc: src.split("/").pop()?.split("?")[0] || src,
          width: img.naturalWidth,
          height: img.naturalHeight,
          fileSize,
          bpp,
          isLowEntropy,
          isLCP,
          lcpEligible: !isLowEntropy && bpp > 0,
        };
      })
      .filter((img) => img.bpp > 0); // Only images with measurable BPP

    console.group("%c🖼️ Image Entropy Analysis", "font-weight: bold; font-size: 14px;");

    if (images.length === 0) {
      console.log("   No images with measurable entropy found.");
      console.log("   (Data URLs and cross-origin images without CORS are excluded)");
      console.groupEnd();
      return;
    }

    // Summary
    const lowEntropy = images.filter((img) => img.isLowEntropy);
    const normalEntropy = images.filter((img) => !img.isLowEntropy);
    const lcpImage = images.find((img) => img.isLCP);

    console.log("");
    console.log("%cSummary:", "font-weight: bold;");
    console.log(`   Total images analyzed: ${images.length}`);
    console.log(`   🟢 Normal entropy (LCP eligible): ${normalEntropy.length}`);
    console.log(`   🔴 Low entropy (LCP ineligible): ${lowEntropy.length}`);

    if (lcpImage) {
      const icon = lcpImage.isLowEntropy ? "⚠️" : "✅";
      console.log("");
      console.log(`%c${icon} Current LCP image:`, "font-weight: bold;");
      console.log(`   ${lcpImage.shortSrc}`);
      console.log(`   BPP: ${lcpImage.bpp.toFixed(4)} ${lcpImage.isLowEntropy ? "(LOW - may be skipped!)" : "(OK)"}`);
    }

    // Table
    console.log("");
    console.log("%cAll Images:", "font-weight: bold;");

    const tableData = images
      .sort((a, b) => b.bpp - a.bpp)
      .map((img) => ({
        Image: img.shortSrc.length > 30 ? "..." + img.shortSrc.slice(-27) : img.shortSrc,
        Dimensions: `${img.width}×${img.height}`,
        Size: formatBytes(img.fileSize),
        BPP: img.bpp.toFixed(4),
        Entropy: img.isLowEntropy ? "🔴 Low" : "🟢 Normal",
        "LCP Eligible": img.lcpEligible ? "✅" : "❌",
        "Is LCP": img.isLCP ? "👈" : "",
      }));

    console.table(tableData);

    // Warnings
    if (lowEntropy.length > 0) {
      console.log("");
      console.log("%c⚠️ Low Entropy Images:", "font-weight: bold; color: #f59e0b;");
      console.log("   These images will NOT be considered for LCP in Chrome 112+:");
      lowEntropy.forEach((img) => {
        console.log(`   • ${img.shortSrc} (BPP: ${img.bpp.toFixed(4)})`, img.element);
      });
    }

    if (lcpImage && lcpImage.isLowEntropy) {
      console.log("");
      console.log("%c🚨 Warning:", "font-weight: bold; color: #ef4444;");
      console.log("   Your LCP image has low entropy and may be skipped by Chrome!");
      console.log("   Chrome will use the next largest element instead.");
      console.log("");
      console.log("%c💡 Solutions:", "font-weight: bold; color: #3b82f6;");
      console.log("   • Replace placeholder with actual content image");
      console.log("   • Use a text element as LCP instead");
      console.log("   • Ensure hero image loads with sufficient detail");
    }

    // Elements for inspection
    console.log("");
    console.log("%c🔎 Inspect elements:", "font-weight: bold;");
    images.forEach((img, i) => {
      const icon = img.isLowEntropy ? "🔴" : "🟢";
      const lcpMark = img.isLCP ? " 👈 LCP" : "";
      console.log(`   ${i + 1}. ${icon} ${img.shortSrc}${lcpMark}`, img.element);
    });

    console.groupEnd();
  }, 100);

  // Synchronous return for agent (buffered entries + DOM)
  const lcpEntriesSync = performance.getEntriesByType("largest-contentful-paint");
  const lcpEntrySync = lcpEntriesSync.at(-1);
  const lcpElementSync = lcpEntrySync?.element ?? null;
  const lcpUrlSync = lcpEntrySync?.url ?? null;
  const imagesSync = [...document.images]
    .filter((img) => { const src = img.currentSrc || img.src; return src && !src.startsWith("data:image"); })
    .map((img) => {
      const src = img.currentSrc || img.src;
      const resource = performance.getEntriesByName(src)[0];
      const fileSize = resource?.encodedBodySize || 0;
      const pixels = img.naturalWidth * img.naturalHeight;
      const bpp = pixels > 0 ? (fileSize * 8) / pixels : 0;
      const isLowEntropy = bpp > 0 && bpp < LCP_THRESHOLD;
      const isLCP = lcpElementSync === img || lcpUrlSync === src;
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
  const lowEntropyCount = imagesSync.filter((img) => img.isLowEntropy).length;
  const lcpImageSync = imagesSync.find((img) => img.isLCP);
  const issuesSync = [];
  if (lowEntropyCount > 0) {
    issuesSync.push({ severity: "warning", message: `${lowEntropyCount} image(s) have low entropy and are LCP-ineligible in Chrome 112+` });
  }
  if (lcpImageSync?.isLowEntropy) {
    issuesSync.push({ severity: "error", message: "Current LCP image has low entropy and may be skipped by Chrome" });
  }
  return {
    script: "LCP-Image-Entropy",
    status: "ok",
    count: imagesSync.length,
    details: {
      totalImages: imagesSync.length,
      lowEntropyCount,
      lcpImageEligible: lcpImageSync ? !lcpImageSync.isLowEntropy : null,
      lcpImage: lcpImageSync ? { url: lcpImageSync.url, bpp: lcpImageSync.bpp, isLowEntropy: lcpImageSync.isLowEntropy } : null,
    },
    items: imagesSync,
    issues: issuesSync,
  };
})();
