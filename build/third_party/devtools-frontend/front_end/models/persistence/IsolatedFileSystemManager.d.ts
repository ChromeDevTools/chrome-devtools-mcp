import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import type { FilesChangedData } from './FileSystemWorkspaceBinding.js';
import { IsolatedFileSystem } from './IsolatedFileSystem.js';
import { type PlatformFileSystem } from './PlatformFileSystem.js';
export declare class IsolatedFileSystemManager extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    #private;
    private readonly callbacks;
    private readonly progresses;
    private fileSystemRequestResolve;
    private readonly fileSystemsLoadedPromise;
    constructor(settings: Common.Settings.Settings, console: Common.Console.Console);
    dispose(): void;
    static instance(opts?: {
        forceNew?: boolean | null;
        settings?: Common.Settings.Settings | null;
        console?: Common.Console.Console | null;
    }): IsolatedFileSystemManager;
    static removeInstance(): void;
    private requestFileSystems;
    addFileSystem(type?: string): Promise<IsolatedFileSystem | null>;
    removeFileSystem(fileSystem: PlatformFileSystem): void;
    waitForFileSystems(): Promise<IsolatedFileSystem[]>;
    addPlatformFileSystem(fileSystemURL: Platform.DevToolsPath.UrlString, fileSystem: PlatformFileSystem): void;
    private onFileSystemAdded;
    private onFileSystemRemoved;
    private onFileSystemFilesChanged;
    fileSystems(): PlatformFileSystem[];
    fileSystem(fileSystemPath: Platform.DevToolsPath.UrlString): PlatformFileSystem | null;
    workspaceFolderExcludePatternSetting(): Common.Settings.RegExpSetting;
    registerCallback(callback: (arg0: Platform.DevToolsPath.RawPathString[]) => void): number;
    registerProgress(progress: Common.Progress.Progress): number;
    private onIndexingTotalWorkCalculated;
    private onIndexingWorked;
    private onIndexingDone;
    private onSearchCompleted;
}
export declare enum Events {
    FileSystemAdded = "FileSystemAdded",
    FileSystemRemoved = "FileSystemRemoved",
    FileSystemFilesChanged = "FileSystemFilesChanged",
    ExcludedFolderAdded = "ExcludedFolderAdded",
    ExcludedFolderRemoved = "ExcludedFolderRemoved",
    FileSystemError = "FileSystemError"
}
export interface EventTypes {
    [Events.FileSystemAdded]: PlatformFileSystem;
    [Events.FileSystemRemoved]: PlatformFileSystem;
    [Events.FileSystemFilesChanged]: FilesChangedData;
    [Events.ExcludedFolderAdded]: Platform.DevToolsPath.EncodedPathString;
    [Events.ExcludedFolderRemoved]: Platform.DevToolsPath.EncodedPathString;
    [Events.FileSystemError]: string;
}
