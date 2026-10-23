// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
const INITIAL_CONGESTION_WINDOW = 10;
const TCP_SEGMENT_SIZE = 1460;
class TCPConnection {
    warmed;
    ssl;
    multiplexed;
    rtt;
    throughput;
    serverLatency;
    _congestionWindow;
    h2OverflowBytesDownloaded;
    constructor(rtt, throughput, serverLatency = 0, ssl = true, multiplexed = false) {
        this.warmed = false;
        this.ssl = ssl;
        this.multiplexed = multiplexed;
        this.rtt = rtt;
        this.throughput = throughput;
        this.serverLatency = serverLatency;
        this._congestionWindow = INITIAL_CONGESTION_WINDOW;
        this.h2OverflowBytesDownloaded = 0;
    }
    static maximumSaturatedConnections(rtt, availableThroughput) {
        const roundTripsPerSecond = 1000 / rtt;
        const bytesPerRoundTrip = TCP_SEGMENT_SIZE;
        const bytesPerSecond = roundTripsPerSecond * bytesPerRoundTrip;
        const minimumThroughputRequiredPerRequest = bytesPerSecond * 8;
        return Math.floor(availableThroughput / minimumThroughputRequiredPerRequest);
    }
    computeMaximumCongestionWindowInSegments() {
        const bytesPerSecond = this.throughput / 8;
        const secondsPerRoundTrip = this.rtt / 1000;
        const bytesPerRoundTrip = bytesPerSecond * secondsPerRoundTrip;
        return Math.floor(bytesPerRoundTrip / TCP_SEGMENT_SIZE);
    }
    setThroughput(throughput) {
        this.throughput = throughput;
    }
    setCongestionWindow(congestion) {
        this._congestionWindow = congestion;
    }
    setWarmed(warmed) {
        this.warmed = warmed;
    }
    isMultiplexed() {
        return this.multiplexed;
    }
    get congestionWindow() {
        return this._congestionWindow;
    }
    /**
     * Sets the number of excess bytes that are available to this connection on future downloads, only
     * applies to multiplexed (H2/H3) connections.
     */
    setH2OverflowBytesDownloaded(bytes) {
        if (!this.multiplexed) {
            return;
        }
        this.h2OverflowBytesDownloaded = bytes;
    }
    clone() {
        return Object.assign(new TCPConnection(this.rtt, this.throughput), this);
    }
    /**
     * Simulates a network download of a particular number of bytes over an optional maximum amount of time
     * and returns information about the ending state.
     *
     * See https://hpbn.co/building-blocks-of-tcp/#three-way-handshake and
     *  https://hpbn.co/transport-layer-security-tls/#tls-handshake for details.
     */
    simulateDownloadUntil(bytesToDownload, options) {
        const { timeAlreadyElapsed = 0, maximumTimeToElapse = Infinity, dnsResolutionTime = 0 } = options || {};
        if (this.multiplexed) {
            bytesToDownload -= this.h2OverflowBytesDownloaded;
        }
        const twoWayLatency = this.rtt;
        const oneWayLatency = twoWayLatency / 2;
        const maximumCongestionWindow = this.computeMaximumCongestionWindowInSegments();
        let handshakeAndRequest = oneWayLatency;
        if (!this.warmed) {
            handshakeAndRequest =
                // DNS lookup
                dnsResolutionTime +
                    // SYN
                    oneWayLatency +
                    // SYN ACK
                    oneWayLatency +
                    // ACK + initial request
                    oneWayLatency +
                    // ClientHello/ServerHello assuming TLS False Start is enabled (https://istlsfastyet.com/#server-performance).
                    (this.ssl ? twoWayLatency : 0);
        }
        let roundTrips = Math.ceil(handshakeAndRequest / twoWayLatency);
        let timeToFirstByte = handshakeAndRequest + this.serverLatency + oneWayLatency;
        if (this.warmed && this.multiplexed) {
            timeToFirstByte = 0;
        }
        const timeElapsedForTTFB = Math.max(timeToFirstByte - timeAlreadyElapsed, 0);
        const maximumDownloadTimeToElapse = maximumTimeToElapse - timeElapsedForTTFB;
        let congestionWindow = Math.min(this._congestionWindow, maximumCongestionWindow);
        let totalBytesDownloaded = 0;
        if (timeElapsedForTTFB > 0) {
            totalBytesDownloaded = congestionWindow * TCP_SEGMENT_SIZE;
        }
        else {
            roundTrips = 0;
        }
        let downloadTimeElapsed = 0;
        let bytesRemaining = bytesToDownload - totalBytesDownloaded;
        while (bytesRemaining > 0 && downloadTimeElapsed <= maximumDownloadTimeToElapse) {
            roundTrips++;
            downloadTimeElapsed += twoWayLatency;
            congestionWindow = Math.max(Math.min(maximumCongestionWindow, congestionWindow * 2), 1);
            const bytesDownloadedInWindow = congestionWindow * TCP_SEGMENT_SIZE;
            totalBytesDownloaded += bytesDownloadedInWindow;
            bytesRemaining -= bytesDownloadedInWindow;
        }
        const timeElapsed = timeElapsedForTTFB + downloadTimeElapsed;
        const extraBytesDownloaded = this.multiplexed ? Math.max(totalBytesDownloaded - bytesToDownload, 0) : 0;
        const bytesDownloaded = Math.max(Math.min(totalBytesDownloaded, bytesToDownload), 0);
        let connectionTiming;
        if (!this.warmed) {
            connectionTiming = {
                dnsResolutionTime,
                connectionTime: handshakeAndRequest - dnsResolutionTime,
                sslTime: this.ssl ? twoWayLatency : undefined,
                timeToFirstByte,
            };
        }
        else if (this.multiplexed) {
            // TODO: timing information currently difficult to model for warm h2/h3 connections.
            connectionTiming = {
                timeToFirstByte,
            };
        }
        else {
            connectionTiming = {
                connectionTime: handshakeAndRequest,
                timeToFirstByte,
            };
        }
        return {
            roundTrips,
            timeElapsed,
            bytesDownloaded,
            extraBytesDownloaded,
            congestionWindow,
            connectionTiming,
        };
    }
}
export { TCPConnection };
//# sourceMappingURL=TCPConnection.js.map