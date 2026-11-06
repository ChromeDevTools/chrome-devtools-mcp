import type * as Workspace from '../workspace/workspace.js';
export interface LiveLocation {
    update(): Promise<void>;
    uiLocation(): Promise<Workspace.UISourceCode.UILocation | null>;
    dispose(): void;
    isDisposed(): boolean;
}
export declare class LiveLocationWithPool implements LiveLocation {
    #private;
    constructor(updateDelegate: (arg0: LiveLocation) => Promise<void>, locationPool: LiveLocationPool);
    update(): Promise<void>;
    uiLocation(): Promise<Workspace.UISourceCode.UILocation | null>;
    dispose(): void;
    isDisposed(): boolean;
}
export declare class LiveLocationPool {
    #private;
    constructor();
    add(location: LiveLocation): void;
    delete(location: LiveLocation): void;
    has(location: LiveLocation): boolean;
    disposeAll(): void;
}
