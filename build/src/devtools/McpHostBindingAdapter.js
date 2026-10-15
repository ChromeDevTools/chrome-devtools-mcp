/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { DevTools } from '../third_party/index.js';
/**
 * BaseClass that is noop or throws for methods.
 * the McpHostBindingAdapter should only implement methods
 * that it needs to support.
 */
class BaseMcpHostBindingAdapter {
    connectAutomaticFileSystem() { }
    disconnectAutomaticFileSystem() { }
    addFileSystem() { }
    loadCompleted() { }
    indexPath() { }
    setInspectedPageBounds() { }
    showCertificateViewer() { }
    setWhitelistedShortcuts() { }
    setEyeDropperActive() { }
    inspectElementCompleted() { }
    openInNewTab() { }
    openSearchResultsInNewTab() { }
    showItemInFolder() { }
    removeFileSystem() { }
    requestFileSystems() { }
    save() { }
    append() { }
    close() { }
    searchInPath() { }
    stopIndexing() { }
    bringToFront() { }
    closeWindow() { }
    copyText() { }
    inspectedURLChanged() { }
    isolatedFileSystem() {
        throw new Error('Not implemented');
    }
    registerPreference() { }
    getPreferences() { }
    getPreference() { }
    setPreference() { }
    removePreference() { }
    clearPreferences() { }
    getSyncInformation() { }
    getHostConfig() { }
    upgradeDraggedFileSystemPermissions() { }
    platform() {
        throw new Error('Not implemented');
    }
    recordCountHistogram() { }
    recordEnumeratedHistogram() { }
    recordPerformanceHistogram() { }
    recordPerformanceHistogramMedium() { }
    recordUserMetricsAction() { }
    recordNewBadgeUsage() { }
    sendMessageToBackend() { }
    setDevicesDiscoveryConfig() { }
    setDevicesUpdatesEnabled() { }
    openRemotePage() { }
    openNodeFrontend() { }
    setInjectedScriptForOrigin() { }
    setIsDocked() { }
    showSurvey() { }
    canShowSurvey() { }
    zoomFactor() {
        throw new Error('Not implemented');
    }
    zoomIn() { }
    zoomOut() { }
    resetZoom() { }
    showContextMenuAtPoint() { }
    reattach() { }
    readyForTest() { }
    connectionReady() { }
    setOpenNewWindowForPopups() { }
    isHostedMode() {
        throw new Error('Not implemented');
    }
    setAddExtensionCallback() { }
    initialTargetId() {
        throw new Error('Not implemented');
    }
    doAidaConversation(_request, _streamId, cb) {
        cb({
            error: 'Not implemented',
        });
    }
    registerAidaClientEvent(_request, cb) {
        cb({
            error: 'Not implemented',
        });
    }
    aidaCodeComplete(_request, cb) {
        cb({
            error: 'Not implemented',
        });
    }
    dispatchHttpRequest(_request, cb) {
        cb({
            error: 'Not implemented',
        });
    }
    recordImpression() { }
    recordResize() { }
    recordClick() { }
    recordHover() { }
    recordDrag() { }
    recordChange() { }
    recordKeyDown() { }
    recordSettingAccess() { }
    recordFunctionCall() { }
    setChromeFlag() { }
    requestRestart() { }
    loadNetworkResource(_urlString, _headers, _streamId, _callback) { }
}
export class McpHostBindingAdapter extends BaseMcpHostBindingAdapter {
    #loadResource;
    constructor(loadResource) {
        super();
        this.#loadResource = loadResource;
    }
    isolatedFileSystem() {
        return null;
    }
    platform() {
        switch (process.platform) {
            case 'darwin':
                return 'mac';
            case 'win32':
                return 'windows';
            default:
                return 'linux';
        }
    }
    zoomFactor() {
        return 1;
    }
    isHostedMode() {
        return true;
    }
    initialTargetId() {
        return Promise.resolve(null);
    }
    loadNetworkResource(urlString, _headers, streamId, callback) {
        if (!URL.canParse(urlString)) {
            callback({
                statusCode: 404,
                urlValid: false,
            });
            return;
        }
        this.#loadResource(urlString)
            .then(content => {
            DevTools.Host.ResourceLoader.streamWrite(streamId, content);
            callback({ statusCode: 200 });
        })
            .catch(() => {
            callback({ statusCode: 404 });
        });
    }
}
//# sourceMappingURL=McpHostBindingAdapter.js.map