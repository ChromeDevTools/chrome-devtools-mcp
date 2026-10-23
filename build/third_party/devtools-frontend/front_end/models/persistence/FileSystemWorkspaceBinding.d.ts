import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import * as TextUtils from '../../core/text_utils/text_utils.js';
import * as Workspace from '../workspace/workspace.js';
import { type IsolatedFileSystemManager } from './IsolatedFileSystemManager.js';
import type { PlatformFileSystem, PlatformFileSystemType } from './PlatformFileSystem.js';
export declare class FileSystemWorkspaceBinding {
    #private;
    readonly isolatedFileSystemManager: IsolatedFileSystemManager;
    constructor(isolatedFileSystemManager: IsolatedFileSystemManager, workspace: Workspace.Workspace.WorkspaceImpl);
    static projectId(fileSystemPath: Platform.DevToolsPath.UrlString): Platform.DevToolsPath.UrlString;
    static relativePath(uiSourceCode: Workspace.UISourceCode.UISourceCode): Platform.DevToolsPath.EncodedPathString[];
    static tooltipForUISourceCode(uiSourceCode: Workspace.UISourceCode.UISourceCode): string;
    static fileSystemType(project: Workspace.Workspace.Project): PlatformFileSystemType;
    static fileSystemSupportsAutomapping(project: Workspace.Workspace.Project): boolean;
    static completeURL(project: Workspace.Workspace.Project, relativePath: string): Platform.DevToolsPath.UrlString;
    static fileSystemPath(projectId: Platform.DevToolsPath.UrlString): Platform.DevToolsPath.UrlString;
    private onFileSystemsLoaded;
    private onFileSystemAdded;
    private addFileSystem;
    private onFileSystemRemoved;
    private fileSystemFilesChanged;
    dispose(): void;
}
export declare class FileSystem extends Workspace.Workspace.ProjectStore {
    #private;
    readonly fileSystemBaseURL: Platform.DevToolsPath.UrlString;
    constructor(fileSystemWorkspaceBinding: FileSystemWorkspaceBinding, isolatedFileSystem: PlatformFileSystem, workspace: Workspace.Workspace.WorkspaceImpl);
    fileSystemPath(): Platform.DevToolsPath.UrlString;
    fileSystem(): PlatformFileSystem;
    mimeType(uiSourceCode: Workspace.UISourceCode.UISourceCode): string;
    initialGitFolders(): Platform.DevToolsPath.UrlString[];
    private filePathForUISourceCode;
    isServiceProject(): boolean;
    requestMetadata(uiSourceCode: Workspace.UISourceCode.UISourceCode): Promise<Workspace.UISourceCode.UISourceCodeMetadata | null>;
    requestFileBlob(uiSourceCode: Workspace.UISourceCode.UISourceCode): Promise<Blob | null>;
    requestFileContent(uiSourceCode: Workspace.UISourceCode.UISourceCode): Promise<TextUtils.ContentData.ContentDataOrError>;
    canSetFileContent(): boolean;
    setFileContent(uiSourceCode: Workspace.UISourceCode.UISourceCode, newContent: string, isBase64: boolean): Promise<void>;
    fullDisplayName(uiSourceCode: Workspace.UISourceCode.UISourceCode): string;
    canRename(): boolean;
    rename(uiSourceCode: Workspace.UISourceCode.UISourceCode, newName: Platform.DevToolsPath.RawPathString, callback: (arg0: boolean, arg1?: string | undefined, arg2?: Platform.DevToolsPath.UrlString | undefined, arg3?: Common.ResourceType.ResourceType | undefined) => void): void;
    searchInFileContent(uiSourceCode: Workspace.UISourceCode.UISourceCode, query: string, caseSensitive: boolean, isRegex: boolean): Promise<TextUtils.ContentProvider.SearchMatch[]>;
    findFilesMatchingSearchRequest(searchConfig: Workspace.SearchConfig.SearchConfig, filesMatchingFileQuery: Workspace.UISourceCode.UISourceCode[], progress: Common.Progress.Progress): Promise<Map<Workspace.UISourceCode.UISourceCode, TextUtils.ContentProvider.SearchMatch[] | null>>;
    indexContent(progress: Common.Progress.Progress): void;
    populate(): void;
    excludeFolder(url: Platform.DevToolsPath.UrlString): void;
    canExcludeFolder(path: Platform.DevToolsPath.EncodedPathString): boolean;
    canCreateFile(): boolean;
    createFile(path: Platform.DevToolsPath.EncodedPathString, name: Platform.DevToolsPath.RawPathString | null, content: string, isBase64?: boolean): Promise<Workspace.UISourceCode.UISourceCode | null>;
    deleteFile(uiSourceCode: Workspace.UISourceCode.UISourceCode): void;
    deleteDirectoryRecursively(path: Platform.DevToolsPath.EncodedPathString): Promise<boolean>;
    remove(): void;
    private addFile;
    fileChanged(path: Platform.DevToolsPath.UrlString): void;
    tooltipForURL(url: Platform.DevToolsPath.UrlString): string;
    dispose(): void;
}
export interface FilesChangedData {
    changed: Platform.MapUtilities.Multimap<Platform.DevToolsPath.UrlString, Platform.DevToolsPath.UrlString>;
    added: Platform.MapUtilities.Multimap<Platform.DevToolsPath.UrlString, Platform.DevToolsPath.UrlString>;
    removed: Platform.MapUtilities.Multimap<Platform.DevToolsPath.UrlString, Platform.DevToolsPath.UrlString>;
}
