type ReleaseFunction = () => void;
/**
 * Use Mutex class to coordinate local concurrent operations.
 * Once `acquire` promise resolves, you hold the lock and must
 * call `release` function returned by `acquire` to release the
 * lock. Failing to `release` the lock may lead to deadlocks.
 */
export declare class Mutex {
    #private;
    acquire(): Promise<ReleaseFunction>;
    run<T>(action: () => Promise<T>): Promise<T>;
}
export {};
