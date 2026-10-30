import type { Binding, OriginalPosition, OriginalScope, ScopeInfo } from "../scopes.ts";
import { ScopeInfoBuilder, type ScopeKey } from "./builder.js";
/**
 * Similar to `ScopeInfoBuilder`, but with checks that scopes/ranges are well
 * nested and don't partially overlap.
 */
export declare class SafeScopeInfoBuilder extends ScopeInfoBuilder {
    #private;
    addNullSource(): this;
    startSource(): this;
    endSource(): this;
    startScope(line: number, column: number, options?: {
        name?: string;
        kind?: string;
        isStackFrame?: boolean;
        variables?: string[];
        key?: ScopeKey;
    }): this;
    setScopeName(name: string): this;
    setScopeKind(kind: string): this;
    setScopeStackFrame(isStackFrame: boolean): this;
    setScopeVariables(variables: string[]): this;
    endScope(line: number, column: number): this;
    startRange(line: number, column: number, options?: {
        scope?: OriginalScope;
        scopeKey?: ScopeKey;
        isStackFrame?: boolean;
        isHidden?: boolean;
        values?: Binding[];
        callSite?: OriginalPosition;
    }): this;
    setRangeDefinitionScope(scope: OriginalScope): this;
    setRangeDefinitionScopeKey(scopeKey: ScopeKey): this;
    setRangeStackFrame(isStackFrame: boolean): this;
    setRangeHidden(isHidden: boolean): this;
    setRangeValues(values: Binding[]): this;
    setRangeCallSite(callSite: OriginalPosition): this;
    endRange(line: number, column: number): this;
    build(): ScopeInfo;
}
