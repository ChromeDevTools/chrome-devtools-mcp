import type * as ScopesCodec from '../../third_party/source-map-scopes-codec/source-map-scopes-codec.js';
import type { CallFrame, LocationRange, ScopeChainEntry } from './DebuggerModel.js';
import { type RemoteObject, RemoteObjectProperty } from './RemoteObject.js';
export declare class SourceMapScopeChainEntry implements ScopeChainEntry {
    #private;
    /**
     * @param isInnerMostFunction If `scope` is the innermost 'function' scope. Only used for labeling as we name the
     * scope of the paused function 'Local', while other outer 'function' scopes are named 'Closure'.
     * @param scopeNumber The V8 scope in which `scope`s binding expressions must be evaluated. Defaults to the
     * inner-most scope.
     */
    constructor(callFrame: CallFrame, scope: ScopesCodec.OriginalScope, range: ScopesCodec.GeneratedRange | undefined, isInnerMostFunction: boolean, returnValue: RemoteObject | undefined, scopeNumber?: number);
    originalScope(): ScopesCodec.OriginalScope;
    extraProperties(): RemoteObjectProperty[];
    callFrame(): CallFrame;
    type(): string;
    typeName(): string;
    name(): string | undefined;
    range(): LocationRange | null;
    object(): RemoteObject;
    description(): string;
    icon(): string | undefined;
}
