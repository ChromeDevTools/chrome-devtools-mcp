import type * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import type * as Protocol from '../../generated/protocol.js';
import * as Bindings from '../bindings/bindings.js';
import * as Trace from '../trace/trace.js';
import type * as Workspace from '../workspace/workspace.js';
interface ResolvedCodeLocationData {
    name: string | null;
    devtoolsLocation: Workspace.UISourceCode.UILocation | null;
    script: SDK.Script.Script | null;
}
export declare class SourceMappingsUpdated extends Event {
    static readonly eventName = "sourcemappingsupdated";
    constructor();
}
/** The code location key is created as a concatenation of its fields. **/
export declare const resolvedCodeLocationDataNames: Map<string, ResolvedCodeLocationData | null>;
export declare class SourceMapsResolver extends EventTarget {
    #private;
    private executionContextNamesByOrigin;
    constructor(parsedTrace: Trace.TraceModel.ParsedTrace, entityMapper?: Trace.EntityMapper.EntityMapper, debuggerWorkspaceBinding?: Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding, targetManager?: SDK.TargetManager.TargetManager);
    static clearResolvedNodeNames(): void;
    static keyForCodeLocation(callFrame: Protocol.Runtime.CallFrame): string;
    /**
     * For trace events containing a call frame / source location
     * (f.e. a stack trace), attempts to obtain the resolved source
     * location based on the those that have been resolved so far from
     * listened source maps.
     *
     * Note that a single deployed URL can map to multiple authored URLs
     * (f.e. if an app is bundled). Thus, beyond a URL we can use code
     * location data like line and column numbers to obtain the specific
     * authored code according to the source mappings.
     *
     * TODO(andoli): This can return incorrect scripts if the target page has been reloaded since the trace.
     */
    static resolvedCodeLocationForCallFrame(callFrame: Protocol.Runtime.CallFrame): ResolvedCodeLocationData | null;
    static resolvedCodeLocationForEntry(entry: Trace.Types.Events.Event): ResolvedCodeLocationData | null;
    static resolvedURLForEntry(parsedTrace: Trace.TraceModel.ParsedTrace, entry: Trace.Types.Events.Event, workspace: Workspace.Workspace.WorkspaceImpl): Platform.DevToolsPath.UrlString | null;
    static codeLocationForEntry(parsedTrace: Trace.TraceModel.ParsedTrace, entry: Trace.Types.Events.Event, workspace: Workspace.Workspace.WorkspaceImpl): {
        url: Platform.DevToolsPath.UrlString;
        line?: number;
        column?: number;
    } | null;
    static storeResolvedCodeDataForCallFrame(callFrame: Protocol.Runtime.CallFrame, resolvedCodeLocationData: ResolvedCodeLocationData): void;
    install(): Promise<void>;
    /**
     * Removes the event listeners and stops tracking newly added sourcemaps.
     * Should be called before destroying an instance of this class to avoid leaks
     * with listeners.
     */
    uninstall(): void;
}
export {};
