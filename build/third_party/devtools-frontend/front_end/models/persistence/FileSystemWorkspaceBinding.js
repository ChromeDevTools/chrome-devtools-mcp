// Copyright 2013 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as Platform from '../../core/platform/platform.js';
import * as TextUtils from '../../core/text_utils/text_utils.js';
import * as Workspace from '../workspace/workspace.js';
import { Events } from './IsolatedFileSystemManager.js';
export class FileSystemWorkspaceBinding {
    isolatedFileSystemManager;
    #workspace;
    #eventListeners;
    #boundFileSystems = new Map();
    constructor(isolatedFileSystemManager, workspace) {
        this.isolatedFileSystemManager = isolatedFileSystemManager;
        this.#workspace = workspace;
        this.#eventListeners = [
            this.isolatedFileSystemManager.addEventListener(Events.FileSystemAdded, this.onFileSystemAdded, this),
            this.isolatedFileSystemManager.addEventListener(Events.FileSystemRemoved, this.onFileSystemRemoved, this),
            this.isolatedFileSystemManager.addEventListener(Events.FileSystemFilesChanged, this.fileSystemFilesChanged, this),
        ];
        void this.isolatedFileSystemManager.waitForFileSystems().then(this.onFileSystemsLoaded.bind(this));
    }
    static projectId(fileSystemPath) {
        return fileSystemPath;
    }
    static relativePath(uiSourceCode) {
        const baseURL = uiSourceCode.project().fileSystemBaseURL;
        return Common.ParsedURL.ParsedURL.split(Common.ParsedURL.ParsedURL.sliceUrlToEncodedPathString(uiSourceCode.url(), baseURL.length), '/');
    }
    static tooltipForUISourceCode(uiSourceCode) {
        const fileSystem = uiSourceCode.project().fileSystem();
        return fileSystem.tooltipForURL(uiSourceCode.url());
    }
    static fileSystemType(project) {
        if (project instanceof FileSystem) {
            return project.fileSystem().type();
        }
        throw new TypeError('project is not a FileSystem');
    }
    static fileSystemSupportsAutomapping(project) {
        const fileSystem = project.fileSystem();
        return fileSystem.supportsAutomapping();
    }
    static completeURL(project, relativePath) {
        const fsProject = project;
        return Common.ParsedURL.ParsedURL.concatenate(fsProject.fileSystemBaseURL, relativePath);
    }
    static fileSystemPath(projectId) {
        return projectId;
    }
    onFileSystemsLoaded(fileSystems) {
        for (const fileSystem of fileSystems) {
            this.addFileSystem(fileSystem);
        }
    }
    onFileSystemAdded(event) {
        const fileSystem = event.data;
        this.addFileSystem(fileSystem);
    }
    addFileSystem(fileSystem) {
        const boundFileSystem = new FileSystem(this, fileSystem, this.#workspace);
        this.#boundFileSystems.set(fileSystem.path(), boundFileSystem);
    }
    onFileSystemRemoved(event) {
        const fileSystem = event.data;
        const boundFileSystem = this.#boundFileSystems.get(fileSystem.path());
        if (boundFileSystem) {
            boundFileSystem.dispose();
        }
        this.#boundFileSystems.delete(fileSystem.path());
    }
    fileSystemFilesChanged(event) {
        const paths = event.data;
        for (const fileSystemPath of paths.changed.keysArray()) {
            const fileSystem = this.#boundFileSystems.get(fileSystemPath);
            if (!fileSystem) {
                continue;
            }
            paths.changed.get(fileSystemPath).forEach(path => fileSystem.fileChanged(path));
        }
        for (const fileSystemPath of paths.added.keysArray()) {
            const fileSystem = this.#boundFileSystems.get(fileSystemPath);
            if (!fileSystem) {
                continue;
            }
            paths.added.get(fileSystemPath).forEach(path => fileSystem.fileChanged(path));
        }
        for (const fileSystemPath of paths.removed.keysArray()) {
            const fileSystem = this.#boundFileSystems.get(fileSystemPath);
            if (!fileSystem) {
                continue;
            }
            paths.removed.get(fileSystemPath).forEach(path => fileSystem.removeUISourceCode(path));
        }
    }
    dispose() {
        Common.EventTarget.removeEventListeners(this.#eventListeners);
        for (const fileSystem of this.#boundFileSystems.values()) {
            fileSystem.dispose();
            this.#boundFileSystems.delete(fileSystem.fileSystem().path());
        }
    }
}
export class FileSystem extends Workspace.Workspace.ProjectStore {
    #fileSystem;
    fileSystemBaseURL;
    #fileSystemParentURL;
    #fileSystemWorkspaceBinding;
    #fileSystemPath;
    #creatingFilesGuard = new Set();
    constructor(fileSystemWorkspaceBinding, isolatedFileSystem, workspace) {
        const fileSystemPath = isolatedFileSystem.path();
        const id = FileSystemWorkspaceBinding.projectId(fileSystemPath);
        console.assert(!workspace.project(id));
        const displayName = fileSystemPath.substr(fileSystemPath.lastIndexOf('/') + 1);
        super(workspace, id, Workspace.Workspace.projectTypes.FileSystem, displayName);
        this.#fileSystem = isolatedFileSystem;
        this.fileSystemBaseURL = Common.ParsedURL.ParsedURL.concatenate(this.#fileSystem.path(), '/');
        this.#fileSystemParentURL =
            Common.ParsedURL.ParsedURL.substr(this.fileSystemBaseURL, 0, fileSystemPath.lastIndexOf('/') + 1);
        this.#fileSystemWorkspaceBinding = fileSystemWorkspaceBinding;
        this.#fileSystemPath = fileSystemPath;
        workspace.addProject(this);
        this.populate();
    }
    fileSystemPath() {
        return this.#fileSystemPath;
    }
    fileSystem() {
        return this.#fileSystem;
    }
    mimeType(uiSourceCode) {
        return this.#fileSystem.mimeFromPath(uiSourceCode.url());
    }
    initialGitFolders() {
        return this.#fileSystem.initialGitFolders().map(folder => Common.ParsedURL.ParsedURL.concatenate(this.#fileSystemPath, '/', folder));
    }
    filePathForUISourceCode(uiSourceCode) {
        return Common.ParsedURL.ParsedURL.sliceUrlToEncodedPathString(uiSourceCode.url(), this.#fileSystemPath.length);
    }
    isServiceProject() {
        return false;
    }
    requestMetadata(uiSourceCode) {
        const metadata = sourceCodeToMetadataMap.get(uiSourceCode);
        if (metadata) {
            return metadata;
        }
        const relativePath = this.filePathForUISourceCode(uiSourceCode);
        const promise = this.#fileSystem.getMetadata(relativePath).then(onMetadata);
        sourceCodeToMetadataMap.set(uiSourceCode, promise);
        return promise;
        function onMetadata(metadata) {
            if (!metadata) {
                return null;
            }
            return new Workspace.UISourceCode.UISourceCodeMetadata(metadata.modificationTime, metadata.size);
        }
    }
    requestFileBlob(uiSourceCode) {
        return this.#fileSystem.requestFileBlob(this.filePathForUISourceCode(uiSourceCode));
    }
    requestFileContent(uiSourceCode) {
        const filePath = this.filePathForUISourceCode(uiSourceCode);
        return this.#fileSystem.requestFileContent(filePath);
    }
    canSetFileContent() {
        return true;
    }
    async setFileContent(uiSourceCode, newContent, isBase64) {
        const filePath = this.filePathForUISourceCode(uiSourceCode);
        this.#fileSystem.setFileContent(filePath, newContent, isBase64);
    }
    fullDisplayName(uiSourceCode) {
        const baseURL = uiSourceCode.project().#fileSystemParentURL;
        return uiSourceCode.url().substring(baseURL.length);
    }
    canRename() {
        return true;
    }
    rename(uiSourceCode, newName, callback) {
        if (newName === uiSourceCode.name()) {
            callback(true, uiSourceCode.name(), uiSourceCode.url(), uiSourceCode.contentType());
            return;
        }
        let filePath = this.filePathForUISourceCode(uiSourceCode);
        this.#fileSystem.renameFile(filePath, newName, innerCallback.bind(this));
        function innerCallback(success, newName) {
            if (!success || !newName) {
                callback(false, newName);
                return;
            }
            console.assert(Boolean(newName));
            const slash = filePath.lastIndexOf('/');
            const parentPath = Common.ParsedURL.ParsedURL.substr(filePath, 0, slash);
            filePath = Common.ParsedURL.ParsedURL.encodedFromParentPathAndName(parentPath, newName);
            filePath = Common.ParsedURL.ParsedURL.substr(filePath, 1);
            const newURL = Common.ParsedURL.ParsedURL.concatenate(this.fileSystemBaseURL, filePath);
            const newContentType = this.#fileSystem.contentType(newName);
            this.renameUISourceCode(uiSourceCode, newName);
            callback(true, newName, newURL, newContentType);
        }
    }
    async searchInFileContent(uiSourceCode, query, caseSensitive, isRegex) {
        const filePath = this.filePathForUISourceCode(uiSourceCode);
        const content = await this.#fileSystem.requestFileContent(filePath);
        return TextUtils.TextUtils.performSearchInContentData(content, query, caseSensitive, isRegex);
    }
    async findFilesMatchingSearchRequest(searchConfig, filesMatchingFileQuery, progress) {
        let workingFileSet = filesMatchingFileQuery.map(uiSoureCode => uiSoureCode.url());
        const queriesToRun = searchConfig.queries().slice();
        if (!queriesToRun.length) {
            queriesToRun.push('');
        }
        progress.totalWork = queriesToRun.length;
        for (const query of queriesToRun) {
            const files = await this.#fileSystem.searchInPath(searchConfig.isRegex() ? '' : query, progress);
            files.sort(Platform.StringUtilities.naturalOrderComparator);
            workingFileSet = Platform.ArrayUtilities.intersectOrdered(workingFileSet, files, Platform.StringUtilities.naturalOrderComparator);
            ++progress.worked;
        }
        const result = new Map();
        for (const file of workingFileSet) {
            const uiSourceCode = this.uiSourceCodeForURL(file);
            if (uiSourceCode) {
                result.set(uiSourceCode, null);
            }
        }
        progress.done = true;
        return result;
    }
    indexContent(progress) {
        this.#fileSystem.indexContent(progress);
    }
    populate() {
        const filePaths = this.#fileSystem.initialFilePaths();
        if (filePaths.length === 0) {
            return;
        }
        const chunkSize = 1000;
        const startTime = performance.now();
        reportFileChunk.call(this, 0);
        function reportFileChunk(from) {
            const to = Math.min(from + chunkSize, filePaths.length);
            for (let i = from; i < to; ++i) {
                this.addFile(filePaths[i]);
            }
            if (to < filePaths.length) {
                globalThis.setTimeout(reportFileChunk.bind(this, to), 100);
            }
            else if (this.type() === 'filesystem') {
                Host.userMetrics.workspacesPopulated(performance.now() - startTime);
            }
        }
    }
    excludeFolder(url) {
        let relativeFolder = Common.ParsedURL.ParsedURL.sliceUrlToEncodedPathString(url, this.fileSystemBaseURL.length);
        if (!relativeFolder.startsWith('/')) {
            relativeFolder = Common.ParsedURL.ParsedURL.prepend('/', relativeFolder);
        }
        if (!relativeFolder.endsWith('/')) {
            relativeFolder = Common.ParsedURL.ParsedURL.concatenate(relativeFolder, '/');
        }
        this.#fileSystem.addExcludedFolder(relativeFolder);
        for (const uiSourceCode of this.uiSourceCodes()) {
            if (uiSourceCode.url().startsWith(url)) {
                this.removeUISourceCode(uiSourceCode.url());
            }
        }
    }
    canExcludeFolder(path) {
        return this.#fileSystem.canExcludeFolder(path);
    }
    canCreateFile() {
        return true;
    }
    async createFile(path, name, content, isBase64) {
        const guardFileName = this.#fileSystemPath + path + (!path.endsWith('/') ? '/' : '') + name;
        this.#creatingFilesGuard.add(guardFileName);
        const filePath = await this.#fileSystem.createFile(path, name);
        if (!filePath) {
            return null;
        }
        const uiSourceCode = this.addFile(filePath, content, isBase64);
        this.#creatingFilesGuard.delete(guardFileName);
        return uiSourceCode;
    }
    deleteFile(uiSourceCode) {
        const relativePath = this.filePathForUISourceCode(uiSourceCode);
        void this.#fileSystem.deleteFile(relativePath).then(success => {
            if (success) {
                this.removeUISourceCode(uiSourceCode.url());
            }
        });
    }
    deleteDirectoryRecursively(path) {
        return this.#fileSystem.deleteDirectoryRecursively(path);
    }
    remove() {
        this.#fileSystemWorkspaceBinding.isolatedFileSystemManager.removeFileSystem(this.#fileSystem);
    }
    addFile(filePath, content, isBase64) {
        const contentType = this.#fileSystem.contentType(filePath);
        const uiSourceCode = this.createUISourceCode(Common.ParsedURL.ParsedURL.concatenate(this.fileSystemBaseURL, filePath), contentType);
        if (content !== undefined) {
            uiSourceCode.setContent(content, Boolean(isBase64));
        }
        this.addUISourceCode(uiSourceCode);
        return uiSourceCode;
    }
    fileChanged(path) {
        // Ignore files that are being created but do not have content yet.
        if (this.#creatingFilesGuard.has(path)) {
            return;
        }
        const uiSourceCode = this.uiSourceCodeForURL(path);
        if (!uiSourceCode) {
            const contentType = this.#fileSystem.contentType(path);
            this.addUISourceCode(this.createUISourceCode(path, contentType));
            return;
        }
        sourceCodeToMetadataMap.delete(uiSourceCode);
        void uiSourceCode.checkContentUpdated();
    }
    tooltipForURL(url) {
        return this.#fileSystem.tooltipForURL(url);
    }
    dispose() {
        this.removeProject();
    }
}
const sourceCodeToMetadataMap = new WeakMap();
//# sourceMappingURL=FileSystemWorkspaceBinding.js.map