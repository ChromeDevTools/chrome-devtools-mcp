import * as Types from '../types/types.js';
declare let schedulerToRunEntryPoints: Map<Types.Events.Event, Types.Events.Event[]>;
declare let asyncCallToScheduler: WeakMap<Types.Events.SyntheticProfileCall, {
    taskName: string;
    scheduler: Types.Events.Event;
}>;
declare let runEntryPointToScheduler: WeakMap<Types.Events.Event, {
    taskName: string;
    scheduler: Types.Events.Event;
}>;
export declare function reset(): void;
export declare function handleEvent(_: Types.Events.Event): void;
export declare function finalize(): Promise<void>;
export declare function data(): {
    schedulerToRunEntryPoints: typeof schedulerToRunEntryPoints;
    asyncCallToScheduler: typeof asyncCallToScheduler;
    runEntryPointToScheduler: typeof runEntryPointToScheduler;
};
export declare function deps(): ['Renderer', 'Flows'];
export {};
