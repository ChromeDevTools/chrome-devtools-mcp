import type { ConnectionTiming } from './SimulationTimingMap.js';
interface DownloadOptions {
    dnsResolutionTime?: number;
    timeAlreadyElapsed?: number;
    maximumTimeToElapse?: number;
}
interface DownloadResults {
    roundTrips: number;
    timeElapsed: number;
    bytesDownloaded: number;
    extraBytesDownloaded: number;
    congestionWindow: number;
    connectionTiming: ConnectionTiming;
}
declare class TCPConnection {
    warmed: boolean;
    ssl: boolean;
    multiplexed: boolean;
    rtt: number;
    throughput: number;
    serverLatency: number;
    _congestionWindow: number;
    h2OverflowBytesDownloaded: number;
    constructor(rtt: number, throughput: number, serverLatency?: number, ssl?: boolean, multiplexed?: boolean);
    static maximumSaturatedConnections(rtt: number, availableThroughput: number): number;
    computeMaximumCongestionWindowInSegments(): number;
    setThroughput(throughput: number): void;
    setCongestionWindow(congestion: number): void;
    setWarmed(warmed: boolean): void;
    isMultiplexed(): boolean;
    get congestionWindow(): number;
    /**
     * Sets the number of excess bytes that are available to this connection on future downloads, only
     * applies to multiplexed (H2/H3) connections.
     */
    setH2OverflowBytesDownloaded(bytes: number): void;
    clone(): TCPConnection;
    /**
     * Simulates a network download of a particular number of bytes over an optional maximum amount of time
     * and returns information about the ending state.
     *
     * See https://hpbn.co/building-blocks-of-tcp/#three-way-handshake and
     *  https://hpbn.co/transport-layer-security-tls/#tls-handshake for details.
     */
    simulateDownloadUntil(bytesToDownload: number, options?: DownloadOptions): DownloadResults;
}
export { TCPConnection };
