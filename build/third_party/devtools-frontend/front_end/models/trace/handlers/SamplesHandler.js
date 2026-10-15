// Copyright 2022 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../../core/platform/platform.js';
import * as CPUProfile from '../../cpu_profile/cpu_profile.js';
import * as Helpers from '../helpers/helpers.js';
import * as Types from '../types/types.js';
let profilesInProcess = new Map();
let entryToNode = new Map();
// The profile head, containing its metadata like its start
// time, comes in a "Profile" event. The sample data comes in
// "ProfileChunk" events. We match these ProfileChunks with their head
// using process and profile ids. However, in order to integrate sample
// data with trace data, we need the thread id that owns each profile.
// This thread id is extracted from the head event.
// For this reason, we have a preprocessed data structure, where events
// are matched by profile id, which we then finish processing to export
// events matched by thread id.
let preprocessedData = new Map();
/**
 * Profile source selection priority when multiple profiles exist for the same thread.
 *
 * Profile sources and their typical scenarios:
 * - 'Internal': Browser-initiated profiling performance panel traces.
 *   This is the profiling mechanism when users click "Record" in the Devtools UI.
 * - 'Inspector': User-initiated via console.profile()/profileEnd() calls.
 *   Represents explicit developer intent to profile specific code.
 * - 'SelfProfiling': Page-initiated via JS Self-Profiling API.
 *    Lower signal vs the two above; treated as fallback.
 *
 * Selection strategy:
 * - CPU Profile mode: Prefer 'Inspector' (explicit user request).
 * - Performance trace: Prefer 'Internal' (integrated timeline context), then 'Inspector'.
 * - Sources not in the priority list (including 'SelfProfiling') act as fallbacks.
 *   When no priority source matches, the first candidate profile is selected.
 */
const PROFILE_SOURCES_BY_PRIORITY = {
    cpuProfile: ['Inspector'],
    performanceTrace: ['Internal', 'Inspector'],
};
function parseCPUProfileData(parseOptions) {
    const priorityList = parseOptions.isCPUProfile ? PROFILE_SOURCES_BY_PRIORITY.cpuProfile : PROFILE_SOURCES_BY_PRIORITY.performanceTrace;
    for (const [processId, profiles] of preprocessedData) {
        const profilesByThread = new Map();
        for (const [profileId, preProcessedData] of profiles) {
            const threadId = preProcessedData.threadId;
            if (threadId === undefined) {
                continue;
            }
            const listForThread = Platform.MapUtilities.getWithDefault(profilesByThread, threadId, () => []);
            listForThread.push({ id: profileId, data: preProcessedData });
        }
        for (const [threadId, candidates] of profilesByThread) {
            if (!candidates.length) {
                continue;
            }
            let chosen = candidates[0];
            for (const source of priorityList) {
                const match = candidates.find(p => p.data.source === source);
                if (match) {
                    chosen = match;
                    break;
                }
            }
            const chosenData = chosen.data;
            if (!chosenData.rawProfile.nodes.length) {
                continue;
            }
            const indexStack = [];
            const profileModel = new CPUProfile.CPUProfileDataModel.CPUProfileDataModel(chosenData.rawProfile);
            const profileTree = Helpers.TreeHelpers.makeEmptyTraceEntryTree();
            profileTree.maxDepth = profileModel.maxDepth;
            const selectedProfileId = chosen.id;
            const finalizedData = {
                rawProfile: chosenData.rawProfile,
                parsedProfile: profileModel,
                profileCalls: [],
                profileTree,
                profileId: selectedProfileId,
            };
            const dataByThread = Platform.MapUtilities.getWithDefault(profilesInProcess, processId, () => new Map());
            dataByThread.set(threadId, finalizedData);
            // Only need to build pure JS ProfileCalls if we're parsing a CPU Profile, otherwise SamplesIntegrator does the work.
            if (parseOptions.isCPUProfile) {
                buildProfileCallsForCPUProfile();
            }
            function buildProfileCallsForCPUProfile() {
                profileModel.forEachFrame(openFrameCallback, closeFrameCallback);
                function openFrameCallback(depth, node, sampleIndex, timeStampMilliseconds) {
                    if (threadId === undefined) {
                        return;
                    }
                    const ts = Helpers.Timing.milliToMicro(Types.Timing.Milli(timeStampMilliseconds));
                    const nodeId = node.id;
                    const profileCall = Helpers.Trace.makeProfileCall(node, selectedProfileId, sampleIndex, ts, processId, threadId);
                    finalizedData.profileCalls.push(profileCall);
                    indexStack.push(finalizedData.profileCalls.length - 1);
                    const traceEntryNode = Helpers.TreeHelpers.makeEmptyTraceEntryNode(profileCall, nodeId);
                    entryToNode.set(profileCall, traceEntryNode);
                    traceEntryNode.depth = depth;
                    if (indexStack.length === 1) {
                        // First call in the stack is a root call.
                        finalizedData.profileTree?.roots.add(traceEntryNode);
                    }
                }
                function closeFrameCallback(_depth, _node, _sampleIndex, _timeStampMillis, durMs, selfTimeMs) {
                    const profileCallIndex = indexStack.pop();
                    const profileCall = profileCallIndex !== undefined && finalizedData.profileCalls[profileCallIndex];
                    if (!profileCall) {
                        return;
                    }
                    const { callFrame, ts, pid, tid } = profileCall;
                    const traceEntryNode = entryToNode.get(profileCall);
                    if (callFrame === undefined || ts === undefined || pid === undefined || selectedProfileId === undefined ||
                        tid === undefined || traceEntryNode === undefined) {
                        return;
                    }
                    const dur = Helpers.Timing.milliToMicro(Types.Timing.Milli(durMs));
                    const selfTime = Helpers.Timing.milliToMicro(Types.Timing.Milli(selfTimeMs));
                    profileCall.dur = dur;
                    traceEntryNode.selfTime = selfTime;
                    const parentIndex = indexStack.at(-1);
                    const parent = parentIndex !== undefined && finalizedData.profileCalls.at(parentIndex);
                    const parentNode = parent && entryToNode.get(parent);
                    if (!parentNode) {
                        return;
                    }
                    traceEntryNode.parent = parentNode;
                    parentNode.children.push(traceEntryNode);
                }
            }
        }
    }
}
export function reset() {
    preprocessedData = new Map();
    profilesInProcess = new Map();
    entryToNode = new Map();
}
export function handleEvent(event) {
    /**
     * A fake trace event created to support CDP.Profiler.Profiles in the
     * trace engine.
     */
    if (Types.Events.isSyntheticCpuProfile(event)) {
        // At the moment we are attaching to a single node target so we
        // should only get a single CPU profile. The values of the process
        // id and thread id are not really important, so we use the data
        // in the fake event. Should multi-thread CPU profiling be supported
        // we could use these fields in the event to pass thread info.
        const profileData = getOrCreatePreProcessedData(event.pid, event.id);
        profileData.rawProfile = event.args.data.cpuProfile;
        profileData.threadId = event.tid;
        return;
    }
    if (Types.Events.isProfile(event)) {
        // Do not use event.args.data.startTime as it is in CLOCK_MONOTONIC domain,
        // but use profileEvent.ts which has been translated to Perfetto's clock
        // domain. Also convert from ms to us.
        // Note: events are collected on a different thread than what's sampled.
        // The correct process and thread ids are specified by the profile.
        const profileData = getOrCreatePreProcessedData(event.pid, event.id);
        profileData.rawProfile.startTime = event.ts;
        profileData.threadId = event.tid;
        assignProfileSourceIfKnown(profileData, event.args?.data?.source);
        return;
    }
    if (Types.Events.isProfileChunk(event)) {
        const profileData = getOrCreatePreProcessedData(event.pid, event.id);
        const cdpProfile = profileData.rawProfile;
        const nodesAndSamples = event.args?.data?.cpuProfile || { samples: [] };
        const samples = nodesAndSamples?.samples || [];
        const traceIds = event.args?.data?.cpuProfile?.trace_ids;
        for (const n of nodesAndSamples?.nodes || []) {
            const lineNumber = typeof n.callFrame.lineNumber === 'undefined' ? -1 : n.callFrame.lineNumber;
            const columnNumber = typeof n.callFrame.columnNumber === 'undefined' ? -1 : n.callFrame.columnNumber;
            const scriptId = String(n.callFrame.scriptId);
            const url = n.callFrame.url || '';
            const node = {
                ...n,
                callFrame: {
                    ...n.callFrame,
                    url,
                    lineNumber,
                    columnNumber,
                    scriptId,
                },
            };
            cdpProfile.nodes.push(node);
        }
        const timeDeltas = event.args.data?.timeDeltas || [];
        const lines = event.args.data?.lines || Array(samples.length).fill(0);
        const columns = event.args.data?.columns || Array(samples.length).fill(0);
        cdpProfile.samples?.push(...samples);
        cdpProfile.timeDeltas?.push(...timeDeltas);
        cdpProfile.lines?.push(...lines);
        cdpProfile.columns?.push(...columns);
        if (traceIds) {
            cdpProfile.traceIds ??= {};
            for (const key in traceIds) {
                cdpProfile.traceIds[key] = traceIds[key];
            }
        }
        if (cdpProfile.samples && cdpProfile.timeDeltas && cdpProfile.samples.length !== cdpProfile.timeDeltas.length) {
            console.error('Failed to parse CPU profile.');
            return;
        }
        if (!cdpProfile.endTime && cdpProfile.timeDeltas) {
            const timeDeltas = cdpProfile.timeDeltas;
            cdpProfile.endTime = timeDeltas.reduce((x, y) => x + y, cdpProfile.startTime);
        }
        assignProfileSourceIfKnown(profileData, event.args?.data?.source);
        return;
    }
}
export async function finalize(parseOptions = {}) {
    parseCPUProfileData(parseOptions);
}
function assignProfileSourceIfKnown(profileData, source) {
    if (Types.Events.VALID_PROFILE_SOURCES.includes(source)) {
        profileData.source = source;
    }
}
export function data() {
    return {
        profilesInProcess,
        entryToNode,
    };
}
function getOrCreatePreProcessedData(processId, profileId) {
    const profileById = Platform.MapUtilities.getWithDefault(preprocessedData, processId, () => new Map());
    return Platform.MapUtilities.getWithDefault(profileById, profileId, () => ({
        rawProfile: {
            startTime: 0,
            endTime: 0,
            nodes: [],
            samples: [],
            timeDeltas: [],
            lines: [],
            columns: [],
        },
        profileId,
    }));
}
/**
 * Returns the name of a function for a given synthetic profile call.
 * We first look to find the ProfileNode representing this call, and use its
 * function name. This is preferred (and should always exist) because if we
 * resolve sourcemaps, we will update this name. If that name is not present,
 * we fall back to the function name that was in the callframe that we got
 * when parsing the profile's trace data.
 */
export function getProfileCallFunctionName(data, entry) {
    const profile = data.profilesInProcess.get(entry.pid)?.get(entry.tid);
    const node = profile?.parsedProfile.nodeById(entry.nodeId);
    if (node?.functionName) {
        return node.functionName;
    }
    return entry.callFrame.functionName;
}
//# sourceMappingURL=SamplesHandler.js.map