import * as Common from '../../core/common/common.js';
import type * as Platform from '../../core/platform/platform.js';
import type * as TextUtils from '../../core/text_utils/text_utils.js';
export declare enum PlatformFileSystemType {
    /**
     * Snippets are implemented as a PlatformFileSystem but they are
     * actually stored in the browser's profile directory and do not
     * create files on the actual filesystem.
     *
     * See Sources > Snippets in the UI.
     */
    SNIPPETS = "snippets",
    /**
     * Overrides is a filesystem that represents a user-selected folder on
     * disk. This folder is used to replace page resources using request
     * interception.
     *
     * See Sources > Overrides in the UI.
     */
    OVERRIDES = "overrides",
    /**
     * Represents a filesystem for a workspace folder that the user added
     * to DevTools. It can be manually connected or it can be
     * automatically discovered based on the hints found in devtools.json
     * served by the inspected page (see
     * https://goo.gle/devtools-json-design). DevTools tries to map the
     * page content to the content in such folder but does not use request
     * interception for this.
     */
    WORKSPACE_PROJECT = "workspace-project"
}
export declare const enum Events {
    FILE_SYSTEM_ERROR = "file-system-error"
}
interface EventTypes {
    [Events.FILE_SYSTEM_ERROR]: string;
}
export declare class PlatformFileSystem extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    #private;
    /**
     * True if the filesystem was automatically discovered (see
     * https://goo.gle/devtools-json-design).
     */
    readonly automatic: boolean;
    constructor(path: Platform.DevToolsPath.UrlString, type: PlatformFileSystemType, automatic: boolean);
    getMetadata(_path: Platform.DevToolsPath.EncodedPathString): Promise<{
        modificationTime: Date;
        size: number;
    } | null>;
    initialFilePaths(): Platform.DevToolsPath.EncodedPathString[];
    initialGitFolders(): Platform.DevToolsPath.EncodedPathString[];
    path(): Platform.DevToolsPath.UrlString;
    embedderPath(): Platform.DevToolsPath.RawPathString;
    type(): PlatformFileSystemType;
    createFile(_path: Platform.DevToolsPath.EncodedPathString, _name: Platform.DevToolsPath.RawPathString | null): Promise<Platform.DevToolsPath.EncodedPathString | null>;
    deleteFile(_path: Platform.DevToolsPath.EncodedPathString): Promise<boolean>;
    deleteDirectoryRecursively(_path: Platform.DevToolsPath.EncodedPathString): Promise<boolean>;
    requestFileBlob(_path: Platform.DevToolsPath.EncodedPathString): Promise<Blob | null>;
    requestFileContent(_path: Platform.DevToolsPath.EncodedPathString): Promise<TextUtils.ContentData.ContentDataOrError>;
    setFileContent(_path: Platform.DevToolsPath.EncodedPathString, _content: string, _isBase64: boolean): void;
    renameFile(_path: Platform.DevToolsPath.EncodedPathString, _newName: Platform.DevToolsPath.RawPathString, callback: (arg0: boolean, arg1?: string | undefined) => void): void;
    addExcludedFolder(_path: Platform.DevToolsPath.EncodedPathString): void;
    removeExcludedFolder(_path: Platform.DevToolsPath.EncodedPathString): void;
    fileSystemRemoved(): void;
    isFileExcluded(_folderPath: Platform.DevToolsPath.EncodedPathString): boolean;
    excludedFolders(): Set<Platform.DevToolsPath.EncodedPathString>;
    searchInPath(_query: string, _progress: Common.Progress.Progress): Promise<string[]>;
    indexContent(progress: Common.Progress.Progress): void;
    mimeFromPath(_path: Platform.DevToolsPath.UrlString): string;
    canExcludeFolder(_path: Platform.DevToolsPath.EncodedPathString): boolean;
    contentType(_path: string): Common.ResourceType.ResourceType;
    tooltipForURL(_url: Platform.DevToolsPath.UrlString): string;
    supportsAutomapping(): boolean;
}
export {};
