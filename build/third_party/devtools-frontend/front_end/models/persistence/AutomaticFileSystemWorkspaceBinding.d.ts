import * as Common from '../../core/common/common.js';
import type * as Platform from '../../core/platform/platform.js';
import type * as SDK from '../../core/sdk/sdk.js';
import type * as TextUtils from '../../core/text_utils/text_utils.js';
import * as Workspace from '../workspace/workspace.js';
import { type AutomaticFileSystem, type AutomaticFileSystemManager } from './AutomaticFileSystemManager.js';
import { type IsolatedFileSystemManager } from './IsolatedFileSystemManager.js';
type ContentDataOrError = TextUtils.ContentData.ContentDataOrError;
type SearchMatch = TextUtils.ContentProvider.SearchMatch;
/**
 * Placeholder project that acts as an empty file system within the workspace,
 * and automatically disappears when the user connects the automatic workspace
 * folder.
 *
 * @see AutomaticFileSystemWorkspaceBinding
 */
export declare class FileSystem implements Workspace.Workspace.Project {
    #private;
    readonly automaticFileSystem: Readonly<AutomaticFileSystem>;
    readonly automaticFileSystemManager: AutomaticFileSystemManager;
    constructor(automaticFileSystem: Readonly<AutomaticFileSystem>, automaticFileSystemManager: AutomaticFileSystemManager, workspace: Workspace.Workspace.WorkspaceImpl);
    workspace(): Workspace.Workspace.WorkspaceImpl;
    id(): string;
    type(): Workspace.Workspace.projectTypes;
    isServiceProject(): boolean;
    securityOrigin(): SDK.SecurityOrigin.SecurityOrigin | null;
    displayName(): string;
    requestMetadata(_uiSourceCode: Workspace.UISourceCode.UISourceCode): Promise<Workspace.UISourceCode.UISourceCodeMetadata | null>;
    requestFileContent(_uiSourceCode: Workspace.UISourceCode.UISourceCode): Promise<ContentDataOrError>;
    canSetFileContent(): boolean;
    setFileContent(_uiSourceCode: Workspace.UISourceCode.UISourceCode, _newContent: string, _isBase64: boolean): Promise<void>;
    fullDisplayName(_uiSourceCode: Workspace.UISourceCode.UISourceCode): string;
    mimeType(_uiSourceCode: Workspace.UISourceCode.UISourceCode): string;
    canRename(): boolean;
    rename(_uiSourceCode: Workspace.UISourceCode.UISourceCode, _newName: Platform.DevToolsPath.RawPathString, _callback: (arg0: boolean, arg1?: string, arg2?: Platform.DevToolsPath.UrlString, arg3?: Common.ResourceType.ResourceType) => void): void;
    excludeFolder(_path: Platform.DevToolsPath.UrlString): void;
    canExcludeFolder(_path: Platform.DevToolsPath.EncodedPathString): boolean;
    createFile(_path: Platform.DevToolsPath.EncodedPathString, _name: string | null, _content: string, _isBase64?: boolean): Promise<Workspace.UISourceCode.UISourceCode | null>;
    canCreateFile(): boolean;
    deleteFile(_uiSourceCode: Workspace.UISourceCode.UISourceCode): void;
    deleteDirectoryRecursively(_path: Platform.DevToolsPath.EncodedPathString): Promise<boolean>;
    remove(): void;
    removeUISourceCode(_url: Platform.DevToolsPath.UrlString): void;
    searchInFileContent(_uiSourceCode: Workspace.UISourceCode.UISourceCode, _query: string, _caseSensitive: boolean, _isRegex: boolean): Promise<SearchMatch[]>;
    findFilesMatchingSearchRequest(_searchConfig: Workspace.SearchConfig.SearchConfig, _filesMatchingFileQuery: Workspace.UISourceCode.UISourceCode[], progress: Common.Progress.Progress): Promise<Map<Workspace.UISourceCode.UISourceCode, SearchMatch[] | null>>;
    indexContent(progress: Common.Progress.Progress): void;
    uiSourceCodeForURL(_url: Platform.DevToolsPath.UrlString): Workspace.UISourceCode.UISourceCode | null;
    uiSourceCodes(): Iterable<Workspace.UISourceCode.UISourceCode>;
}
/**
 * Provides a transient workspace `Project` that doesn't contain any `UISourceCode`s,
 * and only acts as a placeholder for the automatic file system, while it's not
 * connected yet. The placeholder project automatically disappears as soon as
 * the automatic file system is connected successfully.
 */
export declare class AutomaticFileSystemWorkspaceBinding {
    #private;
    /**
     * @internal
     */
    constructor(automaticFileSystemManager: AutomaticFileSystemManager, isolatedFileSystemManager: IsolatedFileSystemManager, workspace: Workspace.Workspace.WorkspaceImpl);
    /**
     * Yields the `AutomaticFileSystemWorkspaceBinding` singleton.
     *
     * @returns the singleton.
     */
    static instance({ forceNew, automaticFileSystemManager, isolatedFileSystemManager, workspace }?: {
        forceNew: boolean | null;
        automaticFileSystemManager: AutomaticFileSystemManager | null;
        isolatedFileSystemManager: IsolatedFileSystemManager | null;
        workspace: Workspace.Workspace.WorkspaceImpl | null;
    }): AutomaticFileSystemWorkspaceBinding;
    /**
     * Clears the `AutomaticFileSystemWorkspaceBinding` singleton (if any);
     */
    static removeInstance(): void;
}
export {};
