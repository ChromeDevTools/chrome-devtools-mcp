export interface HistoryEntry {
    valid(): boolean;
    reveal(): void;
}
export declare class SimpleHistoryManager {
    #private;
    constructor(historyDepth: number);
    private readOnlyLock;
    private releaseReadOnlyLock;
    private getPreviousValidIndex;
    private getNextValidIndex;
    private readOnly;
    empty(): boolean;
    active(): HistoryEntry | null;
    push(entry: HistoryEntry): void;
    canRollback(): boolean;
    canRollover(): boolean;
    rollback(): boolean;
    rollover(): boolean;
}
