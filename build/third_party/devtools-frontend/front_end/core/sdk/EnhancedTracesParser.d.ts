import type * as Protocol from '../../generated/protocol.js';
import type { HydratingDataPerTarget } from './RehydratingObject.js';
import type { TraceObject } from './TraceObject.js';
interface EventBase {
    cat: string;
    pid: number;
    args: {
        data: object;
    };
    name: string;
}
/**
 * While called 'TargetRundown', this event is emitted for each script that is compiled or evaluated.
 * Within EnhancedTraceParser, this event is used to construct targets and execution contexts (and to associate scripts to frames).
 *
 * See `inspector_target_rundown_event::Data` https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/inspector/inspector_trace_events.cc;l=1189-1232;drc=48d6f7175422b2c969c14258f9f8d5b196c28d18
 */
export interface RundownScriptCompiled extends EventBase {
    cat: 'disabled-by-default-devtools.target-rundown';
    name: 'ScriptCompiled' | 'ModuleEvaluated';
    args: {
        data: {
            frame: Protocol.Page.FrameId;
            frameType: 'page' | 'iframe';
            url: string;
            /**
             * Older traces were a number, but this is an unsigned 64 bit value, so that was a bug.
             * New traces use string instead. See https://crbug.com/447654178.
             */
            isolate: string | number;
            /** AKA V8ContextToken. https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/inspector/inspector_trace_events.cc;l=1229;drc=3c88f61e18b043e70c225d8d57c77832a85e7f58 */
            v8context: string;
            origin: string;
            scriptId: number;
            /** script->World().isMainWorld() */
            isDefault?: boolean;
            contextType?: 'default' | 'isolated' | 'worker';
        };
    };
}
/**
 * When profiling starts, all currently loaded scripts are emitted via this event.
 *
 * See `Script::TraceScriptRundown()` https://source.chromium.org/chromium/chromium/src/+/main:v8/src/objects/script.cc;l=184-220;drc=328f6c467b940f322544567740c9c871064d045c
 */
export interface RundownScript extends EventBase {
    cat: 'disabled-by-default-devtools.v8-source-rundown';
    name: 'ScriptCatchup';
    args: {
        data: {
            /**
             * Older traces were a number, but this is an unsigned 64 bit value, so that was a bug.
             * New traces use string instead. See https://crbug.com/447654178.
             */
            isolate: string | number;
            executionContextId: Protocol.Runtime.ExecutionContextId;
            scriptId: number;
            isModule: boolean;
            /** aka HasSourceURLComment */
            hasSourceUrl: boolean;
            url?: string;
            hash?: string;
            /** value of the sourceURL comment. */
            sourceUrl?: string;
            sourceMapUrl?: string;
            /** If true, the source map url was a data URL, so the `sourceMapUrl` was removed. */
            sourceMapUrlElided?: boolean;
            startLine?: number;
            startColumn?: number;
            endLine?: number;
            endColumn?: number;
        };
    };
}
export interface RundownScriptSource extends EventBase {
    cat: 'disabled-by-default-devtools.v8-source-rundown-sources';
    name: 'ScriptCatchup' | 'LargeScriptCatchup' | 'TooLargeScriptCatchup';
    args: {
        data: {
            isolate: number;
            scriptId: number;
            length?: number;
            sourceText?: string;
        };
    };
}
export declare class EnhancedTracesParser {
    #private;
    static readonly enhancedTraceVersion: number;
    constructor(trace: TraceObject);
    parseEnhancedTrace(): void;
    data(): HydratingDataPerTarget[];
    private resolveSourceMap;
    private getSourceMapFromMetadata;
    private getScriptIsolateId;
    private getExecutionContextIsolateId;
    private isTraceEvent;
    private isRundownScriptCompiled;
    private isRundownScript;
    private isRundownScriptSource;
    private isTracingStartedInBrowser;
    private isFunctionCallEvent;
    private groupContextsAndScriptsUnderTarget;
}
export {};
