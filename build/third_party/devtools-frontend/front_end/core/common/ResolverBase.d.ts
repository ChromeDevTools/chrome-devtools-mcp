/**
 * A class that facilitates resolving a id to an object of type T. If the id does not yet resolve, a promise
 * is created that gets resolved once `onResolve` is called with the corresponding id.
 *
 * This class enables clients to control the duration of the wait and the lifetime of the associated
 * promises by using the `clear` method on this class.
 */
export declare abstract class ResolverBase<Id, T> {
    #private;
    protected abstract getForId(id: Id): T | null;
    protected abstract startListening(): void;
    protected abstract stopListening(): void;
    /**
     * Returns a promise that resolves once the `id` can be resolved to an object.
     */
    waitFor(id: Id): Promise<T>;
    /**
     * Resolve the `id`. Returns the object immediately if it can be resolved,
     * and otherwise waits for the object to appear and calls `callback` once
     * it is resolved.
     */
    tryGet(id: Id, callback: (t: T) => void): T | null;
    /**
     * Aborts all waiting and rejects all unresolved promises.
     */
    clear(): void;
    private getOrCreatePromise;
    protected onResolve(id: Id, t: T): void;
}
