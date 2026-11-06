import type * as Lantern from '../types/types.js';
interface Summary {
    min: number;
    max: number;
    avg: number;
    median: number;
}
interface RTTEstimateOptions {
    /**
     * TCP connection handshake information will be used when available, but in
     * some circumstances this data can be unreliable. This flag exposes an
     * option to ignore the handshake data and use the coarse download/TTFB timing data.
     */
    forceCoarseEstimates?: boolean;
    /**
     * Coarse estimates include lots of extra time and noise multiply by some factor
     * to deflate the estimates a bit.
     */
    coarseEstimateMultiplier?: number;
    /** Useful for testing to isolate the different methods of estimation. */
    useDownloadEstimates?: boolean;
    /** Useful for testing to isolate the different methods of estimation. */
    useSendStartEstimates?: boolean;
    /** Useful for testing to isolate the different methods of estimation. */
    useHeadersEndEstimates?: boolean;
}
interface RequestInfo {
    request: Lantern.NetworkRequest;
    timing: Lantern.ResourceTiming;
    connectionReused?: boolean;
}
declare class NetworkAnalyzer {
    static get summary(): string;
    static groupByOrigin(records: Lantern.NetworkRequest[]): Map<string, Lantern.NetworkRequest[]>;
    static getSummary(values: number[]): Summary;
    static summarize(values: Map<string, number[]>): Map<string, Summary>;
    static estimateValueByOrigin(requests: Lantern.NetworkRequest[], iteratee: (e: RequestInfo) => number | number[] | undefined): Map<string, number[]>;
    /**
     * Estimates the observed RTT to each origin based on how long the connection setup.
     * For h1 and h2, this could includes two estimates - one for the TCP handshake, another for
     * SSL negotiation.
     * For h3, we get only one estimate since QUIC establishes a secure connection in a
     * single handshake.
     * This is the most accurate and preferred method of measurement when the data is available.
     */
    static estimateRTTViaConnectionTiming(info: RequestInfo): number[] | number | undefined;
    /**
     * Estimates the observed RTT to each origin based on how long a download took on a fresh connection.
     * NOTE: this will tend to overestimate the actual RTT quite significantly as the download can be
     * slow for other reasons as well such as bandwidth constraints.
     */
    static estimateRTTViaDownloadTiming(info: RequestInfo): number | undefined;
    /**
     * Estimates the observed RTT to each origin based on how long it took until Chrome could
     * start sending the actual request when a new connection was required.
     * NOTE: this will tend to overestimate the actual RTT as the request can be delayed for other
     * reasons as well such as more SSL handshakes if TLS False Start is not enabled.
     */
    static estimateRTTViaSendStartTiming(info: RequestInfo): number | undefined;
    /**
     * Estimates the observed RTT to each origin based on how long it took until Chrome received the
     * headers of the response (~TTFB).
     * NOTE: this is the most inaccurate way to estimate the RTT, but in some environments it's all
     * we have access to :(
     */
    static estimateRTTViaHeadersEndTiming(info: RequestInfo): number | undefined;
    /**
     * Given the RTT to each origin, estimates the observed server response times.
     */
    static estimateResponseTimeByOrigin(records: Lantern.NetworkRequest[], rttByOrigin: Map<string, number>): Map<string, number[]>;
    static canTrustConnectionInformation(requests: Lantern.NetworkRequest[]): boolean;
    static isMultiplexedProtocol(protocol?: string): boolean;
    /**
     * Returns a map of requestId -> connectionReused, estimating the information if the information
     * available in the records themselves appears untrustworthy.
     */
    static estimateIfConnectionWasReused(records: Lantern.NetworkRequest[], options?: {
        forceCoarseEstimates: boolean;
    }): Map<string, boolean>;
    /**
     * Estimates the RTT to each origin by examining observed network timing information.
     * Attempts to use the most accurate information first and falls back to coarser estimates when it
     * is unavailable.
     */
    static estimateRTTByOrigin(records: Lantern.NetworkRequest[], options?: RTTEstimateOptions): Map<string, Summary>;
    static estimateMinimumRTTByOrigin(records: Lantern.NetworkRequest[], options?: RTTEstimateOptions): Map<string, number>;
    /**
     * Estimates the server response time of each origin. RTT times must be passed in.
     */
    static estimateServerResponseTimeByOrigin(records: Lantern.NetworkRequest[], options: {
        rttByOrigin: Map<string, number>;
    }): Map<string, Summary>;
    /**
     * Computes the average throughput for the given requests in bits/second.
     * Excludes data URI, failed or otherwise incomplete, and cached requests.
     * Returns null if there were no analyzable network requests.
     */
    static estimateThroughput(records: Lantern.NetworkRequest[]): number | null;
    static computeRTTAndServerResponseTime(records: Lantern.NetworkRequest[]): {
        rtt: number;
        additionalRttByOrigin: Map<string, number>;
        serverResponseTimeByOrigin: Map<string, number>;
    };
    static analyze(records: Lantern.NetworkRequest[]): Lantern.Simulation.Settings['networkAnalysis'] | null;
    static findResourceForUrl<T extends Lantern.NetworkRequest>(records: T[], resourceUrl: string): T | undefined;
    static findLastDocumentForUrl<T extends Lantern.NetworkRequest>(records: T[], resourceUrl: string): T | undefined;
    /**
     * Resolves redirect chain given a main document.
     * See: {@link NetworkAnalyzer.findLastDocumentForUrl} for how to retrieve main document.
     */
    static resolveRedirects<T extends Lantern.NetworkRequest>(request: T): T;
}
export { NetworkAnalyzer };
