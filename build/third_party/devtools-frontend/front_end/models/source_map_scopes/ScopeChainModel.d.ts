import * as Common from '../../core/common/common.js';
import type * as SDK from '../../core/sdk/sdk.js';
import { type ScopeChainResolver } from './ScopeChainResolver.js';
/**
 * This class is responsible for resolving / updating the scope chain for a specific {@link SDK.DebuggerModel.CallFrame}
 * instance.
 *
 * There are several sources that can influence the scope view:
 *   - Debugger plugins can provide the whole scope info (e.g. from DWARF)
 *   - Source Maps can provide OR augment scope info
 *
 * Source maps can be enabled/disabled dynamically and debugger plugins can attach debug info after the fact.
 *
 * The {@link ScopeChainResolver} tracks all that and invalidates its cache accordingly. This class
 * sends events with the latest scope chain for a specific call frame.
 */
export declare class ScopeChainModel extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    #private;
    constructor(callFrame: SDK.DebuggerModel.CallFrame, scopeChainResolver: ScopeChainResolver);
    dispose(): void;
    resolveScopeChain(): Promise<SDK.DebuggerModel.ScopeChainEntry[]>;
}
export declare const enum Events {
    SCOPE_CHAIN_UPDATED = "ScopeChainUpdated"
}
export interface EventTypes {
    [Events.SCOPE_CHAIN_UPDATED]: ScopeChain;
}
/**
 * A scope chain ready to be shown in the UI with debugging info applied.
 */
export declare class ScopeChain {
    readonly scopeChain: SDK.DebuggerModel.ScopeChainEntry[];
    constructor(scopeChain: SDK.DebuggerModel.ScopeChainEntry[]);
}
