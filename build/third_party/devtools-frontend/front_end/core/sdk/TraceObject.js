// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import { ResourceTreeModel } from './ResourceTreeModel.js';
/** A thin wrapper class, mostly to enable instanceof-based revealing of traces to open in Timeline. **/
export class TraceObject {
    traceEvents;
    metadata;
    constructor(payload, meta) {
        if (Array.isArray(payload)) {
            this.traceEvents = payload;
            this.metadata = meta ?? {};
        }
        else {
            this.traceEvents = payload.traceEvents;
            this.metadata = payload.metadata ?? {};
        }
    }
}
/** Another thin wrapper class to enable revealing individual trace events (aka entries) in Timeline panel. **/
export class RevealableEvent {
    event;
    // Only Trace.Types.Events.Event are passed in, but we can't depend on that type from SDK
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    constructor(event) {
        this.event = event;
    }
}
/**
 * Another wrapper class for revealing network requests in Network panel. The reason is the `Open in Network panel`
 * option is handled by the context menu provider, which will add this option for all supporting types. And there are a
 * lot of context menu providers that support `SDK.NetworkRequest.NetworkRequest`, for example `Override content` by
 * PersistenceActions, but we so far just want the one to reveal in network panel, so add a new class which will only be
 * supported by Network panel.
 *
 * Also we want to have a different behavior(select the network request) from the `SDK.NetworkRequest.NetworkRequest`
 * (highlight the network request once).
 */
export class RevealableNetworkRequest {
    networkRequest;
    constructor(networkRequest) {
        this.networkRequest = networkRequest;
    }
    // Only Trace.Types.Events.SyntheticNetworkRequest are passed in, but we can't depend on that type from SDK
    static create(targetManager, event) {
        const syntheticNetworkRequest = event;
        // @ts-expect-error We don't have type checking here to confirm these events have .args.data.url.
        const url = syntheticNetworkRequest.args.data.url;
        const urlWithoutHash = Common.ParsedURL.ParsedURL.urlWithoutHash(url);
        const resource = ResourceTreeModel.resourceForURL(targetManager, url) ??
            ResourceTreeModel.resourceForURL(targetManager, urlWithoutHash);
        const sdkNetworkRequest = resource?.request;
        return sdkNetworkRequest ? new RevealableNetworkRequest(sdkNetworkRequest) : null;
    }
}
//# sourceMappingURL=TraceObject.js.map