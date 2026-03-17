(() => {
  const interactions = [];
  let inpValue = 0;
  let inpEntry = null;

  const valueToRating = (ms) =>
    ms <= 200 ? "good" : ms <= 500 ? "needs-improvement" : "poor";

  const calculateINP = () => {
    if (interactions.length === 0) return { value: 0, entry: null };
    const sorted = [...interactions].sort((a, b) => b.duration - a.duration);
    const index = interactions.length < 50 ? 0 : Math.floor(interactions.length * 0.02);
    return { value: sorted[index].duration, entry: sorted[index] };
  };

  const getInteractionName = (entry) => {
    const target = entry.target;
    if (!target) return entry.name;
    let selector = target.tagName.toLowerCase();
    if (target.id) selector += `#${target.id}`;
    else if (target.className && typeof target.className === "string") {
      const classes = target.className.trim().split(/\s+/).slice(0, 2).join(".");
      if (classes) selector += `.${classes}`;
    }
    return `${entry.name} → ${selector}`;
  };

  const getPhaseBreakdown = (entry) => {
    const phases = { inputDelay: 0, processingTime: 0, presentationDelay: 0 };
    if (entry.processingStart && entry.processingEnd) {
      phases.inputDelay = entry.processingStart - entry.startTime;
      phases.processingTime = entry.processingEnd - entry.processingStart;
      phases.presentationDelay = entry.duration - phases.inputDelay - phases.processingTime;
    }
    return phases;
  };

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!entry.interactionId) continue;
      const existing = interactions.find((i) => i.interactionId === entry.interactionId);
      if (!existing || entry.duration > existing.duration) {
        if (existing) interactions.splice(interactions.indexOf(existing), 1);
        interactions.push({
          name: entry.name,
          duration: entry.duration,
          startTime: entry.startTime,
          interactionId: entry.interactionId,
          target: entry.target,
          processingStart: entry.processingStart,
          processingEnd: entry.processingEnd,
          formattedName: getInteractionName(entry),
          phases: getPhaseBreakdown(entry),
        });
      }
      const result = calculateINP();
      inpValue = result.value;
      inpEntry = result.entry;
    }
  });

  observer.observe({ type: "event", buffered: true, durationThreshold: 16 });

  window.getINP = () => {
    const result = calculateINP();
    inpValue = result.value;
    inpEntry = result.entry;
    const rating = valueToRating(inpValue);
    const details = { totalInteractions: interactions.length };
    if (inpEntry) {
      details.worstEvent = inpEntry.formattedName;
      details.phases = {
        inputDelay: Math.round(inpEntry.phases.inputDelay),
        processingTime: Math.round(inpEntry.phases.processingTime),
        presentationDelay: Math.round(inpEntry.phases.presentationDelay),
      };
    }
    if (interactions.length === 0) {
      return {
        script: "INP", status: "error",
        error: "No interactions recorded yet. Interact with the page and call getINP() again.",
        getDataFn: "getINP",
      };
    }
    return {
      script: "INP", status: "ok", metric: "INP",
      value: Math.round(inpValue), unit: "ms", rating,
      thresholds: { good: 200, needsImprovement: 500 }, details,
    };
  };

  window.getINPDetails = () => {
    if (interactions.length === 0) return [];
    return [...interactions]
      .sort((a, b) => b.duration - a.duration)
      .map((i) => ({
        formattedName: i.formattedName,
        duration: Math.round(i.duration),
        startTime: Math.round(i.startTime),
        phases: {
          inputDelay: Math.round(i.phases.inputDelay),
          processingTime: Math.round(i.phases.processingTime),
          presentationDelay: Math.round(i.phases.presentationDelay),
        },
      }));
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      observer.takeRecords();
      const result = calculateINP();
      inpValue = result.value;
      inpEntry = result.entry;
    }
  });

  return {
    script: "INP",
    status: "tracking",
    message: "INP tracking active. Interact with the page then call getINP() for results.",
    getDataFn: "getINP",
  };
})();
