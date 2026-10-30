import { get as getStackTrace } from './StackTraceForEvent.js';
/**
 * There are bugs in the backend tracing that means that network requests are
 * often incorrectly tied to an initiator. This function exists as a utility to
 * look up an event's initiator regardless of the type of event, but also to
 * provide a post-parsing fix for network initiators.
 * The TL;DR is that images injected by a script will incorrectly have their
 * initiator set to the root document. To fix this, we look at the stack trace
 * when the request was sent, and use that.
 */
export function getNetworkInitiator(data, event) {
    const networkHandlerInitiator = data.NetworkRequests.incompleteInitiator.get(event);
    if (networkHandlerInitiator?.args.data.mimeType === 'text/css') {
        // The bugs in tracing & initiators apply mostly to scripts; we have not
        // seen a case where the trace events identify a CSS stylesheet as the
        // initiator that is incorrect. Therefore, if a stylesheet is identified as
        // the initiator, we trust that it is accurate and can exit early.
        return networkHandlerInitiator;
    }
    // For network requests, it is more reliable to calculate the initiator via
    // the stack trace if we have one.
    // We have to use the raw source event (`ResourceSendRequest`) as that is
    // the event with the `sampleStackId` property which is required to
    // calculate this stacktrace correctly.
    const stack = getStackTrace(event.rawSourceEvent, data);
    // If the resource was injected by a script, it will have a parent call
    // frame that points to the script. Otherwise, there is no parent and
    // therefore we fallthrough to looking at the initiator directly on the
    // network request.
    const initiatorCallFrame = stack?.parent?.callFrames.at(0);
    if (!initiatorCallFrame) {
        return networkHandlerInitiator;
    }
    // Find all the requests for the URL we are searching for. Most of the time
    // there is only 1, but there can be multiple requests for the same URL. The
    // filtering by the timestamp ensures that we can never pick an initiator
    // that happened after the initiated event.
    const matchingRequestIds = data.NetworkRequests.requestIdsByURL.get(initiatorCallFrame.url) ?? [];
    const matchingRequests = matchingRequestIds.map(id => data.NetworkRequests.byId.get(id))
        .filter(req => req !== undefined)
        .filter(req => req.ts < event.ts);
    // Now we have filtered and have a list of requests that are before the
    // event, we take the last one - the one closest to the initiated event.
    // In the case that there are >1 requests, this is an educated guess.
    return matchingRequests.at(-1);
}
//# sourceMappingURL=Initiators.js.map