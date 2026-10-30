import * as Workspace from '../workspace/workspace.js';
export declare class Automapping {
    #private;
    private readonly statuses;
    private readonly sweepThrottler;
    constructor(workspace: Workspace.Workspace.WorkspaceImpl, onStatusAdded: (arg0: AutomappingStatus) => Promise<void>, onStatusRemoved: (arg0: AutomappingStatus) => Promise<void>);
    addNetworkInterceptor(interceptor: (arg0: Workspace.UISourceCode.UISourceCode) => boolean): void;
    scheduleRemap(): void;
    private onSweepHappenedForTest;
    computeNetworkStatus(networkSourceCode: Workspace.UISourceCode.UISourceCode): Promise<void>;
    private prevalidationFailedForTest;
    private onBindingFailedForTest;
}
export declare class AutomappingStatus {
    network: Workspace.UISourceCode.UISourceCode;
    fileSystem: Workspace.UISourceCode.UISourceCode;
    exactMatch: boolean;
    constructor(network: Workspace.UISourceCode.UISourceCode, fileSystem: Workspace.UISourceCode.UISourceCode, exactMatch: boolean);
}
