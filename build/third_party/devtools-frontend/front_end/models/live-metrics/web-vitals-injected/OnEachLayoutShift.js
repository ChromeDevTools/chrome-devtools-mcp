// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export function onEachLayoutShift(callback) {
    const eventObserver = new PerformanceObserver(list => {
        const entries = list.getEntries().filter((entry) => 'hadRecentInput' in entry);
        for (const entry of entries) {
            if (entry.hadRecentInput) {
                continue;
            }
            const affectedNodes = entry.sources.map(source => source.node).filter(node => node instanceof Node);
            callback({
                attribution: {
                    affectedNodes,
                },
                entry,
                value: entry.value,
            });
        }
    });
    eventObserver.observe({
        type: 'layout-shift',
        buffered: true,
    });
}
//# sourceMappingURL=OnEachLayoutShift.js.map