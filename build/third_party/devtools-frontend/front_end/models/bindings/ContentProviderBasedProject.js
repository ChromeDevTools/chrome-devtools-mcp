// Copyright 2013 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as TextUtils from '../../core/text_utils/text_utils.js';
import * as Workspace from '../workspace/workspace.js';
const UIStrings = {
    /**
     * @description Error message displayed in the Sources panel when a file can't be loaded.
     */
    unknownErrorLoadingFile: 'Unknown error loading file',
};
const str_ = i18n.i18n.registerUIStrings('models/bindings/ContentProviderBasedProject.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class ContentProviderBasedProject extends Workspace.Workspace.ProjectStore {
    #isServiceProject;
    #uiSourceCodeToData = new WeakMap();
    constructor(workspace, id, type, displayName, isServiceProject, securityOrigin) {
        super(workspace, id, type, displayName, securityOrigin);
        this.#isServiceProject = isServiceProject;
        workspace.addProject(this);
    }
    async requestFileContent(uiSourceCode) {
        const { contentProvider } = this.#uiSourceCodeToData.get(uiSourceCode);
        try {
            return await contentProvider.requestContentData();
        }
        catch (err) {
            // TODO(rob.paveza): CRBug 1013683 - Consider propagating exceptions full-stack
            return {
                error: err ? String(err) : i18nString(UIStrings.unknownErrorLoadingFile),
            };
        }
    }
    isServiceProject() {
        return this.#isServiceProject;
    }
    async requestMetadata(uiSourceCode) {
        const { metadata } = this.#uiSourceCodeToData.get(uiSourceCode);
        return metadata;
    }
    canSetFileContent() {
        return false;
    }
    async setFileContent(_uiSourceCode, _newContent, _isBase64) {
    }
    fullDisplayName(uiSourceCode) {
        let parentPath = uiSourceCode.parentURL().replace(/^(?:https?|file)\:\/\//, '');
        try {
            parentPath = decodeURI(parentPath);
        }
        catch {
        }
        return parentPath + '/' + uiSourceCode.displayName(true);
    }
    mimeType(uiSourceCode) {
        const { mimeType } = this.#uiSourceCodeToData.get(uiSourceCode);
        return mimeType;
    }
    canRename() {
        return false;
    }
    rename(_uiSourceCode, _newName, callback) {
        callback(false);
    }
    excludeFolder(_path) {
    }
    canExcludeFolder(_path) {
        return false;
    }
    async createFile(_path, _name, _content, _isBase64) {
        return null;
    }
    canCreateFile() {
        return false;
    }
    deleteFile(_uiSourceCode) {
    }
    remove() {
    }
    searchInFileContent(uiSourceCode, query, caseSensitive, isRegex) {
        const { contentProvider } = this.#uiSourceCodeToData.get(uiSourceCode);
        return contentProvider.searchInContent(query, caseSensitive, isRegex);
    }
    async findFilesMatchingSearchRequest(searchConfig, filesMatchingFileQuery, progress) {
        const result = new Map();
        progress.totalWork = filesMatchingFileQuery.length;
        await Promise.all(filesMatchingFileQuery.map(searchInContent.bind(this)));
        progress.done = true;
        return result;
        async function searchInContent(uiSourceCode) {
            let allMatchesFound = true;
            let matches = [];
            for (const query of searchConfig.queries().slice()) {
                const searchMatches = await this.searchInFileContent(uiSourceCode, query, !searchConfig.ignoreCase(), searchConfig.isRegex());
                if (!searchMatches.length) {
                    allMatchesFound = false;
                    break;
                }
                matches = Platform.ArrayUtilities.mergeOrdered(matches, searchMatches, TextUtils.ContentProvider.SearchMatch.comparator);
            }
            if (allMatchesFound) {
                result.set(uiSourceCode, matches);
            }
            ++progress.worked;
        }
    }
    indexContent(progress) {
        queueMicrotask(() => {
            progress.done = true;
        });
    }
    addUISourceCodeWithProvider(uiSourceCode, contentProvider, metadata, mimeType) {
        this.#uiSourceCodeToData.set(uiSourceCode, { mimeType, metadata, contentProvider });
        this.addUISourceCode(uiSourceCode);
    }
    addContentProvider(url, contentProvider, mimeType) {
        const uiSourceCode = this.createUISourceCode(url, contentProvider.contentType());
        this.addUISourceCodeWithProvider(uiSourceCode, contentProvider, null, mimeType);
        return uiSourceCode;
    }
    reset() {
        this.removeProject();
        this.workspace().addProject(this);
    }
    dispose() {
        this.removeProject();
    }
}
//# sourceMappingURL=ContentProviderBasedProject.js.map