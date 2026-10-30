export interface Runnable {
    run(): Promise<void>;
}
type LateInitializationLoader = () => Promise<Runnable>;
export interface LateInitializableRunnableSetting {
    id: string;
    loadRunnable: LateInitializationLoader;
}
export declare function registerLateInitializationRunnable(setting: LateInitializableRunnableSetting): void;
export declare function maybeRemoveLateInitializationRunnable(runnableId: string): boolean;
export declare function lateInitializationRunnables(): LateInitializationLoader[];
export declare function registerEarlyInitializationRunnable(runnable: () => Runnable): void;
export declare function earlyInitializationRunnables(): Array<() => Runnable>;
export {};
