// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as i18n from '../i18n/i18n.js';
import * as Platform from '../platform/platform.js';
import { Events, } from './InspectorFrontendHostAPI.js';
import { streamWrite as resourceLoaderStreamWrite } from './ResourceLoader.js';
const UIStrings = {
    /**
     * @description Document title in Inspector Frontend Host of the DevTools window.
     * @example {example.com} PH1
     */
    devtoolsS: 'DevTools - {PH1}',
};
const str_ = i18n.i18n.registerUIStrings('core/host/InspectorFrontendHostStub.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const MAX_RECORDED_HISTOGRAMS_SIZE = 100;
const OVERRIDES_FILE_SYSTEM_PATH = '/overrides';
/**
 * The `InspectorFrontendHostStub` is a stub interface used the frontend is loaded like a webpage. Examples:
 *   - devtools://devtools/bundled/devtools_app.html
 *   - https://chrome-devtools-frontend.appspot.com/serve_rev/@030cc140435b0152645522b9864b75cac6c0a854/worker_app.html
 *   - http://localhost:9222/devtools/inspector.html?ws=localhost:9222/devtools/page/xTARGET_IDx
 *
 * When the frontend runs within the native embedder, then the InspectorFrontendHostAPI methods are provided
 * by devtools_compatibility.js. Those leverage `DevToolsAPI.sendMessageToEmbedder()` which match up with
 * the embedder API defined here: https://source.chromium.org/search?q=f:devtools%20f:dispatcher%20f:cc%20symbol:CreateForDevToolsFrontend&sq=&ss=chromium%2Fchromium%2Fsrc
 * The native implementations live in devtools_ui_bindings.cc: https://source.chromium.org/chromium/chromium/src/+/main:chrome/browser/devtools/devtools_ui_bindings.cc
 */
export class InspectorFrontendHostStub {
    #urlsBeingSaved = new Map();
    #fileSystem = null;
    recordedCountHistograms = [];
    recordedEnumeratedHistograms = [];
    recordedPerformanceHistograms = [];
    constructor() {
        // Guard against errors should this file ever be imported at the top level
        // within a worker - in which case this constructor is run. If there's no
        // document, we can early exit.
        if (typeof document === 'undefined') {
            return;
        }
        function stopEventPropagation(event) {
            // Let browser handle Ctrl+/Ctrl- shortcuts in hosted mode.
            const zoomModifier = this.platform() === 'mac' ? event.metaKey : event.ctrlKey;
            if (zoomModifier && (event.key === '+' || event.key === '-')) {
                event.stopPropagation();
            }
        }
        document.addEventListener('keydown', event => {
            stopEventPropagation.call(this, (event));
        }, true);
    }
    platform() {
        const userAgent = navigator.userAgent;
        if (userAgent.includes('Windows NT')) {
            return 'windows';
        }
        if (userAgent.includes('Mac OS X')) {
            return 'mac';
        }
        return 'linux';
    }
    loadCompleted() {
    }
    bringToFront() {
    }
    closeWindow() {
    }
    setIsDocked(_isDocked, callback) {
        globalThis.setTimeout(callback, 0);
    }
    showSurvey(_trigger, callback) {
        globalThis.setTimeout(() => callback({ surveyShown: false }), 0);
    }
    canShowSurvey(_trigger, callback) {
        globalThis.setTimeout(() => callback({ canShowSurvey: false }), 0);
    }
    /**
     * Requests inspected page to be placed atop of the inspector frontend with specified bounds.
     */
    setInspectedPageBounds(_bounds) {
    }
    inspectElementCompleted() {
    }
    setInjectedScriptForOrigin(_origin, _script) {
    }
    inspectedURLChanged(url) {
        if (!('document' in globalThis)) {
            return;
        }
        document.title = i18nString(UIStrings.devtoolsS, { PH1: url.replace(/^https?:\/\//, '') });
    }
    copyText(text) {
        if (text === undefined || text === null) {
            return;
        }
        void navigator.clipboard.writeText(text);
    }
    openInNewTab(url) {
        if (Common.ParsedURL.schemeIs(url, 'javascript:')) {
            return;
        }
        window.open(url, '_blank');
    }
    openSearchResultsInNewTab(_query) {
        // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
        Common.Console.Console.instance().error('Search is not enabled in hosted mode. Please inspect using chrome://inspect');
    }
    showItemInFolder(_fileSystemPath) {
        // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
        Common.Console.Console.instance().error('Show item in folder is not enabled in hosted mode. Please inspect using chrome://inspect');
    }
    // Reminder: the methods in this class belong to InspectorFrontendHostStub and are typically not executed.
    // InspectorFrontendHostStub is ONLY used in the uncommon case of devtools not being embedded. For example: trace.cafe or http://localhost:9222/devtools/inspector.html?ws=localhost:9222/devtools/page/xTARGET_IDx
    save(url, content, _forceSaveAs, isBase64) {
        let buffer = this.#urlsBeingSaved.get(url)?.buffer;
        if (!buffer) {
            buffer = [];
            this.#urlsBeingSaved.set(url, { isBase64, buffer });
        }
        buffer.push(content);
        this.events.dispatchEventToListeners(Events.SavedURL, { url, fileSystemPath: url });
    }
    append(url, content) {
        const buffer = this.#urlsBeingSaved.get(url)?.buffer;
        if (buffer) {
            buffer.push(content);
            this.events.dispatchEventToListeners(Events.AppendedToURL, url);
        }
    }
    close(url) {
        const { isBase64, buffer } = this.#urlsBeingSaved.get(url) || { isBase64: false, buffer: [] };
        this.#urlsBeingSaved.delete(url);
        let fileName = '';
        if (url) {
            try {
                const trimmed = Platform.StringUtilities.trimURL(url);
                fileName = Platform.StringUtilities.removeURLFragment(trimmed);
            }
            catch {
                // If url is not a valid URL, it is probably a filename.
                fileName = url;
            }
        }
        /* eslint-disable-next-line @devtools/no-imperative-dom-api */
        const link = document.createElement('a');
        link.download = fileName;
        let blob;
        if (isBase64) {
            const bytes = Common.Base64.decode(buffer.join(''));
            blob = new Blob([bytes], { type: 'application/gzip' });
        }
        else {
            blob = new Blob(buffer, { type: 'text/plain' });
        }
        const blobUrl = URL.createObjectURL(blob);
        link.href = blobUrl;
        link.click();
        URL.revokeObjectURL(blobUrl);
    }
    sendMessageToBackend(_message) {
    }
    recordCountHistogram(histogramName, sample, min, exclusiveMax, bucketSize) {
        if (this.recordedCountHistograms.length >= MAX_RECORDED_HISTOGRAMS_SIZE) {
            this.recordedCountHistograms.shift();
        }
        this.recordedCountHistograms.push({ histogramName, sample, min, exclusiveMax, bucketSize });
    }
    recordEnumeratedHistogram(actionName, actionCode, _bucketSize) {
        if (this.recordedEnumeratedHistograms.length >= MAX_RECORDED_HISTOGRAMS_SIZE) {
            this.recordedEnumeratedHistograms.shift();
        }
        this.recordedEnumeratedHistograms.push({ actionName, actionCode });
    }
    recordPerformanceHistogram(histogramName, duration) {
        if (this.recordedPerformanceHistograms.length >= MAX_RECORDED_HISTOGRAMS_SIZE) {
            this.recordedPerformanceHistograms.shift();
        }
        this.recordedPerformanceHistograms.push({ histogramName, duration });
    }
    recordPerformanceHistogramMedium(histogramName, duration) {
        if (this.recordedPerformanceHistograms.length >= MAX_RECORDED_HISTOGRAMS_SIZE) {
            this.recordedPerformanceHistograms.shift();
        }
        this.recordedPerformanceHistograms.push({ histogramName, duration });
    }
    recordUserMetricsAction(_umaName) {
    }
    recordNewBadgeUsage(_featureName) {
    }
    connectAutomaticFileSystem(_fileSystemPath, _fileSystemUUID, _addIfMissing, callback) {
        queueMicrotask(() => callback({ success: false }));
    }
    disconnectAutomaticFileSystem(_fileSystemPath) {
    }
    requestFileSystems() {
        this.events.dispatchEventToListeners(Events.FileSystemsLoaded, []);
    }
    addFileSystem(_type) {
        const onFileSystem = (fs) => {
            this.#fileSystem = fs;
            const fileSystem = {
                fileSystemName: 'sandboxedRequestedFileSystem',
                fileSystemPath: OVERRIDES_FILE_SYSTEM_PATH,
                rootURL: 'filesystem:devtools://devtools/isolated/',
                type: 'overrides',
            };
            this.events.dispatchEventToListeners(Events.FileSystemAdded, { fileSystem });
        };
        window.webkitRequestFileSystem(window.TEMPORARY, 1024 * 1024, onFileSystem);
    }
    removeFileSystem(_fileSystemPath) {
        const removalCallback = (entries) => {
            entries.forEach(entry => {
                if (entry.isDirectory) {
                    entry.removeRecursively(() => { });
                }
                else if (entry.isFile) {
                    entry.remove(() => { });
                }
            });
        };
        if (this.#fileSystem) {
            this.#fileSystem.root.createReader().readEntries(removalCallback);
        }
        this.#fileSystem = null;
        this.events.dispatchEventToListeners(Events.FileSystemRemoved, OVERRIDES_FILE_SYSTEM_PATH);
    }
    isolatedFileSystem(_fileSystemId, _registeredName) {
        return this.#fileSystem;
    }
    loadNetworkResource(url, _headers, streamId, callback) {
        fetch(url)
            .then(async (result) => {
            const respBuffer = await result.arrayBuffer();
            const text = await Common.Gzip.arrayBufferToString(respBuffer);
            return text;
        })
            .then(function (text) {
            resourceLoaderStreamWrite(streamId, text);
            callback({
                statusCode: 200,
            });
        })
            .catch(function () {
            callback({
                statusCode: 404,
            });
        });
    }
    registerPreference(_name, _options) {
    }
    getPreferences(callback) {
        const prefs = {};
        for (const name in window.localStorage) {
            prefs[name] = window.localStorage[name];
        }
        callback(prefs);
    }
    getPreference(name, callback) {
        callback(window.localStorage[name]);
    }
    setPreference(name, value) {
        window.localStorage[name] = value;
    }
    removePreference(name) {
        delete window.localStorage[name];
    }
    clearPreferences() {
        window.localStorage.clear();
    }
    getSyncInformation(callback) {
        if ('getSyncInformationForTesting' in globalThis) {
            // @ts-expect-error for testing
            return callback(globalThis.getSyncInformationForTesting());
        }
        callback({
            isSyncActive: false,
            arePreferencesSynced: false,
        });
    }
    getHostConfig(callback) {
        // This HostConfig config is used in the hosted mode (see the
        // comment on top of this class). Only add non-default config params
        // here that you want to also apply in the hosted mode. For tests
        // use the hostConfigForTesting override.
        const hostConfigForHostedMode = {
            devToolsVeLogging: {
                enabled: true,
            },
            devToolsFlexibleLayout: {
                verticalDrawerEnabled: true,
            },
        };
        if ('hostConfigForTesting' in globalThis) {
            const { hostConfigForTesting } = globalThis;
            for (const key of Object.keys(hostConfigForTesting)) {
                const mergeEntry = (key) => {
                    if (typeof hostConfigForHostedMode[key] === 'object' && typeof hostConfigForTesting[key] === 'object') {
                        // If the config is an object, merge the settings, but preferring
                        // the hostConfigForTesting values over the result values.
                        hostConfigForHostedMode[key] = { ...hostConfigForHostedMode[key], ...hostConfigForTesting[key] };
                    }
                    else {
                        // Override with the testing config if the value is present + not null/undefined.
                        hostConfigForHostedMode[key] = hostConfigForTesting[key] ?? hostConfigForHostedMode[key];
                    }
                };
                mergeEntry(key);
            }
        }
        callback(hostConfigForHostedMode);
    }
    upgradeDraggedFileSystemPermissions(_fileSystem) {
    }
    indexPath(_requestId, _fileSystemPath, _excludedFolders) {
    }
    stopIndexing(_requestId) {
    }
    searchInPath(_requestId, _fileSystemPath, _query) {
    }
    zoomFactor() {
        return 1;
    }
    zoomIn() {
    }
    zoomOut() {
    }
    resetZoom() {
    }
    setWhitelistedShortcuts(_shortcuts) {
    }
    setEyeDropperActive(_active) {
    }
    showCertificateViewer(_certChain) {
    }
    reattach(_callback) {
    }
    readyForTest() {
    }
    connectionReady() {
    }
    setOpenNewWindowForPopups(_value) {
    }
    setDevicesDiscoveryConfig(_config) {
    }
    setDevicesUpdatesEnabled(_enabled) {
    }
    openRemotePage(_browserId, _url) {
    }
    openNodeFrontend() {
    }
    showContextMenuAtPoint(_x, _y, _items, _document) {
        throw new Error('Soft context menu should be used');
    }
    /**
     * Think of **Hosted mode** as "non-embedded" mode; you can see a devtools frontend URL as the tab's URL. It's an atypical way that DevTools is run.
     * Whereas in **Non-hosted** (aka "embedded"), DevTools is embedded and fully dockable. It's the common way DevTools is run.
     *
     * **Hosted mode** == we're using the `InspectorFrontendHostStub`. impl. (@see `InspectorFrontendHostStub` class comment)
     * Whereas with **non-hosted** mode, native `DevToolsEmbedderMessageDispatcher` is used for CDP and more.  `globalThis.DevToolsAPI` is present.
     *
     * Relationships to other signals:
     * - _Connection_: Hosted-ness does not indicate whether the frontend is _connected to a valid CDP target_.
     * - _Dockability_: Being _"dockable"_ (aka `canDock`) is typically aligned but technically orthogonal.
     * - _URL scheme_: If the main frame's URL scheme is `devtools://`, it's non-hosted.
     *
     *  | Example case                                | Mode           | Example devtools                                                              |
     *  | :------------------------------------------ | :------------- | :---------------------------------------------------------------------------- |
     *  | tab URL: `devtools://…`                     | **NOT Hosted** | `devtools://devtools/bundled/devtools_app.html?targetType=tab&...`            |
     *  | tab URL: `devtools://…?ws=…`                | **NOT Hosted** | `devtools://devtools/bundled/devtools_app.html?ws=localhost:9228/...`         |
     *  | tab URL: `devtools://…` but no connection   | **NOT Hosted** | `devtools://devtools/bundled/trace_app.html`                                  |
     *  | tab URL: `https://…` but no connection      | **Hosted**     | `https://chrome-devtools-frontend.appspot.com/serve_rev/@.../trace_app.html`  |
     *  | tab URL: `http://…?ws=` (connected)         | **Hosted**     | `http://localhost:9222/devtools/inspector.html?ws=localhost:9222/...`         |
     */
    isHostedMode() {
        return true;
    }
    setAddExtensionCallback(_callback) {
        // Extensions are not supported in hosted mode.
    }
    async initialTargetId() {
        return null;
    }
    doAidaConversation(_request, _streamId, callback) {
        callback({
            error: 'Not implemented',
        });
    }
    registerAidaClientEvent(_request, callback) {
        callback({
            error: 'Not implemented',
        });
    }
    aidaCodeComplete(_request, callback) {
        callback({
            error: 'Not implemented',
        });
    }
    dispatchHttpRequest(_request, callback) {
        callback({ error: 'Not implemented' });
    }
    recordImpression(_event) {
    }
    recordResize(_event) {
    }
    recordClick(_event) {
    }
    recordHover(_event) {
    }
    recordDrag(_event) {
    }
    recordChange(_event) {
    }
    recordKeyDown(_event) {
    }
    recordSettingAccess(_event) {
    }
    recordFunctionCall(_event) {
    }
    setChromeFlag(_flagName, _value) {
    }
    requestRestart() {
    }
}
//# sourceMappingURL=InspectorFrontendHostStub.js.map