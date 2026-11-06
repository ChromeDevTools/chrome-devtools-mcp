import type { Binding, GeneratedRange, OriginalPosition, OriginalScope, ScopeInfo } from "../scopes.ts";
/**
 * Small utility class to build scope and range trees.
 *
 * This class allows construction of scope/range trees that will be rejected by the encoder.
 * Use this class if you guarantee proper nesting yourself and don't want to pay for the
 * checks, otherwise use the `SafeScopeInfoBuilder`.
 *
 * This class will also silently ignore calls that would fail otherwise. E.g. calling
 * `end*` without a matching `start*`.
 */
export declare class ScopeInfoBuilder {
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
    /**
     * @returns The OriginalScope opened with the most recent `startScope` call, but not yet closed.
     */
    currentScope(): OriginalScope | null;
    /**
     * @returns The most recent OriginalScope closed with `endScope`.
     */
    lastScope(): OriginalScope | null;
    /**
     * @param option The definition 'scope' of this range can either be the "OriginalScope" directly
     * (produced by this builder) or the scope's key set while building the scope.
     */
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
    protected get currentSourceScopes(): ReadonlyArray<OriginalScope> | null;
    protected get scopeStack(): ReadonlyArray<OriginalScope>;
    protected get rangeStack(): ReadonlyArray<GeneratedRange>;
    protected isKnownScope(scope: OriginalScope): boolean;
    protected isValidScopeKey(key: ScopeKey): boolean;
    protected getScopeByValidKey(key: ScopeKey): OriginalScope;
}
/**
 * Users of the {@link ScopeInfoBuilder} can provide their own keys to uniquely identify a scope,
 * and use the key later when building the corresponding range to connect them.
 *
 * The only requirement for ScopeKey is that it can be used as a key in a `Map`.
 */
export type ScopeKey = unknown;
