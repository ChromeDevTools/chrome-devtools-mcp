import type * as Protocol from '../../../../generated/protocol.js';
export declare const NetworkRequestTypes: {
    readonly XHR: 'XHR';
    readonly Fetch: 'Fetch';
    readonly EventSource: 'EventSource';
    readonly Script: 'Script';
    readonly Stylesheet: 'Stylesheet';
    readonly Image: 'Image';
    readonly Media: 'Media';
    readonly Font: 'Font';
    readonly Document: 'Document';
    readonly TextTrack: 'TextTrack';
    readonly WebSocket: 'WebSocket';
    readonly Other: 'Other';
    readonly Manifest: 'Manifest';
    readonly SignedExchange: 'SignedExchange';
    readonly Ping: 'Ping';
    readonly Preflight: 'Preflight';
    readonly CSPViolationReport: 'CSPViolationReport';
    readonly Prefetch: 'Prefetch';
    readonly FedCM: 'FedCM';
};
export interface TraceEvent {
    name: string;
    args: {
        name?: string;
        data?: {
            frame?: string;
            readyState?: number;
            scriptId?: number;
            stackTrace?: Array<{
                url: string;
            }>;
            url?: string;
        };
    };
    pid: number;
    tid: number;
    /** Timestamp of the event in microseconds. */
    ts: number;
    dur: number;
}
export interface Trace {
    traceEvents: TraceEvent[];
}
export type ResourcePriority = ('VeryLow' | 'Low' | 'Medium' | 'High' | 'VeryHigh');
export type RenderBlocking = ('blocking' | 'non_blocking' | 'in_body_parser_blocking' | 'potentially_blocking' | 'dynamically_injected_non_blocking');
export type ResourceType = keyof typeof NetworkRequestTypes;
type InitiatorType = ('parser' | 'script' | 'preload' | 'SignedExchange' | 'preflight' | 'FedCM' | 'other');
export type ResourceTiming = Protocol.Network.ResourceTiming;
export interface CallStack {
    callFrames: Array<{
        scriptId: string;
        url: string;
        lineNumber: number;
        columnNumber: number;
        functionName: string;
    }>;
    parent?: CallStack;
}
export interface ParsedURL {
    /**
     * Equivalent to a `new URL(url).protocol` BUT w/o the trailing colon (:)
     */
    scheme: string;
    /**
     * Equivalent to a `new URL(url).hostname`
     */
    host: string;
    securityOrigin: string;
}
export type AnyNetworkObject = any;
export interface NetworkRequest<T = AnyNetworkObject> {
    requestId: string;
    connectionId: number;
    connectionReused: boolean;
    url: string;
    protocol: string;
    parsedURL: ParsedURL;
    documentURL: string;
    /** When the renderer process initially discovers a network request, in milliseconds. */
    rendererStartTime: number;
    /**
     * When the network service is about to handle a request, ie. just before going to the
     * HTTP cache or going to the network for DNS/connection setup, in milliseconds.
     */
    networkRequestTime: number;
    /**
     * When the last byte of the response headers is received, in milliseconds.
     * Equal to networkRequestTime if no data is received over the
     * network (ex: cached requests or data urls).
     */
    responseHeadersEndTime: number;
    /** When the last byte of the response body is received, in milliseconds. */
    networkEndTime: number;
    transferSize: number;
    resourceSize: number;
    fromDiskCache: boolean;
    fromMemoryCache: boolean;
    isLinkPreload: boolean;
    finished: boolean;
    failed: boolean;
    statusCode: number;
    /** The network request that redirected to this one */
    redirectSource?: NetworkRequest<T>;
    /** The network request that this one redirected to */
    redirectDestination?: NetworkRequest<T>;
    initiator: {
        type: InitiatorType;
        url?: string;
        stack?: CallStack;
    };
    initiatorRequest?: NetworkRequest<T>;
    /** The chain of network requests that redirected to this one */
    redirects?: NetworkRequest[] | undefined;
    timing?: Protocol.Network.ResourceTiming;
    resourceType?: ResourceType;
    mimeType: string;
    priority: ResourcePriority;
    /**
     * Whether the request is render blocking. Optional because it is not set on
     * Document requests, older traces, or NetworkRequests created from CDP data
     * prior to M145.
     */
    renderBlocking?: RenderBlocking;
    frameId: string | undefined;
    fromWorker: boolean;
    /**
     * Optional value for how long the server took to respond to this request, in ms.
     * When not provided, the server response time is derived from the timing object.
     */
    serverResponseTime?: number;
    /**
     * Implementation-specific canonical data structure that this Lantern NetworkRequest
     * was derived from.
     * Users of Lantern create a NetworkRequest matching this interface,
     * but can store the source-of-truth for their network model in this property.
     * This is then accessible as a read-only property on NetworkNode.
     */
    rawRequest?: T;
}
export declare namespace Simulation {
    interface URL {
        /** URL of the initially requested URL */
        requestedUrl?: string;
        /** URL of the last document request */
        mainDocumentUrl?: string;
    }
    /** Simulation settings that control the amount of network & cpu throttling in the run. */
    interface ThrottlingSettings {
        /** The round trip time in milliseconds. */
        rttMs?: number;
        /** The network throughput in kilobits per second. */
        throughputKbps?: number;
        /** The network request latency in milliseconds. */
        requestLatencyMs?: number;
        /** The network download throughput in kilobits per second. */
        downloadThroughputKbps?: number;
        /** The network upload throughput in kilobits per second. */
        uploadThroughputKbps?: number;
        /** The amount of slowdown applied to the cpu (1/<cpuSlowdownMultiplier>). */
        cpuSlowdownMultiplier?: number;
    }
    interface PrecomputedLanternData {
        additionalRttByOrigin: Record<string, number>;
        serverResponseTimeByOrigin: Record<string, number>;
    }
    interface Settings {
        networkAnalysis: {
            rtt: number;
            additionalRttByOrigin: Map<string, number>;
            serverResponseTimeByOrigin: Map<string, number>;
            throughput: number;
        };
        /** The method used to throttle the network. */
        throttlingMethod: 'devtools' | 'simulate' | 'provided';
        /** The throttling config settings. */
        throttling?: Required<ThrottlingSettings>;
        /** Precomputed lantern estimates to use instead of observed analysis. */
        precomputedLanternData?: PrecomputedLanternData | null;
    }
    interface Options {
        rtt?: number;
        throughput?: number;
        observedThroughput: number;
        maximumConcurrentRequests?: number;
        cpuSlowdownMultiplier?: number;
        layoutTaskMultiplier?: number;
        additionalRttByOrigin?: Map<string, number>;
        serverResponseTimeByOrigin?: Map<string, number>;
    }
    interface ProcessedNavigation {
        timestamps: {
            firstContentfulPaint: number;
            largestContentfulPaint?: number;
        };
        largestContentfulPaintEvt?: {
            args: {
                data?: {
                    type?: string;
                };
            };
        };
    }
    interface NodeTiming {
        startTime: number;
        endTime: number;
        duration: number;
    }
}
export {};
