// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../../core/platform/platform.js';
import * as Types from '../types/types.js';
// A flow is a logic connection between trace events. We display this
// connection as arrows between trace events belonging to the same flow.
// In the trace event format, flows are represented with pairing "flow
// phase" events. Each flow phase event corresponds to one trace event
// and indicates the role a trace event plays in a flow (start, step or
// end). For each flow, one `start` and one `end` phase events are
// included, while the amount of `step` phase events can be >= 0.
// A flow phase event is assigned to a trace event when their cat, tid,
// pid and ts are equal (see @flowPhaseBindingTokenForEvent ).
// It's possible for a single event to belong to multiple flows. In that
// case, it will have multiple corresponding flow phase events (one
// per flow).
// To parse flows, we first handle flow phase events, by creating unique
// flows with the timestamps of each phase. Then, we place trace events
// in the flows where their corresponding phase events were placed (if
// there are any corresponding flow phase events at all).
let flowDataByGroupToken = new Map();
// Given a trace event's flow binding tuple (timestamp, process id,
// thread id and category) we determine if there is any flow data bound
// to it by using this map's content. It's built when processing flow
// events in a trace.
// An alternative to having a map of four levels is having single map
// from a string token built from concatenating the binding data to the
// corresponding flow data. However, this token would be calculated for
// every event in a trace, resulting in a lot of memory overhead and
// major GC triggering. So we are trading off readability for
// performance.
let boundFlowData = new Map();
let flowsById = new Map();
let flowEvents = [];
let nonFlowEvents = [];
let flows = [];
const ID_COMPONENT_SEPARATOR = '-$-';
export function reset() {
    flows = [];
    flowEvents = [];
    nonFlowEvents = [];
    flowDataByGroupToken = new Map();
    boundFlowData = new Map();
    flowsById = new Map();
}
export function handleEvent(event) {
    if (Types.Events.isFlowPhaseEvent(event)) {
        flowEvents.push(event);
        return;
    }
    nonFlowEvents.push(event);
}
function processNonFlowEvent(event) {
    const flowDataForEvent = boundFlowData.get(event.ts)?.get(event.pid)?.get(event.tid)?.get(event.cat);
    if (!flowDataForEvent) {
        return;
    }
    const { flows, bindingParsed } = flowDataForEvent;
    if (bindingParsed) {
        // We only consider the first event for a given flow binding tuple.
        return;
    }
    for (const flowId of flows) {
        const flow = Platform.MapUtilities.getWithDefault(flowsById, flowId, () => new Map());
        flow.set(event.ts, event);
    }
    flowDataForEvent.bindingParsed = true;
}
/**
 * Creates unique flows by tracking flow phase events. A new created
 * flow whenever a flow start phase event is detected.
 * Subsequent flow phase events with the same group token are added to
 * this flow until a flow end phase is detected.
 */
function processFlowEvent(flowPhaseEvent) {
    const flowGroup = flowGroupTokenForFlowPhaseEvent(flowPhaseEvent);
    switch (flowPhaseEvent.ph) {
        case (Types.Events.Phase.FLOW_START): {
            const flowMetadata = { flowId: flowPhaseEvent.id, times: new Map([[flowPhaseEvent.ts, undefined]]) };
            flowDataByGroupToken.set(flowGroup, flowPhaseEvent.id);
            addFlowIdToEventBinding(flowPhaseEvent, flowMetadata.flowId);
            return;
        }
        case (Types.Events.Phase.FLOW_STEP): {
            const flowId = flowDataByGroupToken.get(flowGroup);
            if (flowId === undefined) {
                // Found non-start flow event with no corresponding start flow,
                // start event. Quietly ignore the problematic event.
                return;
            }
            addFlowIdToEventBinding(flowPhaseEvent, flowId);
            return;
        }
        case (Types.Events.Phase.FLOW_END): {
            const flowId = flowDataByGroupToken.get(flowGroup);
            if (flowId === undefined) {
                // Found non-start flow event with no corresponding start flow,
                // start event. Quietly ignore the problematic event.
                return;
            }
            addFlowIdToEventBinding(flowPhaseEvent, flowId);
            // We don't need this data anymore as the flow has been finished,
            // so we can drop it.
            flowDataByGroupToken.delete(flowGroup);
        }
    }
}
/**
 * A single trace event can belong to multiple flows. This method
 * tracks which flows (flowId) an event belongs to given its flow
 * binding tuple (made of its ts, pid, tid and cat).
 */
function addFlowIdToEventBinding(event, flowId) {
    const flowsByPid = Platform.MapUtilities.getWithDefault(boundFlowData, event.ts, () => new Map());
    const flowsByTid = Platform.MapUtilities.getWithDefault(flowsByPid, event.pid, () => new Map());
    const flowsByCat = Platform.MapUtilities.getWithDefault(flowsByTid, event.tid, () => new Map());
    const flowData = Platform.MapUtilities.getWithDefault(flowsByCat, event.cat, () => ({ flows: new Set(), bindingParsed: false }));
    flowData.flows.add(flowId);
}
/**
 * Returns a token to group flow phase events (start, step and end)
 * belonging to the same flow. Flow phase events belonging to the same
 * flow share category, thread id, process id and name.
 *
 * Note that other phase events of other flows can share these
 * attributes too. For this reason, we group flow phase events in
 * cycles. A cycle starts on a flow start phase event and finishes on a
 * flow end phase event. For this reason, flow phase events need to be
 * handled in timestamp order.
 */
function flowGroupTokenForFlowPhaseEvent(event) {
    return `${event.cat}${ID_COMPONENT_SEPARATOR}${event.name}${ID_COMPONENT_SEPARATOR}${event.id}`;
}
export async function finalize() {
    // Order is important: flow events need to be handled first.
    flowEvents.forEach(processFlowEvent);
    nonFlowEvents.forEach(processNonFlowEvent);
    flows = [...flowsById.values()]
        .map(flowMapping => [...flowMapping.values()])
        .map(flow => flow.filter(event => event !== undefined))
        .filter(flow => flow.length > 1);
}
export function data() {
    return {
        flows,
    };
}
//# sourceMappingURL=FlowsHandler.js.map