import type { SecurityOrigin } from './SecurityOrigin.js';
import type { DebugId, SourceMapV3 } from './SourceMap.js';
/** A thin wrapper around the Cache API to store source map JSONs keyed on Debug IDs */
export declare class SourceMapCache {
    #private;
    static create(): SourceMapCache;
    static createForTest(name: string): SourceMapCache;
    private constructor();
    set(debugId: DebugId, scriptOrigin: SecurityOrigin, loaderOrigin: SecurityOrigin, sourceMap: SourceMapV3): Promise<void>;
    get(debugId: DebugId, scriptOrigin: SecurityOrigin, loaderOrigin: SecurityOrigin): Promise<SourceMapV3 | null>;
    disposeForTest(): Promise<void>;
}
