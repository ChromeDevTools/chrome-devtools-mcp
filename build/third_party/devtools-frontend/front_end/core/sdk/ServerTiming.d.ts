import * as Common from '../common/common.js';
import type { NameValue } from './NetworkRequest.js';
/**
 * Represents an authored single server timing metric. https://w3c.github.io/server-timing/#the-server-timing-header-field
 */
export interface ServerTimingMetric {
    /** The name of the metric, a single token */
    name: string;
    /** A human-readable description of the metric. */
    desc?: string;
    /** The duration; milliseconds is recommended. https://w3c.github.io/server-timing/#duration-attribute. */
    dur?: number;
}
export declare const cloudflarePrefix = "(cf) ";
export declare const cloudinaryPrefix = "(cld) ";
export declare class ServerTiming {
    #private;
    metric: string;
    value: number | null;
    description: string | null;
    constructor(metric: string, value: number | null, description: string | null);
    static parseHeaders(headers: NameValue[], devToolsConsole: Common.Console.Console): ServerTiming[] | null;
    static createFromHeaderValue(valueString: string, devToolsConsole?: Common.Console.Console): ServerTimingMetric[];
}
