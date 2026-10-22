import * as Types from '../types/types.js';
export interface WorkersData {
    workerSessionIdEvents: readonly Types.Events.TracingSessionIdForWorker[];
    workerIdByThread: Map<Types.Events.ThreadID, Types.Events.WorkerId>;
    workerURLById: Map<Types.Events.WorkerId, string>;
}
export declare function reset(): void;
export declare function handleEvent(event: Types.Events.Event): void;
export declare function finalize(): Promise<void>;
export declare function data(): WorkersData;
