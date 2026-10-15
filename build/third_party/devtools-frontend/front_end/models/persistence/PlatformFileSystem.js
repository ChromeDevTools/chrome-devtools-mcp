// Copyright 2018 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
const UIStrings = {
    /**
     * @description Assertion error message when failing to load a file.
     */
    unableToReadFilesWithThis: '`PlatformFileSystem` can’t read files',
};
const str_ = i18n.i18n.registerUIStrings('models/persistence/PlatformFileSystem.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export var PlatformFileSystemType;
(function (PlatformFileSystemType) {
    /**
     * Snippets are implemented as a PlatformFileSystem but they are
     * actually stored in the browser's profile directory and do not
     * create files on the actual filesystem.
     *
     * See Sources > Snippets in the UI.
     */
    PlatformFileSystemType["SNIPPETS"] = "snippets";
    /**
     * Overrides is a filesystem that represents a user-selected folder on
     * disk. This folder is used to replace page resources using request
     * interception.
     *
     * See Sources > Overrides in the UI.
     */
    PlatformFileSystemType["OVERRIDES"] = "overrides";
    /**
     * Represents a filesystem for a workspace folder that the user added
     * to DevTools. It can be manually connected or it can be
     * automatically discovered based on the hints found in devtools.json
     * served by the inspected page (see
     * https://goo.gle/devtools-json-design). DevTools tries to map the
     * page content to the content in such folder but does not use request
     * interception for this.
     */
    PlatformFileSystemType["WORKSPACE_PROJECT"] = "workspace-project";
})(PlatformFileSystemType || (PlatformFileSystemType = {}));
export class PlatformFileSystem extends Common.ObjectWrapper.ObjectWrapper {
    #path;
    #type;
    /**
     * True if the filesystem was automatically discovered (see
     * https://goo.gle/devtools-json-design).
     */
    automatic;
    constructor(path, type, automatic) {
        super();
        this.#path = path;
        this.#type = type;
        this.automatic = automatic;
    }
    getMetadata(_path) {
        return Promise.resolve(null);
    }
    initialFilePaths() {
        return [];
    }
    initialGitFolders() {
        return [];
    }
    path() {
        return this.#path;
    }
    embedderPath() {
        throw new Error('Not implemented');
    }
    type() {
        return this.#type;
    }
    async createFile(_path, _name) {
        return await Promise.resolve(null);
    }
    deleteFile(_path) {
        return Promise.resolve(false);
    }
    deleteDirectoryRecursively(_path) {
        return Promise.resolve(false);
    }
    requestFileBlob(_path) {
        return Promise.resolve(null);
    }
    async requestFileContent(_path) {
        return { error: i18nString(UIStrings.unableToReadFilesWithThis) };
    }
    setFileContent(_path, _content, _isBase64) {
        throw new Error('Not implemented');
    }
    renameFile(_path, _newName, callback) {
        callback(false);
    }
    addExcludedFolder(_path) {
    }
    removeExcludedFolder(_path) {
    }
    fileSystemRemoved() {
    }
    isFileExcluded(_folderPath) {
        return false;
    }
    excludedFolders() {
        return new Set();
    }
    searchInPath(_query, _progress) {
        return Promise.resolve([]);
    }
    indexContent(progress) {
        queueMicrotask(() => {
            progress.done = true;
        });
    }
    mimeFromPath(_path) {
        throw new Error('Not implemented');
    }
    canExcludeFolder(_path) {
        return false;
    }
    contentType(_path) {
        throw new Error('Not implemented');
    }
    tooltipForURL(_url) {
        throw new Error('Not implemented');
    }
    supportsAutomapping() {
        throw new Error('Not implemented');
    }
}
//# sourceMappingURL=PlatformFileSystem.js.map