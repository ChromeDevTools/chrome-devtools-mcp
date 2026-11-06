export declare class Throttler {
    #private;
    constructor(timeout: number);
    get process(): (() => (void | Promise<unknown>)) | null;
    get processCompleted(): Promise<unknown> | null;
    schedule(process: () => (void | Promise<unknown>), scheduling?: Scheduling): Promise<void>;
}
export declare const enum Scheduling {
    DEFAULT = "Default",
    AS_SOON_AS_POSSIBLE = "AsSoonAsPossible",
    DELAYED = "Delayed"
}
