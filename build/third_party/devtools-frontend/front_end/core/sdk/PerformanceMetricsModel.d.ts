import { SDKModel } from './SDKModel.js';
import { type Target } from './Target.js';
export declare class PerformanceMetricsModel extends SDKModel<void> {
    #private;
    constructor(target: Target);
    enable(): Promise<Object>;
    disable(): Promise<Object>;
    requestMetrics(): Promise<{
        metrics: Map<string, number>;
        timestamp: number;
    }>;
}
