export interface ThrottlingSettings {
    DEVTOOLS_RTT_ADJUSTMENT_FACTOR: number;
    DEVTOOLS_THROUGHPUT_ADJUSTMENT_FACTOR: number;
    mobileSlow4G: {
        rttMs: number;
        throughputKbps: number;
        requestLatencyMs: number;
        downloadThroughputKbps: number;
        uploadThroughputKbps: number;
        cpuSlowdownMultiplier: number;
    };
    mobileRegular3G: {
        rttMs: number;
        throughputKbps: number;
        requestLatencyMs: number;
        downloadThroughputKbps: number;
        uploadThroughputKbps: number;
        cpuSlowdownMultiplier: number;
    };
    desktopDense4G: {
        rttMs: number;
        throughputKbps: number;
        cpuSlowdownMultiplier: number;
        requestLatencyMs: number;
        downloadThroughputKbps: number;
        uploadThroughputKbps: number;
    };
}
declare const Constants: {
    throttling: ThrottlingSettings;
};
export { Constants };
