// Copyright 2017 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as Platform from '../../core/platform/platform.js';
import * as Root from '../../core/root/root.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as TextUtils from '../../core/text_utils/text_utils.js';
import * as Bindings from '../bindings/bindings.js';
import * as Breakpoints from '../breakpoints/breakpoints.js';
import * as Workspace from '../workspace/workspace.js';
import { FileSystemWorkspaceBinding } from './FileSystemWorkspaceBinding.js';
import { IsolatedFileSystemManager } from './IsolatedFileSystemManager.js';
import { PersistenceBinding, PersistenceImpl } from './PersistenceImpl.js';
const forbiddenUrls = ['chromewebstore.google.com', 'chrome.google.com'];
export const persistenceNetworkOverridesEnabledSettingDescriptor = {
    name: 'persistence-network-overrides-enabled',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
};
export class NetworkPersistenceManager extends Common.ObjectWrapper.ObjectWrapper {
    #bindings = new WeakMap();
    #originalResponseContentPromises = new WeakMap();
    #savingForOverrides = new WeakSet();
    #enabledSetting;
    #workspace;
    #persistence;
    #breakpointManager;
    #targetManager;
    #settings;
    #isolatedFileSystemManager;
    #multitargetNetworkManager;
    #networkUISourceCodeForEncodedPath = new Map();
    #interceptionHandlerBound;
    #updateInterceptionThrottler = new Common.Throttler.Throttler(50);
    #project = null;
    #active = false;
    #enabled = false;
    #eventDescriptors = [];
    #headerOverridesMap = new Map();
    #sourceCodeToBindProcessMutex = new WeakMap();
    #eventDispatchThrottler = new Common.Throttler.Throttler(50);
    #headerOverridesForEventDispatch = new Set();
    constructor(workspace, persistence, breakpointManager, targetManager, settings, isolatedFileSystemManager, multitargetNetworkManager) {
        super();
        this.#workspace = workspace;
        this.#persistence = persistence;
        this.#breakpointManager = breakpointManager;
        this.#targetManager = targetManager;
        this.#settings = settings;
        this.#isolatedFileSystemManager = isolatedFileSystemManager;
        this.#multitargetNetworkManager = multitargetNetworkManager;
        this.#enabledSetting = this.#settings.resolve(persistenceNetworkOverridesEnabledSettingDescriptor);
        this.#enabledSetting.addChangeListener(this.enabledChanged, this);
        this.#interceptionHandlerBound = this.interceptionHandler.bind(this);
        this.#workspace.addEventListener(Workspace.Workspace.Events.ProjectAdded, event => {
            void this.onProjectAdded(event.data);
        });
        this.#workspace.addEventListener(Workspace.Workspace.Events.ProjectRemoved, event => {
            void this.onProjectRemoved(event.data);
        });
        this.#persistence.addNetworkInterceptor(this.canHandleNetworkUISourceCode.bind(this));
        this.#breakpointManager.addUpdateBindingsCallback(this.networkUISourceCodeAdded.bind(this));
        void this.enabledChanged();
        this.#targetManager.observeTargets(this);
    }
    targetAdded() {
        void this.updateActiveProject();
    }
    targetRemoved() {
        void this.updateActiveProject();
    }
    static instance(opts = { forceNew: null, workspace: null }) {
        const { forceNew, workspace } = opts;
        if (!Root.DevToolsContext.globalInstance().has(NetworkPersistenceManager) || forceNew) {
            if (!workspace) {
                throw new Error('Missing workspace for NetworkPersistenceManager');
            }
            Root.DevToolsContext.globalInstance().set(NetworkPersistenceManager, new NetworkPersistenceManager(workspace, 
            // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
            PersistenceImpl.instance(), 
            // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
            Breakpoints.BreakpointManager.BreakpointManager.instance(), 
            // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
            SDK.TargetManager.TargetManager.instance(), 
            // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
            Common.Settings.Settings.instance(), 
            // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
            IsolatedFileSystemManager.instance(), 
            // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
            SDK.NetworkManager.MultitargetNetworkManager.instance()));
        }
        return Root.DevToolsContext.globalInstance().get(NetworkPersistenceManager);
    }
    static removeInstance() {
        Root.DevToolsContext.globalInstance().delete(NetworkPersistenceManager);
    }
    active() {
        return this.#active;
    }
    project() {
        return this.#project;
    }
    originalContentForUISourceCode(uiSourceCode) {
        const binding = this.#bindings.get(uiSourceCode);
        if (!binding) {
            return null;
        }
        const fileSystemUISourceCode = binding.fileSystem;
        return this.#originalResponseContentPromises.get(fileSystemUISourceCode) || null;
    }
    async enabledChanged() {
        if (this.#enabled === this.#enabledSetting.get()) {
            return;
        }
        this.#enabled = this.#enabledSetting.get();
        if (this.#enabled) {
            Host.userMetrics.actionTaken(Host.UserMetrics.Action.PersistenceNetworkOverridesEnabled);
            this.#eventDescriptors = [
                this.#workspace.addEventListener(Workspace.Workspace.Events.UISourceCodeRenamed, event => {
                    void this.uiSourceCodeRenamedListener(event);
                }),
                this.#workspace.addEventListener(Workspace.Workspace.Events.UISourceCodeAdded, event => {
                    void this.uiSourceCodeAdded(event);
                }),
                this.#workspace.addEventListener(Workspace.Workspace.Events.UISourceCodeRemoved, event => {
                    void this.uiSourceCodeRemovedListener(event);
                }),
                this.#workspace.addEventListener(Workspace.Workspace.Events.WorkingCopyCommitted, event => this.onUISourceCodeWorkingCopyCommitted(event.data.uiSourceCode)),
            ];
            await this.updateActiveProject();
        }
        else {
            Host.userMetrics.actionTaken(Host.UserMetrics.Action.PersistenceNetworkOverridesDisabled);
            Common.EventTarget.removeEventListeners(this.#eventDescriptors);
            await this.updateActiveProject();
        }
        this.dispatchEventToListeners("LocalOverridesProjectUpdated" /* Events.LOCAL_OVERRIDES_PROJECT_UPDATED */, this.#enabled);
    }
    async uiSourceCodeRenamedListener(event) {
        const uiSourceCode = event.data.uiSourceCode;
        await this.onUISourceCodeRemoved(uiSourceCode);
        await this.onUISourceCodeAdded(uiSourceCode);
    }
    async uiSourceCodeRemovedListener(event) {
        await this.onUISourceCodeRemoved(event.data);
    }
    async uiSourceCodeAdded(event) {
        await this.onUISourceCodeAdded(event.data);
    }
    async updateActiveProject() {
        const wasActive = this.#active;
        this.#active = Boolean(this.#enabledSetting.get() && this.#targetManager.rootTarget() && this.#project);
        if (this.#active === wasActive) {
            return;
        }
        if (this.#active && this.#project) {
            await Promise.all([...this.#project.uiSourceCodes()].map(uiSourceCode => this.filesystemUISourceCodeAdded(uiSourceCode)));
            const networkProjects = this.#workspace.projectsForType(Workspace.Workspace.projectTypes.Network);
            for (const networkProject of networkProjects) {
                await Promise.all([...networkProject.uiSourceCodes()].map(uiSourceCode => this.networkUISourceCodeAdded(uiSourceCode)));
            }
        }
        else if (this.#project) {
            await Promise.all([...this.#project.uiSourceCodes()].map(uiSourceCode => this.filesystemUISourceCodeRemoved(uiSourceCode)));
            this.#networkUISourceCodeForEncodedPath.clear();
        }
        this.#persistence.refreshAutomapping();
    }
    encodedPathFromUrl(url, ignoreInactive) {
        return Common.ParsedURL.ParsedURL.rawPathToEncodedPathString(this.rawPathFromUrl(url, ignoreInactive));
    }
    rawPathFromUrl(url, ignoreInactive) {
        if ((!this.#active && !ignoreInactive) || !this.#project) {
            return Platform.DevToolsPath.EmptyRawPathString;
        }
        if (NetworkPersistenceManager.isForbiddenNetworkUrl(url)) {
            return Platform.DevToolsPath.EmptyRawPathString;
        }
        let initialEncodedPath = Common.ParsedURL.ParsedURL.urlWithoutHash(url.replace(/^https?:\/\//, ''));
        if (initialEncodedPath.endsWith('/') && initialEncodedPath.indexOf('?') === -1) {
            initialEncodedPath = Common.ParsedURL.ParsedURL.concatenate(initialEncodedPath, 'index.html');
        }
        let encodedPathParts = NetworkPersistenceManager.encodeEncodedPathToLocalPathParts(initialEncodedPath);
        const projectPath = FileSystemWorkspaceBinding.fileSystemPath(this.#project.id());
        const encodedPath = encodedPathParts.join('/');
        if (projectPath.length + encodedPath.length > 200) {
            const domain = encodedPathParts[0];
            const encodedFileName = encodedPathParts[encodedPathParts.length - 1];
            const shortFileName = encodedFileName ? encodedFileName.substr(0, 10) + '-' : '';
            const extension = Common.ParsedURL.ParsedURL.extractExtension(initialEncodedPath);
            const extensionPart = extension ? '.' + extension.substr(0, 10) : '';
            encodedPathParts = [
                domain,
                'longurls',
                shortFileName + Platform.StringUtilities.hashCode(encodedPath).toString(16) + extensionPart,
            ];
        }
        return Common.ParsedURL.ParsedURL.join(encodedPathParts, '/');
    }
    static encodeEncodedPathToLocalPathParts(encodedPath) {
        const encodedParts = [];
        for (const pathPart of this.#fileNamePartsFromEncodedPath(encodedPath)) {
            if (!pathPart) {
                continue;
            }
            // encodeURI() escapes all the unsafe filename characters except '/' and '*'
            let encodedName = encodeURI(pathPart).replace(/[\/\*]/g, match => '%' + match[0].charCodeAt(0).toString(16).toUpperCase());
            if (encodedName === '..') {
                encodedName = '%2E%2E';
            }
            else if (encodedName === '.') {
                encodedName = '%2E';
            }
            if (Host.Platform.isWin()) {
                // Windows does not allow ':' and '?' in filenames
                encodedName = encodedName.replace(/[:\?]/g, match => '%' + match[0].charCodeAt(0).toString(16).toUpperCase());
                // Windows does not allow a small set of filenames.
                if (RESERVED_FILENAMES.has(encodedName.toLowerCase())) {
                    encodedName = encodedName.split('').map(char => '%' + char.charCodeAt(0).toString(16).toUpperCase()).join('');
                }
                // Windows does not allow the file to end in a space or dot (space should already be encoded).
                const lastChar = encodedName.charAt(encodedName.length - 1);
                if (lastChar === '.') {
                    encodedName = encodedName.substr(0, encodedName.length - 1) + '%2E';
                }
            }
            encodedParts.push(encodedName);
        }
        return encodedParts;
    }
    static #fileNamePartsFromEncodedPath(encodedPath) {
        encodedPath = Common.ParsedURL.ParsedURL.urlWithoutHash(encodedPath);
        const queryIndex = encodedPath.indexOf('?');
        if (queryIndex === -1) {
            return encodedPath.split('/');
        }
        if (queryIndex === 0) {
            return [encodedPath];
        }
        const endSection = encodedPath.substr(queryIndex);
        const parts = encodedPath.substr(0, encodedPath.length - endSection.length).split('/');
        parts[parts.length - 1] += endSection;
        return parts;
    }
    fileUrlFromNetworkUrl(url, ignoreInactive) {
        if (!this.#project) {
            return Platform.DevToolsPath.EmptyUrlString;
        }
        const encodedPath = this.encodedPathFromUrl(url, ignoreInactive);
        if (!encodedPath) {
            return Platform.DevToolsPath.EmptyUrlString;
        }
        return Common.ParsedURL.ParsedURL.concatenate(this.#project.fileSystemPath(), '/', encodedPath);
    }
    getHeadersUISourceCodeFromUrl(url) {
        const fileUrlFromRequest = this.fileUrlFromNetworkUrl(url, /* ignoreNoActive */ true);
        if (!fileUrlFromRequest) {
            return null;
        }
        const folderUrlFromRequest = Common.ParsedURL.ParsedURL.substring(fileUrlFromRequest, 0, fileUrlFromRequest.lastIndexOf('/'));
        const headersFileUrl = Common.ParsedURL.ParsedURL.concatenate(folderUrlFromRequest, '/', HEADERS_FILENAME);
        return this.#workspace.uiSourceCodeForURL(headersFileUrl);
    }
    async getOrCreateHeadersUISourceCodeFromUrl(url) {
        let uiSourceCode = this.getHeadersUISourceCodeFromUrl(url);
        if (!uiSourceCode && this.#project) {
            const encodedFilePath = this.encodedPathFromUrl(url, /* ignoreNoActive */ true);
            if (!encodedFilePath) {
                return null;
            }
            const encodedPath = Common.ParsedURL.ParsedURL.substr(encodedFilePath, 0, encodedFilePath.lastIndexOf('/'));
            if (!encodedPath) {
                return null;
            }
            uiSourceCode = await this.#project.createFile(encodedPath, HEADERS_FILENAME, '');
            Host.userMetrics.actionTaken(Host.UserMetrics.Action.HeaderOverrideFileCreated);
        }
        return uiSourceCode;
    }
    decodeLocalPathToUrlPath(path) {
        try {
            return unescape(path);
        }
        catch (e) {
            console.error(e);
        }
        return path;
    }
    async #unbind(uiSourceCode) {
        const binding = this.#bindings.get(uiSourceCode);
        const headerBinding = uiSourceCode.url().endsWith(HEADERS_FILENAME);
        if (binding) {
            const mutex = this.#getOrCreateMutex(binding.network);
            await mutex.run(this.#innerUnbind.bind(this, binding));
        }
        else if (headerBinding) {
            this.dispatchEventToListeners("RequestsForHeaderOverridesFileChanged" /* Events.REQUEST_FOR_HEADER_OVERRIDES_FILE_CHANGED */, uiSourceCode);
        }
    }
    async #unbindUnguarded(uiSourceCode) {
        const binding = this.#bindings.get(uiSourceCode);
        if (binding) {
            await this.#innerUnbind(binding);
        }
    }
    #innerUnbind(binding) {
        this.#bindings.delete(binding.network);
        this.#bindings.delete(binding.fileSystem);
        return this.#persistence.removeBinding(binding);
    }
    async #bind(networkUISourceCode, fileSystemUISourceCode) {
        const mutex = this.#getOrCreateMutex(networkUISourceCode);
        await mutex.run(async () => {
            const existingBinding = this.#bindings.get(networkUISourceCode);
            if (existingBinding) {
                const { network, fileSystem } = existingBinding;
                if (networkUISourceCode === network && fileSystemUISourceCode === fileSystem) {
                    return;
                }
                await this.#unbindUnguarded(networkUISourceCode);
                await this.#unbindUnguarded(fileSystemUISourceCode);
            }
            await this.#innerAddBinding(networkUISourceCode, fileSystemUISourceCode);
        });
    }
    #getOrCreateMutex(networkUISourceCode) {
        let mutex = this.#sourceCodeToBindProcessMutex.get(networkUISourceCode);
        if (!mutex) {
            mutex = new Common.Mutex.Mutex();
            this.#sourceCodeToBindProcessMutex.set(networkUISourceCode, mutex);
        }
        return mutex;
    }
    async #innerAddBinding(networkUISourceCode, fileSystemUISourceCode) {
        const binding = new PersistenceBinding(networkUISourceCode, fileSystemUISourceCode);
        this.#bindings.set(networkUISourceCode, binding);
        this.#bindings.set(fileSystemUISourceCode, binding);
        await this.#persistence.addBinding(binding);
        const uiSourceCodeOfTruth = this.#savingForOverrides.has(networkUISourceCode) ? networkUISourceCode : fileSystemUISourceCode;
        const contentDataOrError = await uiSourceCodeOfTruth.requestContentData();
        const { content, isEncoded } = TextUtils.ContentData.ContentData.asDeferredContent(contentDataOrError);
        this.#persistence.syncContent(uiSourceCodeOfTruth, content || '', isEncoded);
    }
    onUISourceCodeWorkingCopyCommitted(uiSourceCode) {
        void this.saveUISourceCodeForOverrides(uiSourceCode);
        this.updateInterceptionPatterns();
    }
    isActiveHeaderOverrides(uiSourceCode) {
        // If this overridden file is actively in use at the moment.
        if (!this.#enabledSetting.get()) {
            return false;
        }
        return uiSourceCode.url().endsWith(HEADERS_FILENAME) &&
            this.hasMatchingNetworkUISourceCodeForHeaderOverridesFile(uiSourceCode);
    }
    isUISourceCodeOverridable(uiSourceCode) {
        if (uiSourceCode.project().type() !== Workspace.Workspace.projectTypes.Network) {
            return false;
        }
        if (NetworkPersistenceManager.isForbiddenNetworkUrl(uiSourceCode.url())) {
            return false;
        }
        // A `//# sourceURL=` annotation is fully controlled by the page and doesn't refer
        // to an actual network resource, so there is nothing to override here. Persisting
        // it would poison the overrides folder with a file that masquerades as a genuine
        // resource (b/553931271).
        if (Bindings.NetworkProject.NetworkProject.isSourceURLSynthesized(uiSourceCode)) {
            return false;
        }
        return true;
    }
    /**
     * Whether the contents of `uiSourceCode` may be written into the overrides folder.
     *
     * Sources that originate from a source map are overridable in the sense that the
     * deployed resource they are mapped from can be overridden (see
     * `PersistenceActions`), but their own URL and content are page controlled and
     * must never be persisted themselves (b/553931271).
     */
    #canPersistUISourceCodeAsOverride(uiSourceCode) {
        return this.isUISourceCodeOverridable(uiSourceCode) && !uiSourceCode.contentType().isFromSourceMap();
    }
    #isUISourceCodeAlreadyOverridden(uiSourceCode) {
        return this.#bindings.has(uiSourceCode) || this.#savingForOverrides.has(uiSourceCode);
    }
    #shouldPromptSaveForOverridesDialog(uiSourceCode) {
        return this.isUISourceCodeOverridable(uiSourceCode) && !this.#isUISourceCodeAlreadyOverridden(uiSourceCode) &&
            !this.#active && !this.#project;
    }
    #canSaveUISourceCodeForOverrides(uiSourceCode) {
        return this.#active && this.#canPersistUISourceCodeAsOverride(uiSourceCode) &&
            !this.#isUISourceCodeAlreadyOverridden(uiSourceCode);
    }
    async setupAndStartLocalOverrides(uiSourceCode) {
        if (!this.#canPersistUISourceCodeAsOverride(uiSourceCode)) {
            return false;
        }
        // No overrides folder, set it up
        if (this.#shouldPromptSaveForOverridesDialog(uiSourceCode)) {
            Host.userMetrics.actionTaken(Host.UserMetrics.Action.OverrideContentContextMenuSetup);
            await new Promise(resolve => this.dispatchEventToListeners("LocalOverridesRequested" /* Events.LOCAL_OVERRIDES_REQUESTED */, resolve));
            await this.#isolatedFileSystemManager.addFileSystem('overrides');
        }
        if (!this.project()) {
            Host.userMetrics.actionTaken(Host.UserMetrics.Action.OverrideContentContextMenuAbandonSetup);
            return false;
        }
        // Already have an overrides folder, enable setting
        if (!this.#enabledSetting.get()) {
            Host.userMetrics.actionTaken(Host.UserMetrics.Action.OverrideContentContextMenuActivateDisabled);
            this.#enabledSetting.set(true);
            await this.once("LocalOverridesProjectUpdated" /* Events.LOCAL_OVERRIDES_PROJECT_UPDATED */);
        }
        // Save new file
        if (!this.#isUISourceCodeAlreadyOverridden(uiSourceCode)) {
            Host.userMetrics.actionTaken(Host.UserMetrics.Action.OverrideContentContextMenuSaveNewFile);
            uiSourceCode.commitWorkingCopy();
            await this.saveUISourceCodeForOverrides(uiSourceCode);
        }
        else {
            Host.userMetrics.actionTaken(Host.UserMetrics.Action.OverrideContentContextMenuOpenExistingFile);
        }
        return true;
    }
    async saveUISourceCodeForOverrides(uiSourceCode) {
        if (!this.#canSaveUISourceCodeForOverrides(uiSourceCode)) {
            return;
        }
        this.#savingForOverrides.add(uiSourceCode);
        let encodedPath = this.encodedPathFromUrl(uiSourceCode.url());
        if (!encodedPath) {
            this.#savingForOverrides.delete(uiSourceCode);
            return;
        }
        const contentDataOrError = await uiSourceCode.requestContentData();
        const { content, isEncoded } = TextUtils.ContentData.ContentData.asDeferredContent(contentDataOrError);
        const lastIndexOfSlash = encodedPath.lastIndexOf('/');
        const encodedFileName = Common.ParsedURL.ParsedURL.substring(encodedPath, lastIndexOfSlash + 1);
        const rawFileName = Common.ParsedURL.ParsedURL.encodedPathToRawPathString(encodedFileName);
        encodedPath = Common.ParsedURL.ParsedURL.substr(encodedPath, 0, lastIndexOfSlash);
        if (!encodedPath || rawFileName === HEADERS_FILENAME) {
            this.#savingForOverrides.delete(uiSourceCode);
            return;
        }
        if (this.#project) {
            await this.#project.createFile(encodedPath, rawFileName, content ?? '', isEncoded);
        }
        this.fileCreatedForTest(encodedPath, rawFileName);
        this.#savingForOverrides.delete(uiSourceCode);
    }
    fileCreatedForTest(_path, _fileName) {
    }
    patternForFileSystemUISourceCode(uiSourceCode) {
        const relativePathParts = FileSystemWorkspaceBinding.relativePath(uiSourceCode);
        if (relativePathParts.length < 2) {
            return '';
        }
        if (relativePathParts[1] === 'longurls' && relativePathParts.length !== 2) {
            if (relativePathParts[0] === 'file:') {
                return 'file:///*';
            }
            return 'http?://' + relativePathParts[0] + '/*';
        }
        // 'relativePath' returns an encoded string of the local file name which itself is already encoded.
        // We therefore need to decode twice to get the raw path.
        const path = this.decodeLocalPathToUrlPath(this.decodeLocalPathToUrlPath(relativePathParts.join('/')));
        if (path.startsWith('file:/')) {
            // The file path of the override file looks like '/path/to/overrides/file:/path/to/local/files/index.html'.
            // The decoded relative path then starts with 'file:/' which we modify to start with 'file:///' instead.
            return 'file:///' + path.substring('file:/'.length);
        }
        return 'http?://' + path;
    }
    // 'chrome://'-URLs and the Chrome Web Store are privileged URLs. We don't want users
    // to be able to override those. Ideally we'd have a similar check in the backend,
    // because the fix here has no effect on non-DevTools CDP clients.
    isForbiddenFileUrl(uiSourceCode) {
        const relativePathParts = FileSystemWorkspaceBinding.relativePath(uiSourceCode);
        // Decode twice to handle paths generated on Windows OS.
        const host = this.decodeLocalPathToUrlPath(this.decodeLocalPathToUrlPath(relativePathParts[0] || '')).toLowerCase();
        return ['chrome:', 'data:', 'blob:', 'javascript:', 'about:', 'mailto:', 'vbscript:', '.', '..'].includes(host) ||
            forbiddenUrls.includes(host);
    }
    static isForbiddenNetworkUrl(urlString) {
        const trimmedUrl = urlString.trim().toLowerCase();
        if (trimmedUrl.startsWith('chrome:') || trimmedUrl.startsWith('data:') || trimmedUrl.startsWith('blob:') ||
            trimmedUrl.startsWith('javascript:') || trimmedUrl.startsWith('about:') || trimmedUrl.startsWith('mailto:') ||
            trimmedUrl.startsWith('vbscript:')) {
            return true;
        }
        const url = Common.ParsedURL.ParsedURL.fromString(urlString);
        if (!url) {
            return true;
        }
        if ((url.scheme === 'http' || url.scheme === 'https') && (!url.host || url.host === '.' || url.host === '..')) {
            return true;
        }
        return !['http', 'https', 'file'].includes(url.scheme) || forbiddenUrls.includes(url.host);
    }
    async onUISourceCodeAdded(uiSourceCode) {
        await this.networkUISourceCodeAdded(uiSourceCode);
        await this.filesystemUISourceCodeAdded(uiSourceCode);
    }
    canHandleNetworkUISourceCode(uiSourceCode) {
        return this.#active && !Common.ParsedURL.schemeIs(uiSourceCode.url(), 'snippet:') &&
            !NetworkPersistenceManager.isForbiddenNetworkUrl(uiSourceCode.url());
    }
    async networkUISourceCodeAdded(uiSourceCode) {
        if (uiSourceCode.project().type() !== Workspace.Workspace.projectTypes.Network ||
            !this.canHandleNetworkUISourceCode(uiSourceCode)) {
            return;
        }
        const url = Common.ParsedURL.ParsedURL.urlWithoutHash(uiSourceCode.url());
        this.#networkUISourceCodeForEncodedPath.set(this.encodedPathFromUrl(url), uiSourceCode);
        const project = this.#project;
        const fileSystemUISourceCode = project.uiSourceCodeForURL(this.fileUrlFromNetworkUrl(url));
        if (fileSystemUISourceCode) {
            await this.#bind(uiSourceCode, fileSystemUISourceCode);
        }
        this.#maybeDispatchRequestsForHeaderOverridesFileChanged(uiSourceCode);
    }
    async filesystemUISourceCodeAdded(uiSourceCode) {
        if (!this.#active || uiSourceCode.project() !== this.#project) {
            return;
        }
        this.updateInterceptionPatterns();
        const relativePath = FileSystemWorkspaceBinding.relativePath(uiSourceCode);
        const networkUISourceCode = this.#networkUISourceCodeForEncodedPath.get(Common.ParsedURL.ParsedURL.join(relativePath, '/'));
        if (networkUISourceCode) {
            await this.#bind(networkUISourceCode, uiSourceCode);
        }
    }
    async #getHeaderOverridesFromUiSourceCode(uiSourceCode) {
        const contentData = await uiSourceCode.requestContentData().then(TextUtils.ContentData.ContentData.contentDataOrEmpty);
        const content = contentData.text || '[]';
        let headerOverrides = [];
        try {
            headerOverrides = JSON.parse(content);
            if (!headerOverrides.every(isHeaderOverride)) {
                throw new Error('Type mismatch after parsing');
            }
        }
        catch {
            console.error('Failed to parse', uiSourceCode.url(), 'for locally overriding headers.');
            return [];
        }
        return headerOverrides;
    }
    #doubleDecodeEncodedPathString(relativePath) {
        // 'relativePath' is an encoded string of a local file path, which is itself already encoded.
        // e.g. relativePath: 'www.example.com%253A443/path/.headers'
        // singlyDecodedPath: 'www.example.com%3A443/path/.headers'
        // decodedPath: 'www.example.com:443/path/.headers'
        const singlyDecodedPath = this.decodeLocalPathToUrlPath(relativePath);
        const decodedPath = this.decodeLocalPathToUrlPath(singlyDecodedPath);
        return { singlyDecodedPath, decodedPath };
    }
    async generateHeaderPatterns(uiSourceCode) {
        const headerOverrides = await this.#getHeaderOverridesFromUiSourceCode(uiSourceCode);
        const relativePathParts = FileSystemWorkspaceBinding.relativePath(uiSourceCode);
        const relativePath = Common.ParsedURL.ParsedURL.slice(Common.ParsedURL.ParsedURL.join(relativePathParts, '/'), 0, -HEADERS_FILENAME.length);
        const { singlyDecodedPath, decodedPath } = this.#doubleDecodeEncodedPathString(relativePath);
        let patterns;
        // Long URLS are encoded as `[domain]/longurls/[hashed path]` by `rawPathFromUrl()`.
        if (relativePathParts.length > 2 && relativePathParts[1] === 'longurls' && headerOverrides.length) {
            patterns = this.#generateHeaderPatternsForLongUrl(decodedPath, headerOverrides, relativePathParts[0]);
        }
        else if (decodedPath.startsWith('file:/')) {
            patterns = this.#generateHeaderPatternsForFileUrl(Common.ParsedURL.ParsedURL.substring(decodedPath, 'file:/'.length), headerOverrides);
        }
        else {
            patterns = this.#generateHeaderPatternsForHttpUrl(decodedPath, headerOverrides);
        }
        return { ...patterns, path: singlyDecodedPath };
    }
    #generateHeaderPatternsForHttpUrl(decodedPath, headerOverrides) {
        const headerPatterns = new Set();
        const overridesWithRegex = [];
        for (const headerOverride of headerOverrides) {
            headerPatterns.add('http?://' + decodedPath + headerOverride.applyTo);
            // Make 'global' overrides apply to file URLs as well.
            if (decodedPath === '') {
                headerPatterns.add('file:///' + headerOverride.applyTo);
                overridesWithRegex.push({
                    applyToRegex: new RegExp('^file:\/\/\/' + escapeRegex(decodedPath + headerOverride.applyTo) + '$'),
                    headers: headerOverride.headers,
                });
            }
            // Most servers have the concept of a "directory index", which is a
            // default resource name for a request targeting a "directory", e. g.
            // requesting "example.com/path/" would result in the same response as
            // requesting "example.com/path/index.html". To match this behavior we
            // generate an additional pattern without "index.html" as the longer
            // pattern would not match against a shorter request.
            const { head, tail } = extractDirectoryIndex(headerOverride.applyTo);
            if (tail) {
                headerPatterns.add('http?://' + decodedPath + head);
                overridesWithRegex.push({
                    applyToRegex: new RegExp(`^${escapeRegex(decodedPath + head)}(${escapeRegex(tail)})?$`),
                    headers: headerOverride.headers,
                });
            }
            else {
                overridesWithRegex.push({
                    applyToRegex: new RegExp(`^${escapeRegex(decodedPath + headerOverride.applyTo)}$`),
                    headers: headerOverride.headers,
                });
            }
        }
        return { headerPatterns, overridesWithRegex };
    }
    #generateHeaderPatternsForFileUrl(decodedPath, headerOverrides) {
        const headerPatterns = new Set();
        const overridesWithRegex = [];
        for (const headerOverride of headerOverrides) {
            headerPatterns.add('file:///' + decodedPath + headerOverride.applyTo);
            overridesWithRegex.push({
                applyToRegex: new RegExp(`^file:\/${escapeRegex(decodedPath + headerOverride.applyTo)}$`),
                headers: headerOverride.headers,
            });
        }
        return { headerPatterns, overridesWithRegex };
    }
    // For very long URLs, part of the URL is hashed for local overrides, so that
    // the URL appears shorter. This special case is handled here.
    #generateHeaderPatternsForLongUrl(decodedPath, headerOverrides, relativePathPart) {
        const headerPatterns = new Set();
        // Use pattern with wildcard => every request which matches will be paused
        // and checked whether its hashed URL matches a stored local override in
        // `maybeMergeHeadersForPathSegment()`.
        let { decodedPath: decodedPattern } = this.#doubleDecodeEncodedPathString(Common.ParsedURL.ParsedURL.concatenate(relativePathPart, '/*'));
        const isFileUrl = decodedPath.startsWith('file:/');
        if (isFileUrl) {
            decodedPath = Common.ParsedURL.ParsedURL.substring(decodedPath, 'file:/'.length);
            decodedPattern = Common.ParsedURL.ParsedURL.substring(decodedPattern, 'file:/'.length);
        }
        headerPatterns.add((isFileUrl ? 'file:///' : 'http?://') + decodedPattern);
        const overridesWithRegex = [];
        for (const headerOverride of headerOverrides) {
            overridesWithRegex.push({
                applyToRegex: new RegExp(`^${isFileUrl ? 'file:\/' : ''}${escapeRegex(decodedPath + headerOverride.applyTo)}$`),
                headers: headerOverride.headers,
            });
        }
        return { headerPatterns, overridesWithRegex };
    }
    async updateInterceptionPatternsForTests() {
        await this.#innerUpdateInterceptionPatterns();
    }
    updateInterceptionPatterns() {
        void this.#updateInterceptionThrottler.schedule(this.#innerUpdateInterceptionPatterns.bind(this));
    }
    async #innerUpdateInterceptionPatterns() {
        this.#headerOverridesMap.clear();
        if (!this.#active || !this.#project) {
            return await this.#multitargetNetworkManager.setInterceptionHandlerForPatterns([], this.#interceptionHandlerBound);
        }
        let patterns = new Set();
        for (const uiSourceCode of this.#project.uiSourceCodes()) {
            if (this.isForbiddenFileUrl(uiSourceCode)) {
                continue;
            }
            const pattern = this.patternForFileSystemUISourceCode(uiSourceCode);
            if (uiSourceCode.name() === HEADERS_FILENAME) {
                const { headerPatterns, path, overridesWithRegex } = await this.generateHeaderPatterns(uiSourceCode);
                if (headerPatterns.size > 0) {
                    patterns = new Set([...patterns, ...headerPatterns]);
                    this.#headerOverridesMap.set(path, overridesWithRegex);
                }
            }
            else {
                patterns.add(pattern);
            }
            // Most servers have the concept of a "directory index", which is a
            // default resource name for a request targeting a "directory", e. g.
            // requesting "example.com/path/" would result in the same response as
            // requesting "example.com/path/index.html". To match this behavior we
            // generate an additional pattern without "index.html" as the longer
            // pattern would not match against a shorter request.
            const { head, tail } = extractDirectoryIndex(pattern);
            if (tail) {
                patterns.add(head);
            }
        }
        return await this.#multitargetNetworkManager.setInterceptionHandlerForPatterns(Array.from(patterns).map(pattern => ({ urlPattern: pattern, requestStage: "Response" /* Protocol.Fetch.RequestStage.Response */ })), this.#interceptionHandlerBound);
    }
    async onUISourceCodeRemoved(uiSourceCode) {
        await this.networkUISourceCodeRemoved(uiSourceCode);
        await this.filesystemUISourceCodeRemoved(uiSourceCode);
    }
    async networkUISourceCodeRemoved(uiSourceCode) {
        if (uiSourceCode.project().type() === Workspace.Workspace.projectTypes.Network) {
            await this.#unbind(uiSourceCode);
            this.#sourceCodeToBindProcessMutex.delete(uiSourceCode);
            this.#networkUISourceCodeForEncodedPath.delete(this.encodedPathFromUrl(uiSourceCode.url()));
        }
        this.#maybeDispatchRequestsForHeaderOverridesFileChanged(uiSourceCode);
    }
    // We consider a header override file as active, if it matches (= potentially contains
    // header overrides for) some of the current page's requests.
    // The editors (in the Sources panel) of active header override files should have an
    // emphasized icon. For regular overrides we use bindings to determine which editors
    // are active. For header overrides we do not have a 1:1 matching between the file
    // defining the header overrides and the request matching the override definition,
    // because a single '.headers' file can contain header overrides for multiple requests.
    // For each request, we therefore look whether one or more matching header override
    // files exist, and if they do, for each of them we emit an event, which causes
    // potential matching editors to update their icon.
    #maybeDispatchRequestsForHeaderOverridesFileChanged(uiSourceCode) {
        if (!this.#project) {
            return;
        }
        const project = this.#project;
        const fileUrl = this.fileUrlFromNetworkUrl(uiSourceCode.url());
        for (let i = project.fileSystemPath().length; i < fileUrl.length; i++) {
            if (fileUrl[i] !== '/') {
                continue;
            }
            const headersFilePath = Common.ParsedURL.ParsedURL.concatenate(Common.ParsedURL.ParsedURL.substring(fileUrl, 0, i + 1), '.headers');
            const headersFileUiSourceCode = project.uiSourceCodeForURL(headersFilePath);
            if (!headersFileUiSourceCode) {
                continue;
            }
            this.#headerOverridesForEventDispatch.add(headersFileUiSourceCode);
            void this.#eventDispatchThrottler.schedule(this.#dispatchRequestsForHeaderOverridesFileChanged.bind(this));
        }
    }
    #dispatchRequestsForHeaderOverridesFileChanged() {
        for (const headersFileUiSourceCode of this.#headerOverridesForEventDispatch) {
            this.dispatchEventToListeners("RequestsForHeaderOverridesFileChanged" /* Events.REQUEST_FOR_HEADER_OVERRIDES_FILE_CHANGED */, headersFileUiSourceCode);
        }
        this.#headerOverridesForEventDispatch.clear();
        return Promise.resolve();
    }
    hasMatchingNetworkUISourceCodeForHeaderOverridesFile(headersFile) {
        const relativePathParts = FileSystemWorkspaceBinding.relativePath(headersFile);
        const relativePath = Common.ParsedURL.ParsedURL.slice(Common.ParsedURL.ParsedURL.join(relativePathParts, '/'), 0, -HEADERS_FILENAME.length);
        for (const encodedNetworkPath of this.#networkUISourceCodeForEncodedPath.keys()) {
            if (encodedNetworkPath.startsWith(relativePath)) {
                return true;
            }
        }
        return false;
    }
    async filesystemUISourceCodeRemoved(uiSourceCode) {
        if (uiSourceCode.project() !== this.#project) {
            return;
        }
        this.updateInterceptionPatterns();
        this.#originalResponseContentPromises.delete(uiSourceCode);
        await this.#unbind(uiSourceCode);
    }
    async setProject(project) {
        if (project === this.#project) {
            return;
        }
        if (this.#project) {
            await Promise.all([...this.#project.uiSourceCodes()].map(uiSourceCode => this.filesystemUISourceCodeRemoved(uiSourceCode)));
        }
        this.#project = project;
        if (this.#project) {
            await Promise.all([...this.#project.uiSourceCodes()].map(uiSourceCode => this.filesystemUISourceCodeAdded(uiSourceCode)));
        }
        await this.updateActiveProject();
        this.dispatchEventToListeners("ProjectChanged" /* Events.PROJECT_CHANGED */, this.#project);
    }
    async onProjectAdded(project) {
        if (project.type() !== Workspace.Workspace.projectTypes.FileSystem ||
            FileSystemWorkspaceBinding.fileSystemType(project) !== 'overrides') {
            return;
        }
        const fileSystemPath = FileSystemWorkspaceBinding.fileSystemPath(project.id());
        if (!fileSystemPath) {
            return;
        }
        if (this.#project) {
            this.#project.remove();
        }
        await this.setProject(project);
    }
    async onProjectRemoved(project) {
        for (const uiSourceCode of project.uiSourceCodes()) {
            await this.networkUISourceCodeRemoved(uiSourceCode);
        }
        if (project === this.#project) {
            await this.setProject(null);
        }
    }
    mergeHeaders(baseHeaders, overrideHeaders) {
        const headerMap = new Platform.MapUtilities.Multimap();
        for (const { name, value } of overrideHeaders) {
            if (name.toLowerCase() !== 'set-cookie') {
                headerMap.set(name.toLowerCase(), value);
            }
        }
        const overriddenHeaderNames = new Set(headerMap.keysArray());
        for (const { name, value } of baseHeaders) {
            const lowerCaseName = name.toLowerCase();
            if (!overriddenHeaderNames.has(lowerCaseName) && lowerCaseName !== 'set-cookie') {
                headerMap.set(lowerCaseName, value);
            }
        }
        const result = [];
        for (const headerName of headerMap.keysArray()) {
            for (const headerValue of headerMap.get(headerName)) {
                result.push({ name: headerName, value: headerValue });
            }
        }
        const originalSetCookieHeaders = baseHeaders.filter(header => header.name.toLowerCase() === 'set-cookie') || [];
        const setCookieHeadersFromOverrides = overrideHeaders.filter(header => header.name.toLowerCase() === 'set-cookie');
        const mergedHeaders = SDK.NetworkManager.InterceptedRequest.mergeSetCookieHeaders(originalSetCookieHeaders, setCookieHeadersFromOverrides);
        result.push(...mergedHeaders);
        return result;
    }
    #maybeMergeHeadersForPathSegment(path, requestUrl, headers) {
        const headerOverrides = this.#headerOverridesMap.get(path) || [];
        for (const headerOverride of headerOverrides) {
            const requestUrlWithLongUrlReplacement = this.decodeLocalPathToUrlPath(this.rawPathFromUrl(requestUrl));
            if (headerOverride.applyToRegex.test(requestUrlWithLongUrlReplacement)) {
                headers = this.mergeHeaders(headers, headerOverride.headers);
            }
        }
        return headers;
    }
    handleHeaderInterception(interceptedRequest) {
        if (NetworkPersistenceManager.isForbiddenNetworkUrl(interceptedRequest.request.url)) {
            return [];
        }
        let result = interceptedRequest.responseHeaders || [];
        // 'rawPathFromUrl()''s return value is already (singly-)encoded, so we can
        // treat it as an 'EncodedPathString' here.
        const urlSegments = this.rawPathFromUrl(interceptedRequest.request.url).split('/');
        // Traverse the hierarchy of overrides from the most general to the most
        // specific. Check with empty string first to match overrides applying to
        // all domains.
        // e.g. '', 'www.example.com/', 'www.example.com/path/', ...
        let path = Platform.DevToolsPath.EmptyEncodedPathString;
        result = this.#maybeMergeHeadersForPathSegment(path, interceptedRequest.request.url, result);
        for (const segment of urlSegments) {
            path = Common.ParsedURL.ParsedURL.concatenate(path, segment, '/');
            result = this.#maybeMergeHeadersForPathSegment(path, interceptedRequest.request.url, result);
        }
        return result;
    }
    async interceptionHandler(interceptedRequest) {
        const method = interceptedRequest.request.method;
        if (!this.#active || (method === 'OPTIONS')) {
            return;
        }
        const requestUrl = interceptedRequest.request.url;
        if (NetworkPersistenceManager.isForbiddenNetworkUrl(requestUrl)) {
            return;
        }
        const proj = this.#project;
        const path = this.fileUrlFromNetworkUrl(requestUrl);
        const fileSystemUISourceCode = proj.uiSourceCodeForURL(path);
        let responseHeaders = this.handleHeaderInterception(interceptedRequest);
        if (!fileSystemUISourceCode && !responseHeaders.length) {
            return;
        }
        if (!responseHeaders.length) {
            responseHeaders = interceptedRequest.responseHeaders || [];
        }
        let { mimeType } = interceptedRequest.getMimeTypeAndCharset();
        if (!mimeType) {
            const expectedResourceType = Common.ResourceType.resourceTypes[interceptedRequest.resourceType] || Common.ResourceType.resourceTypes.Other;
            mimeType = fileSystemUISourceCode?.mimeType() || '';
            if (Common.ResourceType.ResourceType.fromMimeType(mimeType) !== expectedResourceType) {
                mimeType = expectedResourceType.canonicalMimeType();
            }
        }
        if (fileSystemUISourceCode) {
            this.#originalResponseContentPromises.set(fileSystemUISourceCode, interceptedRequest.responseBody().then(response => {
                if (TextUtils.ContentData.ContentData.isError(response) || !response.isTextContent) {
                    return null;
                }
                return response.text;
            }));
            const project = fileSystemUISourceCode.project();
            const blob = await project.requestFileBlob(fileSystemUISourceCode);
            if (blob) {
                void interceptedRequest.continueRequestWithContent(new Blob([blob], { type: mimeType }), /* encoded */ false, responseHeaders, /* isBodyOverridden */ true);
            }
        }
        else if (interceptedRequest.isRedirect()) {
            void interceptedRequest.continueRequestWithContent(new Blob([], { type: mimeType }), /* encoded */ true, responseHeaders, /* isBodyOverridden */ false);
        }
        else {
            const responseBody = await interceptedRequest.responseBody();
            if (!TextUtils.ContentData.ContentData.isError(responseBody)) {
                const content = responseBody.isTextContent ? responseBody.text : responseBody.base64;
                void interceptedRequest.continueRequestWithContent(new Blob([content], { type: mimeType }), /* encoded */ !responseBody.isTextContent, responseHeaders, 
                /* isBodyOverridden */ false);
            }
        }
    }
}
const RESERVED_FILENAMES = new Set([
    'con', 'prn', 'aux', 'nul', 'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7',
    'com8', 'com9', 'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);
export const HEADERS_FILENAME = '.headers';
export var Events;
(function (Events) {
    Events["PROJECT_CHANGED"] = "ProjectChanged";
    Events["REQUEST_FOR_HEADER_OVERRIDES_FILE_CHANGED"] = "RequestsForHeaderOverridesFileChanged";
    Events["LOCAL_OVERRIDES_PROJECT_UPDATED"] = "LocalOverridesProjectUpdated";
    Events["LOCAL_OVERRIDES_REQUESTED"] = "LocalOverridesRequested";
})(Events || (Events = {}));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isHeaderOverride(arg) {
    if (!(arg && typeof arg.applyTo === 'string' && arg.headers?.length && Array.isArray(arg.headers))) {
        return false;
    }
    return arg.headers.every((header) => typeof header.name === 'string' && typeof header.value === 'string');
}
export function escapeRegex(pattern) {
    return Platform.StringUtilities.escapeCharacters(pattern, '[]{}()\\.^$+|-,?').replaceAll('*', '.*');
}
export function extractDirectoryIndex(pattern) {
    const lastSlash = pattern.lastIndexOf('/');
    const tail = lastSlash >= 0 ? pattern.slice(lastSlash + 1) : pattern;
    const head = lastSlash >= 0 ? pattern.slice(0, lastSlash + 1) : '';
    const regex = new RegExp('^' + escapeRegex(tail) + '$');
    if (tail !== '*' && (regex.test('index.html') || regex.test('index.htm') || regex.test('index.php'))) {
        return { head, tail };
    }
    return { head: pattern };
}
//# sourceMappingURL=NetworkPersistenceManager.js.map