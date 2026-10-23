export interface Progress {
    totalWork: number;
    worked: number;
    title?: string;
    canceled: boolean;
    done: boolean;
}
export declare class Progress implements Progress {
    totalWork: number;
    worked: number;
    title?: string;
    canceled: boolean;
    done: boolean;
}
export declare class CompositeProgress {
    #private;
    readonly parent: Progress;
    constructor(parent: Progress);
    childDone(): void;
    createSubProgress(weight?: number): SubProgress;
    update(): void;
}
export declare class SubProgress implements Progress {
    #private;
    constructor(composite: CompositeProgress, weight?: number);
    get canceled(): boolean;
    set title(title: string);
    set done(done: boolean);
    set totalWork(totalWork: number);
    set worked(worked: number);
    get weight(): number;
    get worked(): number;
    get totalWork(): number;
}
export declare class ProgressProxy implements Progress {
    #private;
    constructor(delegate?: Progress | null, doneCallback?: (() => void), updateCallback?: (() => void));
    get canceled(): boolean;
    set title(title: string);
    get title(): string;
    set done(done: boolean);
    get done(): boolean;
    set totalWork(totalWork: number);
    get totalWork(): number;
    set worked(worked: number);
    get worked(): number;
}
