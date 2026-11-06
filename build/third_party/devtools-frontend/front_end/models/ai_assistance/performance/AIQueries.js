// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Trace from '../../../models/trace/trace.js';
import { AICallTree } from './AICallTree.js';
export class AIQueries {
    static findMainThread(navigationId, parsedTrace) {
        /**
         * We cannot assume that there is one main thread as there are scenarios
         * where there can be multiple (see crbug.com/402658800) as an example.
         * Therefore we calculate the main thread by using the thread that the
         * Insight has been associated to. Most Insights relate to a navigation, so
         * in this case we can use the navigation's PID/TID as we know that will
         * have run on the main thread that we are interested in.
         * If we do not have a navigation, we fall back to looking for the first
         * thread we find that is of type MAIN_THREAD.
         * Longer term we should solve this at the Trace Engine level to avoid
         * look-ups like this; this is the work that is tracked in
         * crbug.com/402658800.
         */
        let mainThreadPID = null;
        let mainThreadTID = null;
        if (navigationId) {
            const navigation = parsedTrace.data.Meta.navigationsByNavigationId.get(navigationId);
            if (navigation?.args.data?.isOutermostMainFrame) {
                mainThreadPID = navigation.pid;
                mainThreadTID = navigation.tid;
            }
        }
        const threads = Trace.Handlers.Threads.threadsInTrace(parsedTrace.data);
        const thread = threads.find(thread => {
            if (!thread.processIsOnMainFrame) {
                return false;
            }
            if (mainThreadPID && mainThreadTID) {
                return thread.pid === mainThreadPID && thread.tid === mainThreadTID;
            }
            return thread.type === Trace.Handlers.Threads.ThreadType.MAIN_THREAD;
        });
        return thread ?? null;
    }
    /**
     * Returns bottom up activity for the given range (within a single navigation / thread).
     */
    static mainThreadActivityBottomUpSingleNavigation(navigationId, bounds, parsedTrace) {
        const thread = this.findMainThread(navigationId, parsedTrace);
        if (!thread) {
            return null;
        }
        const events = AICallTree.findEventsForThread({ thread, parsedTrace, bounds });
        if (!events) {
            return null;
        }
        // Use the same filtering as front_end/panels/timeline/TimelineTreeView.ts.
        const visibleEvents = Trace.Helpers.Trace.VISIBLE_TRACE_EVENT_TYPES.values().toArray();
        const filter = new Trace.Extras.TraceFilter.VisibleEventsFilter(visibleEvents.concat([Trace.Types.Events.Name.SYNTHETIC_NETWORK_REQUEST]));
        // The bottom up root node handles all the "in Tracebounds" checks we need for the insight.
        const startTime = Trace.Helpers.Timing.microToMilli(bounds.min);
        const endTime = Trace.Helpers.Timing.microToMilli(bounds.max);
        return new Trace.Extras.TraceTree.BottomUpRootNode(events, {
            textFilter: new Trace.Extras.TraceFilter.ExclusiveNameFilter([]),
            filters: [filter],
            startTime,
            endTime,
        });
    }
    /**
     * Returns bottom up activity for the given range (no matter the navigation / thread).
     */
    static mainThreadActivityBottomUp(bounds, parsedTrace) {
        const threads = [];
        if (parsedTrace.insights) {
            for (const insightSet of parsedTrace.insights?.values()) {
                const navigationId = Trace.Helpers.Trace.navigationIDForEvent(insightSet.navigation);
                const thread = this.findMainThread(navigationId, parsedTrace);
                if (thread) {
                    threads.push(thread);
                }
            }
        }
        else {
            const navigationId = parsedTrace.data.Meta.mainFrameNavigations[0].args.data?.navigationId;
            const thread = this.findMainThread(navigationId, parsedTrace);
            if (thread) {
                threads.push(thread);
            }
        }
        if (threads.length === 0) {
            return null;
        }
        const threadEvents = [...new Set(threads)].map(thread => AICallTree.findEventsForThread({ thread, parsedTrace, bounds }) ?? []);
        const events = threadEvents.flat();
        if (events.length === 0) {
            return null;
        }
        // Use the same filtering as front_end/panels/timeline/TimelineTreeView.ts.
        const visibleEvents = Trace.Helpers.Trace.VISIBLE_TRACE_EVENT_TYPES.values().toArray();
        const filter = new Trace.Extras.TraceFilter.VisibleEventsFilter(visibleEvents.concat([Trace.Types.Events.Name.SYNTHETIC_NETWORK_REQUEST]));
        // The bottom up root node handles all the "in Tracebounds" checks we need for the insight.
        const startTime = Trace.Helpers.Timing.microToMilli(bounds.min);
        const endTime = Trace.Helpers.Timing.microToMilli(bounds.max);
        return new Trace.Extras.TraceTree.BottomUpRootNode(events, {
            textFilter: new Trace.Extras.TraceFilter.ExclusiveNameFilter([]),
            filters: [filter],
            startTime,
            endTime,
        });
    }
    /**
     * Returns an AI Call Tree representing the activity on the main thread for
     * the relevant time range of the given insight.
     */
    static mainThreadActivityTopDown(navigationId, bounds, parsedTrace) {
        const thread = this.findMainThread(navigationId, parsedTrace);
        if (!thread) {
            return null;
        }
        return AICallTree.fromTimeOnThread({
            thread: {
                pid: thread.pid,
                tid: thread.tid,
            },
            parsedTrace,
            bounds,
        });
    }
    /**
     * Returns the top longest tasks as AI Call Trees.
     */
    static longestTasks(navigationId, bounds, parsedTrace, limit = 3) {
        const thread = this.findMainThread(navigationId, parsedTrace);
        if (!thread) {
            return null;
        }
        const tasks = AICallTree.findMainThreadTasks({ thread, parsedTrace, bounds });
        if (!tasks) {
            return null;
        }
        const topTasks = tasks.filter(e => e.name === 'RunTask').sort((a, b) => b.dur - a.dur).slice(0, limit);
        return topTasks
            .map(task => {
            const tree = AICallTree.fromEvent(task, parsedTrace);
            if (tree) {
                tree.selectedNode = null;
            }
            return tree;
        })
            .filter(tree => !!tree);
    }
}
//# sourceMappingURL=AIQueries.js.map