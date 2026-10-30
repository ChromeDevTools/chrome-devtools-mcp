// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as Root from '../../core/root/root.js';
import * as Workspace from '../workspace/workspace.js';
import { Events as IsolatedFileSystemManagerEvents, } from './IsolatedFileSystemManager.js';
/**
 * Placeholder project that acts as an empty file system within the workspace,
 * and automatically disappears when the user connects the automatic workspace
 * folder.
 *
 * @see AutomaticFileSystemWorkspaceBinding
 */
export class FileSystem {
    automaticFileSystem;
    automaticFileSystemManager;
    #workspace;
    constructor(automaticFileSystem, automaticFileSystemManager, workspace) {
        this.automaticFileSystem = automaticFileSystem;
        this.automaticFileSystemManager = automaticFileSystemManager;
        this.#workspace = workspace;
    }
    workspace() {
        return this.#workspace;
    }
    id() {
        return `${this.type()}:${this.automaticFileSystem.root}:${this.automaticFileSystem.uuid}`;
    }
    type() {
        return Workspace.Workspace.projectTypes.ConnectableFileSystem;
    }
    isServiceProject() {
        return false;
    }
    securityOrigin() {
        return null;
    }
    displayName() {
        const root = this.automaticFileSystem.root.replace(Host.Platform.isWin() ? /[/\\]+$/ : /\/+$/, '');
        let slash = root.lastIndexOf('/');
        if (slash === -1 && Host.Platform.isWin()) {
            slash = root.lastIndexOf('\\');
        }
        return root.substr(slash + 1);
    }
    async requestMetadata(_uiSourceCode) {
        throw new Error('Not implemented');
    }
    async requestFileContent(_uiSourceCode) {
        throw new Error('Not implemented');
    }
    canSetFileContent() {
        return false;
    }
    async setFileContent(_uiSourceCode, _newContent, _isBase64) {
        throw new Error('Not implemented');
    }
    fullDisplayName(_uiSourceCode) {
        throw new Error('Not implemented');
    }
    mimeType(_uiSourceCode) {
        throw new Error('Not implemented');
    }
    canRename() {
        return false;
    }
    rename(_uiSourceCode, _newName, _callback) {
        throw new Error('Not implemented');
    }
    excludeFolder(_path) {
        throw new Error('Not implemented');
    }
    canExcludeFolder(_path) {
        return false;
    }
    async createFile(_path, _name, _content, _isBase64) {
        throw new Error('Not implemented');
    }
    canCreateFile() {
        return false;
    }
    deleteFile(_uiSourceCode) {
        throw new Error('Not implemented');
    }
    async deleteDirectoryRecursively(_path) {
        throw new Error('Not implemented');
    }
    remove() {
    }
    removeUISourceCode(_url) {
        throw new Error('Not implemented');
    }
    async searchInFileContent(_uiSourceCode, _query, _caseSensitive, _isRegex) {
        return [];
    }
    async findFilesMatchingSearchRequest(_searchConfig, _filesMatchingFileQuery, progress) {
        // Defer completion to the next microtask to avoid triggering premature
        // completion events in CompositeProgress setup loops.
        await Promise.resolve();
        progress.done = true;
        return new Map();
    }
    indexContent(progress) {
        // Defer completion to the next microtask to avoid triggering premature
        // completion events in CompositeProgress setup loops.
        queueMicrotask(() => {
            progress.done = true;
        });
    }
    uiSourceCodeForURL(_url) {
        return null;
    }
    uiSourceCodes() {
        return [];
    }
}
/**
 * Provides a transient workspace `Project` that doesn't contain any `UISourceCode`s,
 * and only acts as a placeholder for the automatic file system, while it's not
 * connected yet. The placeholder project automatically disappears as soon as
 * the automatic file system is connected successfully.
 */
export class AutomaticFileSystemWorkspaceBinding {
    #automaticFileSystemManager;
    #fileSystem = null;
    #isolatedFileSystemManager;
    #workspace;
    /**
     * @internal
     */
    constructor(automaticFileSystemManager, isolatedFileSystemManager, workspace) {
        this.#automaticFileSystemManager = automaticFileSystemManager;
        this.#isolatedFileSystemManager = isolatedFileSystemManager;
        this.#workspace = workspace;
        this.#automaticFileSystemManager.addEventListener("AutomaticFileSystemChanged" /* AutomaticFileSystemManagerEvents.AUTOMATIC_FILE_SYSTEM_CHANGED */, this.#update, this);
        this.#isolatedFileSystemManager.addEventListener(IsolatedFileSystemManagerEvents.FileSystemAdded, this.#update, this);
        this.#isolatedFileSystemManager.addEventListener(IsolatedFileSystemManagerEvents.FileSystemRemoved, this.#update, this);
        this.#update();
    }
    /**
     * Yields the `AutomaticFileSystemWorkspaceBinding` singleton.
     *
     * @returns the singleton.
     */
    static instance({ forceNew, automaticFileSystemManager, isolatedFileSystemManager, workspace } = {
        forceNew: false,
        automaticFileSystemManager: null,
        isolatedFileSystemManager: null,
        workspace: null,
    }) {
        if (!Root.DevToolsContext.globalInstance().has(AutomaticFileSystemWorkspaceBinding) || forceNew) {
            if (!automaticFileSystemManager || !isolatedFileSystemManager || !workspace) {
                throw new Error('Unable to create AutomaticFileSystemWorkspaceBinding: ' +
                    'automaticFileSystemManager, isolatedFileSystemManager, ' +
                    'and workspace must be provided');
            }
            const automaticFileSystemWorkspaceBinding = new AutomaticFileSystemWorkspaceBinding(automaticFileSystemManager, isolatedFileSystemManager, workspace);
            Root.DevToolsContext.globalInstance().set(AutomaticFileSystemWorkspaceBinding, automaticFileSystemWorkspaceBinding);
        }
        return Root.DevToolsContext.globalInstance().get(AutomaticFileSystemWorkspaceBinding);
    }
    /**
     * Clears the `AutomaticFileSystemWorkspaceBinding` singleton (if any);
     */
    static removeInstance() {
        if (Root.DevToolsContext.globalInstance().has(AutomaticFileSystemWorkspaceBinding)) {
            const automaticFileSystemWorkspaceBinding = Root.DevToolsContext.globalInstance().get(AutomaticFileSystemWorkspaceBinding);
            automaticFileSystemWorkspaceBinding.#dispose();
            Root.DevToolsContext.globalInstance().delete(AutomaticFileSystemWorkspaceBinding);
        }
    }
    #dispose() {
        if (this.#fileSystem) {
            this.#workspace.removeProject(this.#fileSystem);
        }
        this.#automaticFileSystemManager.removeEventListener("AutomaticFileSystemChanged" /* AutomaticFileSystemManagerEvents.AUTOMATIC_FILE_SYSTEM_CHANGED */, this.#update, this);
        this.#isolatedFileSystemManager.removeEventListener(IsolatedFileSystemManagerEvents.FileSystemAdded, this.#update, this);
        this.#isolatedFileSystemManager.removeEventListener(IsolatedFileSystemManagerEvents.FileSystemRemoved, this.#update, this);
    }
    #update() {
        const automaticFileSystem = this.#automaticFileSystemManager.automaticFileSystem;
        if (this.#fileSystem !== null) {
            if (this.#fileSystem.automaticFileSystem === automaticFileSystem) {
                return;
            }
            this.#workspace.removeProject(this.#fileSystem);
            this.#fileSystem = null;
        }
        if (automaticFileSystem !== null && automaticFileSystem.state !== 'connected') {
            // Check if we already have a (manually added) file system, and if so, don't
            // offer the option to connect the automatic file system.
            const fileSystemURL = Common.ParsedURL.ParsedURL.rawPathToUrlString(automaticFileSystem.root);
            if (this.#isolatedFileSystemManager.fileSystem(fileSystemURL) === null) {
                this.#fileSystem = new FileSystem(automaticFileSystem, this.#automaticFileSystemManager, this.#workspace);
                this.#workspace.addProject(this.#fileSystem);
            }
        }
    }
}
//# sourceMappingURL=AutomaticFileSystemWorkspaceBinding.js.map