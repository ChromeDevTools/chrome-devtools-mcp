// Copyright 2017 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as Root from '../../core/root/root.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as TextUtils from '../../core/text_utils/text_utils.js';
import * as Diff from '../../third_party/diff/diff.js';
import * as FormatterModule from '../formatter/formatter.js';
import * as Persistence from '../persistence/persistence.js';
import * as Workspace from '../workspace/workspace.js';
export class WorkspaceDiffImpl extends Common.ObjectWrapper.ObjectWrapper {
    #persistence;
    #networkPersistenceManager;
    #settings;
    #diffs = new WeakMap();
    /** used in web tests */
    loadingUISourceCodes = new Map();
    #modified = new Set();
    constructor(workspace, persistence, networkPersistenceManager, settings) {
        super();
        this.#persistence = persistence;
        this.#networkPersistenceManager = networkPersistenceManager;
        this.#settings = settings;
        workspace.addEventListener(Workspace.Workspace.Events.WorkingCopyChanged, this.#uiSourceCodeChanged, this);
        workspace.addEventListener(Workspace.Workspace.Events.WorkingCopyCommitted, this.#uiSourceCodeChanged, this);
        workspace.addEventListener(Workspace.Workspace.Events.UISourceCodeAdded, this.#uiSourceCodeAdded, this);
        workspace.addEventListener(Workspace.Workspace.Events.UISourceCodeRemoved, this.#uiSourceCodeRemoved, this);
        workspace.addEventListener(Workspace.Workspace.Events.ProjectRemoved, this.#projectRemoved, this);
        workspace.uiSourceCodes().forEach(this.#updateModifiedState.bind(this));
    }
    requestDiff(uiSourceCode) {
        return this.#uiSourceCodeDiff(uiSourceCode).requestDiff();
    }
    subscribeToDiffChange(uiSourceCode, callback, thisObj) {
        this.#uiSourceCodeDiff(uiSourceCode).addEventListener("DiffChanged" /* UISourceCodeDiffEvents.DIFF_CHANGED */, callback, thisObj);
    }
    unsubscribeFromDiffChange(uiSourceCode, callback, thisObj) {
        this.#uiSourceCodeDiff(uiSourceCode).removeEventListener("DiffChanged" /* UISourceCodeDiffEvents.DIFF_CHANGED */, callback, thisObj);
    }
    modifiedUISourceCodes() {
        return Array.from(this.#modified);
    }
    #uiSourceCodeDiff(uiSourceCode) {
        let diff = this.#diffs.get(uiSourceCode);
        if (!diff) {
            diff = new UISourceCodeDiff(uiSourceCode, this.#networkPersistenceManager, this.#settings);
            this.#diffs.set(uiSourceCode, diff);
        }
        return diff;
    }
    #uiSourceCodeChanged(event) {
        const uiSourceCode = event.data.uiSourceCode;
        void this.#updateModifiedState(uiSourceCode);
    }
    #uiSourceCodeAdded(event) {
        const uiSourceCode = event.data;
        void this.#updateModifiedState(uiSourceCode);
    }
    #uiSourceCodeRemoved(event) {
        const uiSourceCode = event.data;
        this.#removeUISourceCode(uiSourceCode);
    }
    #projectRemoved(event) {
        const project = event.data;
        for (const uiSourceCode of project.uiSourceCodes()) {
            this.#removeUISourceCode(uiSourceCode);
        }
    }
    #removeUISourceCode(uiSourceCode) {
        this.loadingUISourceCodes.delete(uiSourceCode);
        const uiSourceCodeDiff = this.#diffs.get(uiSourceCode);
        if (uiSourceCodeDiff) {
            uiSourceCodeDiff.dispose = true;
        }
        this.#markAsUnmodified(uiSourceCode);
    }
    #markAsUnmodified(uiSourceCode) {
        this.uiSourceCodeProcessedForTest();
        if (this.#modified.delete(uiSourceCode)) {
            this.dispatchEventToListeners("ModifiedStatusChanged" /* Events.MODIFIED_STATUS_CHANGED */, { uiSourceCode, isModified: false });
        }
    }
    #markAsModified(uiSourceCode) {
        this.uiSourceCodeProcessedForTest();
        if (this.#modified.has(uiSourceCode)) {
            return;
        }
        this.#modified.add(uiSourceCode);
        this.dispatchEventToListeners("ModifiedStatusChanged" /* Events.MODIFIED_STATUS_CHANGED */, { uiSourceCode, isModified: true });
    }
    uiSourceCodeProcessedForTest() {
    }
    #shouldTrack(uiSourceCode) {
        switch (uiSourceCode.project().type()) {
            case Workspace.Workspace.projectTypes.Network:
                // We track differences for all Network resources.
                return this.#persistence.binding(uiSourceCode) === null;
            case Workspace.Workspace.projectTypes.FileSystem:
                // We track differences for FileSystem resources without bindings.
                return true;
            default:
                return false;
        }
    }
    async #updateModifiedState(uiSourceCode) {
        this.loadingUISourceCodes.delete(uiSourceCode);
        if (!this.#shouldTrack(uiSourceCode)) {
            this.#markAsUnmodified(uiSourceCode);
            return;
        }
        if (uiSourceCode.isDirty()) {
            this.#markAsModified(uiSourceCode);
            return;
        }
        if (!uiSourceCode.hasCommits()) {
            this.#markAsUnmodified(uiSourceCode);
            return;
        }
        const contentsPromise = Promise.all([
            this.requestOriginalContentForUISourceCode(uiSourceCode),
            uiSourceCode.requestContentData().then(contentDataOrError => TextUtils.ContentData.ContentData.textOr(contentDataOrError, null)),
        ]);
        this.loadingUISourceCodes.set(uiSourceCode, contentsPromise);
        const contents = await contentsPromise;
        if (this.loadingUISourceCodes.get(uiSourceCode) !== contentsPromise) {
            return;
        }
        this.loadingUISourceCodes.delete(uiSourceCode);
        if (contents[0] !== null && contents[1] !== null && contents[0] !== contents[1]) {
            this.#markAsModified(uiSourceCode);
        }
        else {
            this.#markAsUnmodified(uiSourceCode);
        }
    }
    requestOriginalContentForUISourceCode(uiSourceCode) {
        return this.#uiSourceCodeDiff(uiSourceCode).originalContent();
    }
    revertToOriginal(uiSourceCode) {
        function callback(content) {
            if (typeof content !== 'string') {
                return;
            }
            uiSourceCode.addRevision(content);
        }
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.RevisionApplied);
        return this.requestOriginalContentForUISourceCode(uiSourceCode).then(callback);
    }
}
export class UISourceCodeDiff extends Common.ObjectWrapper.ObjectWrapper {
    #uiSourceCode;
    #networkPersistenceManager;
    #settings;
    #requestDiffPromise = null;
    #pendingChanges;
    dispose = false;
    constructor(uiSourceCode, networkPersistenceManager, settings) {
        super();
        this.#uiSourceCode = uiSourceCode;
        this.#networkPersistenceManager = networkPersistenceManager;
        this.#settings = settings;
        uiSourceCode.addEventListener(Workspace.UISourceCode.Events.WorkingCopyChanged, this.#uiSourceCodeChanged, this);
        uiSourceCode.addEventListener(Workspace.UISourceCode.Events.WorkingCopyCommitted, this.#uiSourceCodeChanged, this);
    }
    #uiSourceCodeChanged() {
        clearTimeout(this.#pendingChanges);
        this.#pendingChanges = undefined;
        this.#requestDiffPromise = null;
        const content = this.#uiSourceCode.content();
        const delay = (!content || content.length < 65536) ? 0 : 200;
        this.#pendingChanges = globalThis.setTimeout(emitDiffChanged.bind(this), delay);
        function emitDiffChanged() {
            if (this.dispose) {
                return;
            }
            this.dispatchEventToListeners("DiffChanged" /* UISourceCodeDiffEvents.DIFF_CHANGED */);
            this.#pendingChanges = undefined;
        }
    }
    requestDiff() {
        if (!this.#requestDiffPromise) {
            this.#requestDiffPromise = this.#requestDiff();
        }
        return this.#requestDiffPromise;
    }
    async originalContent() {
        const originalNetworkContent = this.#networkPersistenceManager.originalContentForUISourceCode(this.#uiSourceCode);
        if (originalNetworkContent) {
            return await originalNetworkContent;
        }
        const content = await this.#uiSourceCode.project().requestFileContent(this.#uiSourceCode);
        if (TextUtils.ContentData.ContentData.isError(content)) {
            return content.error;
        }
        return content.asDeferedContent().content;
    }
    async #requestDiff() {
        if (this.dispose) {
            return null;
        }
        let baseline = await this.originalContent();
        if (baseline === null) {
            return null;
        }
        if (baseline.length > 1024 * 1024) {
            return null;
        }
        // ------------ ASYNC ------------
        if (this.dispose) {
            return null;
        }
        let current = this.#uiSourceCode.workingCopy();
        if (!current && !this.#uiSourceCode.contentLoaded()) {
            const contentDataOrError = await this.#uiSourceCode.requestContentData();
            if (TextUtils.ContentData.ContentData.isError(contentDataOrError)) {
                return null;
            }
            current = contentDataOrError.text;
        }
        if (current.length > 1024 * 1024) {
            return null;
        }
        if (this.dispose) {
            return null;
        }
        const indent = this.#settings.resolve(SDK.SDKSettings.textEditorIndentSettingDescriptor).get();
        baseline = (await FormatterModule.ScriptFormatter.format(this.#uiSourceCode.contentType(), this.#uiSourceCode.mimeType(), baseline, indent))
            .formattedContent;
        const formatCurrentResult = await FormatterModule.ScriptFormatter.format(this.#uiSourceCode.contentType(), this.#uiSourceCode.mimeType(), current, indent);
        current = formatCurrentResult.formattedContent;
        const formattedCurrentMapping = formatCurrentResult.formattedMapping;
        const reNewline = /\r\n?|\n/;
        const diff = Diff.Diff.DiffWrapper.lineDiff(baseline.split(reNewline), current.split(reNewline));
        return {
            diff,
            formattedCurrentMapping,
        };
    }
}
export function workspaceDiff({ forceNew } = {}) {
    if (!Root.DevToolsContext.globalInstance().has(WorkspaceDiffImpl) || forceNew) {
        Root.DevToolsContext.globalInstance().set(WorkspaceDiffImpl, new WorkspaceDiffImpl(
        // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
        Workspace.Workspace.WorkspaceImpl.instance(), 
        // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
        Persistence.Persistence.PersistenceImpl.instance(), 
        // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
        Persistence.NetworkPersistenceManager.NetworkPersistenceManager.instance(), 
        // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
        Common.Settings.Settings.instance()));
    }
    return Root.DevToolsContext.globalInstance().get(WorkspaceDiffImpl);
}
//# sourceMappingURL=WorkspaceDiff.js.map