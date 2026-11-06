export type ConstructorT<T> = new (...args: any[]) => T;
/**
 * Container for singletons scoped to a single DevTools universe.
 *
 * When wiring up dependencies, strongly prefer to pass all direct dependencies
 * via constructor, and not just pass a {@link DevToolsContext} around. That would hide
 * dependencies and we want to be explicit.
 */
export interface DevToolsContext {
    get<T>(ctor: ConstructorT<T>): T;
}
/**
 * The actual implementation. Should only be accessed by test-setup code or the bootstrapper.
 */
export declare class WritableDevToolsContext implements DevToolsContext {
    #private;
    get<T>(ctor: ConstructorT<T>): T;
    /** @deprecated Should only be used by existing `instance` accessors. */
    has<T>(ctor: ConstructorT<T>): boolean;
    /**
     * Should only be used by existing `instance` accessors and the bootstrapper.
     */
    set<T>(ctor: ConstructorT<T>, instance: T): void;
    /** @deprecated Should only be used by existing `removeInstance` static methods. */
    delete<T>(ctor: ConstructorT<T>): void;
}
/**
 * @deprecated Exists to migrate instance() methods.
 */
export declare function globalInstance(): WritableDevToolsContext;
/**
 * @deprecated Should only be called by test setup and MainImpl
 */
export declare function setGlobalInstance(context: WritableDevToolsContext | null): void;
