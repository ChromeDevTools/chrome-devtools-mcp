import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import type * as Bindings from '../bindings/bindings.js';
/**
 * Resolves and caches the scope chain for {@link SDK.DebuggerModel.CallFrame}s.
 *
 * There is one instance per `Universe`. Caching the resolved scope chain allows different consumers
 * (e.g. the Scope view and the inline values in the editor) to share the exact same
 * {@link SDK.DebuggerModel.ScopeChainEntry} and {@link SDK.RemoteObject.RemoteObject} instances for a
 * given pause, without redundant CDP evaluations.
 *
 * The cache for a script is invalidated whenever debugging info (e.g. from a debugger language plugin)
 * or a source map is attached to or detached from that script. The {@link Events.SCOPE_CHAIN_INVALIDATED}
 * event is dispatched afterwards, so consumers can re-resolve the scope chain.
 */
export declare class ScopeChainResolver extends Common.ObjectWrapper.ObjectWrapper<EventTypes> implements SDK.TargetManager.SDKModelObserver<SDK.DebuggerModel.DebuggerModel> {
    #private;
    constructor(targetManager: SDK.TargetManager.TargetManager, debuggerWorkspaceBinding: Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding);
    /**
     * @deprecated Pass the `ScopeChainResolver` of the `Universe` via constructor instead.
     */
    static instance(): ScopeChainResolver;
    modelAdded(debuggerModel: SDK.DebuggerModel.DebuggerModel): void;
    modelRemoved(debuggerModel: SDK.DebuggerModel.DebuggerModel): void;
    /**
     * Returns the (cached) resolved scope chain for `callFrame`. Repeated calls return the same promise
     * until the cache for the call frame's script is invalidated.
     */
    resolveScopeChain(callFrame: SDK.DebuggerModel.CallFrame): Promise<SDK.DebuggerModel.ScopeChainEntry[]>;
}
export declare const enum Events {
    SCOPE_CHAIN_INVALIDATED = "ScopeChainInvalidated"
}
export interface EventTypes {
    /** Dispatched with the script for which the cached scope chains have been invalidated. */
    [Events.SCOPE_CHAIN_INVALIDATED]: SDK.Script.Script;
}
