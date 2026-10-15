// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export const EVENT_BINDING_NAME = '__chromium_devtools_metrics_reporter';
export const INTERNAL_KILL_SWITCH = '__chromium_devtools_kill_live_metrics';
export const SCRIPTS_PER_LOAF_LIMIT = 10;
export const LOAF_LIMIT = 5;
export function getUniqueLayoutShiftId(entry) {
    return `layout-shift-${entry.value}-${entry.startTime}`;
}
export function limitScripts(loafs) {
    return loafs.map(loaf => {
        loaf.scripts = loaf.scripts.slice()
            .sort((a, b) => b.duration - a.duration)
            .slice(0, SCRIPTS_PER_LOAF_LIMIT)
            .sort((a, b) => a.startTime - b.startTime);
        return loaf;
    });
}
export function createInteractionEntryEvent(interaction) {
    const event = {
        name: 'InteractionEntry',
        duration: interaction.value,
        subparts: {
            inputDelay: interaction.attribution.inputDelay,
            processingDuration: interaction.attribution.processingDuration,
            presentationDelay: interaction.attribution.presentationDelay,
        },
        startTime: interaction.entries?.[0]?.startTime,
        navigationId: interaction.navigationId,
        entryGroupId: interaction.entries?.[0]?.interactionId,
        nextPaintTime: interaction.attribution.nextPaintTime,
        interactionType: interaction.attribution.interactionType,
        eventName: interaction.entries?.[0]?.name,
        // To limit the amount of events, just get the last 5 LoAFs
        longAnimationFrameEntries: limitScripts(interaction.attribution.longAnimationFrameEntries?.slice(-LOAF_LIMIT).map(loaf => loaf.toJSON()) ?? []),
    };
    const target = interaction.attribution.interactionTarget;
    if (target) {
        event.nodeIndex = Number(target);
    }
    return event;
}
export function createInpChangeEvent(metric) {
    return {
        name: 'INP',
        value: metric.value,
        subparts: {
            inputDelay: metric.attribution.inputDelay,
            processingDuration: metric.attribution.processingDuration,
            presentationDelay: metric.attribution.presentationDelay,
        },
        startTime: metric.entries?.[0]?.startTime,
        entryGroupId: metric.entries?.[0]?.interactionId,
        interactionType: metric.attribution.interactionType,
    };
}
//# sourceMappingURL=spec.js.map