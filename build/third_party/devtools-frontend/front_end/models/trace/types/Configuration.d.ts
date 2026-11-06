import type * as Platform from '../../../core/platform/platform.js';
import type * as SDK from '../../../core/sdk/sdk.js';
import type * as Protocol from '../../../generated/protocol.js';
import type * as Lantern from '../lantern/lantern.js';
import type * as File from './File.js';
import type { Milli } from './Timing.js';
export interface Configuration {
    /**
     * Show all events: disable the default filtering which hides and excludes some events.
     */
    showAllEvents: boolean;
    /**
     * Extra detail for RPP developers (eg Trace Event json in Summary, and individual JS Sample events)
     */
    debugMode: boolean;
    /**
     * How many invalidation events will be stored for a layout (or similar) event.
     * On large sites with a lot of DOM there can be thousands of invalidations
     * associated with any given event. It is not useful to show the user 1000s of
     * invalidations in the UI, but it is also expensive for us to hold onto them
     * all, and it helps prevents OOM issues when running in NodeJS
     * [https://github.com/GoogleChrome/lighthouse/issues/16111].
     * Therefore, instead, we store only the latest 20 per event. We do also store
     * the total count, so we can show that, but we'll only ever hold on to the
     * last 20 invalidations (in DESC trace order - so the latest 20 in the trace file)
     *
     * If you set this to 0, we will skip the Invalidations processing entirely.
     * 0 effectively disables the InvalidationsHandler and it will not even
     * attempt to gather or track invalidations.
     */
    maxInvalidationEventsPerEvent: number;
    /**
     * Determines if the AnimationFramesHandler should be enabled. Currently in
     * DevTools we do not use it, so we disable it by default to avoid work that
     * we do not use. If you disable it, you will still see `data.AnimationFrames`
     * from the model, but the contents will be empty.
     */
    enableAnimationsFrameHandler: boolean;
    /**
     * Whether soft-navs are used in the model/insights.
     */
    enableSoftNavigation: boolean;
}
export declare const defaults: () => Configuration;
/**
 * Generates a key that can be used to represent this config in a cache. This is
 * used mainly in tests, where we want to avoid re-parsing a file if we have
 * already processed it with the same configuration.
 */
export declare function configToCacheKey(config: Configuration): string;
export interface ParseOptions {
    showAllEvents?: boolean;
    /**
     * If the trace was just recorded on the current page, rather than an imported file.
     * TODO(paulirish): Maybe remove. This is currently unused by the Processor and Handlers
     * @default false
     */
    isFreshRecording?: boolean;
    /**
     * Whether the processor should yield to the main thread during parsing to keep the UI responsive.
     * This should always remain enabled in production to prevent blocking the UI, but can be disabled
     * in unit tests to speed up test execution.
     * @default true
     */
    yieldToMain?: boolean;
    /**
     * If the trace is a CPU Profile rather than a Chrome tracing trace.
     * @default false
     */
    isCPUProfile?: boolean;
    metadata?: File.MetaData;
    resolveSourceMap?: (params: ResolveSourceMapParams) => Promise<SDK.SourceMap.SourceMap | null>;
    logger?: {
        start: (id: string) => void;
        end: (id: string) => void;
    };
    lanternSettings?: Omit<Lantern.Types.Simulation.Settings, 'networkAnalysis'>;
    /**
     * Used when an Insight needs to format a time to string as part of its
     * output. By default we use the i18n.TimeUtilities in DevTools but this
     * enables it to be overridden, which is useful if you are consuming the trace
     * engine outside of DevTools.
     */
    insightTimeFormatters?: InsightTimeFormatters;
}
export interface InsightTimeFormatters {
    milli: (x: Milli) => string;
}
export interface ResolveSourceMapParams {
    scriptId: string;
    scriptUrl: Platform.DevToolsPath.UrlString;
    /** The url as resolved by any sourceUrl comment. */
    sourceUrl: Platform.DevToolsPath.UrlString;
    sourceMapUrl: Platform.DevToolsPath.UrlString;
    frame: Protocol.Page.FrameId;
    /** Set only if the raw source map was found on the provided metadata. Never set for source maps from data urls. */
    cachedRawSourceMap?: SDK.SourceMap.SourceMapV3;
}
