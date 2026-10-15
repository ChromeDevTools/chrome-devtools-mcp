// Copyright 2016 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as Platform from '../../core/platform/platform.js';
import * as Root from '../../core/root/root.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as TextUtils from '../../core/text_utils/text_utils.js';
import * as Bindings from '../bindings/bindings.js';
import * as BreakpointManager from '../breakpoints/breakpoints.js';
import * as Workspace from '../workspace/workspace.js';
import { Automapping } from './Automapping.js';
export class PersistenceImpl extends Common.ObjectWrapper.ObjectWrapper {
    #workspace;
    #breakpointManager;
    #filePathPrefixesToBindingCount = new FilePathPrefixesBindingCounts();
    #subscribedBindingEventListeners = new Platform.MapUtilities.Multimap();
    #mapping;
    constructor(workspace, breakpointManager) {
        super();
        this.#workspace = workspace;
        this.#breakpointManager = breakpointManager;
        this.#breakpointManager.addUpdateBindingsCallback(this.#setupBindings.bind(this));
        this.#mapping = new Automapping(this.#workspace, this.onStatusAdded.bind(this), this.onStatusRemoved.bind(this));
    }
    static instance(opts = { forceNew: null, workspace: null, breakpointManager: null }) {
        const { forceNew, workspace, breakpointManager } = opts;
        if (!Root.DevToolsContext.globalInstance().has(PersistenceImpl) || forceNew) {
            if (!workspace || !breakpointManager) {
                throw new Error('Missing arguments for workspace');
            }
            Root.DevToolsContext.globalInstance().set(PersistenceImpl, new PersistenceImpl(workspace, breakpointManager));
        }
        return Root.DevToolsContext.globalInstance().get(PersistenceImpl);
    }
    addNetworkInterceptor(interceptor) {
        this.#mapping.addNetworkInterceptor(interceptor);
    }
    refreshAutomapping() {
        this.#mapping.scheduleRemap();
    }
    async addBinding(binding) {
        await this.#addBinding(binding);
    }
    async addBindingForTest(binding) {
        await this.#addBinding(binding);
    }
    async removeBinding(binding) {
        await this.#removeBinding(binding);
    }
    async removeBindingForTest(binding) {
        await this.#removeBinding(binding);
    }
    #setupBindings(networkUISourceCode) {
        if (networkUISourceCode.project().type() !== Workspace.Workspace.projectTypes.Network) {
            return Promise.resolve();
        }
        return this.#mapping.computeNetworkStatus(networkUISourceCode);
    }
    async #addBinding(binding) {
        bindings.set(binding.network, binding);
        bindings.set(binding.fileSystem, binding);
        binding.fileSystem.forceLoadOnCheckContent();
        binding.network.addEventListener(Workspace.UISourceCode.Events.WorkingCopyCommitted, this.onWorkingCopyCommitted, this);
        binding.fileSystem.addEventListener(Workspace.UISourceCode.Events.WorkingCopyCommitted, this.onWorkingCopyCommitted, this);
        binding.network.addEventListener(Workspace.UISourceCode.Events.WorkingCopyChanged, this.onWorkingCopyChanged, this);
        binding.fileSystem.addEventListener(Workspace.UISourceCode.Events.WorkingCopyChanged, this.onWorkingCopyChanged, this);
        this.#filePathPrefixesToBindingCount.add(binding.fileSystem.url());
        await this.moveBreakpoints(binding.fileSystem, binding.network);
        console.assert(!binding.fileSystem.isDirty() || !binding.network.isDirty());
        if (binding.fileSystem.isDirty()) {
            this.syncWorkingCopy(binding.fileSystem);
        }
        else if (binding.network.isDirty()) {
            this.syncWorkingCopy(binding.network);
        }
        else if (binding.network.hasCommits() && binding.network.content() !== binding.fileSystem.content()) {
            binding.network.setWorkingCopy(binding.network.content());
            this.syncWorkingCopy(binding.network);
        }
        this.notifyBindingEvent(binding.network);
        this.notifyBindingEvent(binding.fileSystem);
        this.dispatchEventToListeners(Events.BindingCreated, binding);
    }
    async #removeBinding(binding) {
        if (bindings.get(binding.network) !== binding) {
            return;
        }
        console.assert(bindings.get(binding.network) === bindings.get(binding.fileSystem), 'ERROR: inconsistent binding for networkURL ' + binding.network.url());
        bindings.delete(binding.network);
        bindings.delete(binding.fileSystem);
        binding.network.removeEventListener(Workspace.UISourceCode.Events.WorkingCopyCommitted, this.onWorkingCopyCommitted, this);
        binding.fileSystem.removeEventListener(Workspace.UISourceCode.Events.WorkingCopyCommitted, this.onWorkingCopyCommitted, this);
        binding.network.removeEventListener(Workspace.UISourceCode.Events.WorkingCopyChanged, this.onWorkingCopyChanged, this);
        binding.fileSystem.removeEventListener(Workspace.UISourceCode.Events.WorkingCopyChanged, this.onWorkingCopyChanged, this);
        this.#filePathPrefixesToBindingCount.remove(binding.fileSystem.url());
        await this.#breakpointManager.copyBreakpoints(binding.network, binding.fileSystem);
        this.notifyBindingEvent(binding.network);
        this.notifyBindingEvent(binding.fileSystem);
        this.dispatchEventToListeners(Events.BindingRemoved, binding);
    }
    onStatusAdded(status) {
        const binding = new PersistenceBinding(status.network, status.fileSystem);
        statusBindings.set(status, binding);
        return this.#addBinding(binding);
    }
    async onStatusRemoved(status) {
        const binding = statusBindings.get(status);
        await this.#removeBinding(binding);
    }
    onWorkingCopyChanged(event) {
        const uiSourceCode = event.data;
        this.syncWorkingCopy(uiSourceCode);
    }
    syncWorkingCopy(uiSourceCode) {
        const binding = bindings.get(uiSourceCode);
        if (!binding || mutedWorkingCopies.has(binding)) {
            return;
        }
        const other = binding.network === uiSourceCode ? binding.fileSystem : binding.network;
        if (!uiSourceCode.isDirty()) {
            mutedWorkingCopies.add(binding);
            other.resetWorkingCopy();
            mutedWorkingCopies.delete(binding);
            this.contentSyncedForTest();
            return;
        }
        const target = Bindings.NetworkProject.NetworkProject.targetForUISourceCode(binding.network);
        if (target && target.type() === SDK.Target.Type.NODE) {
            const newContent = uiSourceCode.workingCopy();
            void other.requestContentData().then(() => {
                const nodeJSContent = PersistenceImpl.rewrapNodeJSContent(other, other.workingCopy(), newContent);
                setWorkingCopy.call(this, () => nodeJSContent);
            });
            return;
        }
        setWorkingCopy.call(this, () => uiSourceCode.workingCopy());
        function setWorkingCopy(workingCopyGetter) {
            if (binding) {
                mutedWorkingCopies.add(binding);
            }
            other.setWorkingCopyGetter(workingCopyGetter);
            if (binding) {
                mutedWorkingCopies.delete(binding);
            }
            this.contentSyncedForTest();
        }
    }
    onWorkingCopyCommitted(event) {
        const uiSourceCode = event.data.uiSourceCode;
        const newContent = event.data.content;
        this.syncContent(uiSourceCode, newContent, Boolean(event.data.encoded));
    }
    syncContent(uiSourceCode, newContent, encoded) {
        const binding = bindings.get(uiSourceCode);
        if (!binding || mutedCommits.has(binding)) {
            return;
        }
        const other = binding.network === uiSourceCode ? binding.fileSystem : binding.network;
        const target = Bindings.NetworkProject.NetworkProject.targetForUISourceCode(binding.network);
        if (target && target.type() === SDK.Target.Type.NODE) {
            void other.requestContentData()
                .then(contentDataOrError => TextUtils.ContentData.ContentData.textOr(contentDataOrError, ''))
                .then(currentContent => {
                const nodeJSContent = PersistenceImpl.rewrapNodeJSContent(other, currentContent, newContent);
                setContent.call(this, nodeJSContent);
            });
            return;
        }
        setContent.call(this, newContent);
        function setContent(newContent) {
            if (binding) {
                mutedCommits.add(binding);
            }
            other.setContent(newContent, encoded);
            if (binding) {
                mutedCommits.delete(binding);
            }
            this.contentSyncedForTest();
        }
    }
    static rewrapNodeJSContent(uiSourceCode, currentContent, newContent) {
        if (uiSourceCode.project().type() === Workspace.Workspace.projectTypes.FileSystem) {
            if (newContent.startsWith(NodePrefix) && newContent.endsWith(NodeSuffix)) {
                newContent = newContent.substring(NodePrefix.length, newContent.length - NodeSuffix.length);
            }
            if (currentContent.startsWith(NodeShebang)) {
                newContent = NodeShebang + newContent;
            }
        }
        else {
            if (newContent.startsWith(NodeShebang)) {
                newContent = newContent.substring(NodeShebang.length);
            }
            if (currentContent.startsWith(NodePrefix) && currentContent.endsWith(NodeSuffix)) {
                newContent = NodePrefix + newContent + NodeSuffix;
            }
        }
        return newContent;
    }
    contentSyncedForTest() {
    }
    async moveBreakpoints(from, to) {
        const breakpoints = this.#breakpointManager.breakpointLocationsForUISourceCode(from).map(breakpointLocation => breakpointLocation.breakpoint);
        await Promise.all(breakpoints.map(async (breakpoint) => {
            await breakpoint.remove(false /* keepInStorage */);
            return await this.#breakpointManager.setBreakpoint(to, breakpoint.lineNumber(), breakpoint.columnNumber(), breakpoint.condition(), breakpoint.enabled(), breakpoint.isLogpoint(), "RESTORED" /* BreakpointManager.BreakpointManager.BreakpointOrigin.OTHER */);
        }));
    }
    hasUnsavedCommittedChanges(uiSourceCode) {
        if (this.#workspace.hasResourceContentTrackingExtensions()) {
            return false;
        }
        if (uiSourceCode.project().canSetFileContent()) {
            return false;
        }
        if (bindings.has(uiSourceCode)) {
            return false;
        }
        return Boolean(uiSourceCode.hasCommits());
    }
    binding(uiSourceCode) {
        return bindings.get(uiSourceCode) || null;
    }
    /**
     * Returns whether the UISourceCode has editable content - either its project
     * supports file content changes, or it has a persistence binding to a file system.
     */
    hasEditableContent(uiSourceCode) {
        return uiSourceCode.project().canSetFileContent() || this.binding(uiSourceCode) !== null;
    }
    subscribeForBindingEvent(uiSourceCode, listener) {
        this.#subscribedBindingEventListeners.set(uiSourceCode, listener);
    }
    unsubscribeFromBindingEvent(uiSourceCode, listener) {
        this.#subscribedBindingEventListeners.delete(uiSourceCode, listener);
    }
    notifyBindingEvent(uiSourceCode) {
        if (!this.#subscribedBindingEventListeners.has(uiSourceCode)) {
            return;
        }
        const listeners = Array.from(this.#subscribedBindingEventListeners.get(uiSourceCode));
        for (const listener of listeners) {
            listener.call(null);
        }
    }
    fileSystem(uiSourceCode) {
        const binding = this.binding(uiSourceCode);
        return binding ? binding.fileSystem : null;
    }
    network(uiSourceCode) {
        const binding = this.binding(uiSourceCode);
        return binding ? binding.network : null;
    }
    filePathHasBindings(filePath) {
        return this.#filePathPrefixesToBindingCount.hasBindingPrefix(filePath);
    }
}
class FilePathPrefixesBindingCounts {
    #prefixCounts = new Map();
    getPlatformCanonicalFilePath(path) {
        return Host.Platform.isWin() ? Common.ParsedURL.ParsedURL.toLowerCase(path) : path;
    }
    add(filePath) {
        filePath = this.getPlatformCanonicalFilePath(filePath);
        let relative = '';
        for (const token of filePath.split('/')) {
            relative += token + '/';
            const count = this.#prefixCounts.get(relative) || 0;
            this.#prefixCounts.set(relative, count + 1);
        }
    }
    remove(filePath) {
        filePath = this.getPlatformCanonicalFilePath(filePath);
        let relative = '';
        for (const token of filePath.split('/')) {
            relative += token + '/';
            const count = this.#prefixCounts.get(relative);
            if (count === 1) {
                this.#prefixCounts.delete(relative);
            }
            else if (count !== undefined) {
                this.#prefixCounts.set(relative, count - 1);
            }
        }
    }
    hasBindingPrefix(filePath) {
        filePath = this.getPlatformCanonicalFilePath(filePath);
        if (!filePath.endsWith('/')) {
            filePath = Common.ParsedURL.ParsedURL.concatenate(filePath, '/');
        }
        return this.#prefixCounts.has(filePath);
    }
}
const bindings = new WeakMap();
const statusBindings = new WeakMap();
const mutedCommits = new WeakSet();
const mutedWorkingCopies = new WeakSet();
export const NodePrefix = '(function (exports, require, module, __filename, __dirname) { ';
export const NodeSuffix = '\n});';
export const NodeShebang = '#!/usr/bin/env node';
export var Events;
(function (Events) {
    /* eslint-disable @typescript-eslint/naming-convention -- Used by web_tests. */
    Events["BindingCreated"] = "BindingCreated";
    Events["BindingRemoved"] = "BindingRemoved";
    /* eslint-enable @typescript-eslint/naming-convention */
})(Events || (Events = {}));
export class PersistenceBinding {
    network;
    fileSystem;
    constructor(network, fileSystem) {
        this.network = network;
        this.fileSystem = fileSystem;
    }
}
//# sourceMappingURL=PersistenceImpl.js.map