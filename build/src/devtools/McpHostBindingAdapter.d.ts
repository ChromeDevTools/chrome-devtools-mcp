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
declare class BaseMcpHostBindingAdapter implements DevTools.Host.InspectorFrontendHostAPI.InspectorFrontendHostAPI {
    events: DevTools.Common.EventTarget.EventTarget<DevTools.Host.InspectorFrontendHostAPI.EventTypes>;
    connectAutomaticFileSystem(): void;
    disconnectAutomaticFileSystem(): void;
    addFileSystem(): void;
    loadCompleted(): void;
    indexPath(): void;
    setInspectedPageBounds(): void;
    showCertificateViewer(): void;
    setWhitelistedShortcuts(): void;
    setEyeDropperActive(): void;
    inspectElementCompleted(): void;
    openInNewTab(): void;
    openSearchResultsInNewTab(): void;
    showItemInFolder(): void;
    removeFileSystem(): void;
    requestFileSystems(): void;
    save(): void;
    append(): void;
    close(): void;
    searchInPath(): void;
    stopIndexing(): void;
    bringToFront(): void;
    closeWindow(): void;
    copyText(): void;
    inspectedURLChanged(): void;
    isolatedFileSystem(): null;
    registerPreference(): void;
    getPreferences(): void;
    getPreference(): void;
    setPreference(): void;
    removePreference(): void;
    clearPreferences(): void;
    getSyncInformation(): void;
    getHostConfig(): void;
    upgradeDraggedFileSystemPermissions(): void;
    platform(): string;
    recordCountHistogram(): void;
    recordEnumeratedHistogram(): void;
    recordPerformanceHistogram(): void;
    recordPerformanceHistogramMedium(): void;
    recordUserMetricsAction(): void;
    recordNewBadgeUsage(): void;
    sendMessageToBackend(): void;
    setDevicesDiscoveryConfig(): void;
    setDevicesUpdatesEnabled(): void;
    openRemotePage(): void;
    openNodeFrontend(): void;
    setInjectedScriptForOrigin(): void;
    setIsDocked(): void;
    showSurvey(): void;
    canShowSurvey(): void;
    zoomFactor(): number;
    zoomIn(): void;
    zoomOut(): void;
    resetZoom(): void;
    showContextMenuAtPoint(): void;
    reattach(): void;
    readyForTest(): void;
    connectionReady(): void;
    setOpenNewWindowForPopups(): void;
    isHostedMode(): boolean;
    setAddExtensionCallback(): void;
    initialTargetId(): Promise<string | null>;
    doAidaConversation(_request: string, _streamId: number, cb: (result: DevTools.Host.InspectorFrontendHostAPI.DoAidaConversationResult) => void): void;
    registerAidaClientEvent(_request: string, cb: (result: DevTools.Host.InspectorFrontendHostAPI.AidaClientResult) => void): void;
    aidaCodeComplete(_request: string, cb: (result: DevTools.Host.InspectorFrontendHostAPI.AidaCodeCompleteResult) => void): void;
    dispatchHttpRequest(_request: DevTools.Host.InspectorFrontendHostAPI.DispatchHttpRequestRequest, cb: (result: DevTools.Host.InspectorFrontendHostAPI.DispatchHttpRequestResult) => void): void;
    recordImpression(): void;
    recordResize(): void;
    recordClick(): void;
    recordHover(): void;
    recordDrag(): void;
    recordChange(): void;
    recordKeyDown(): void;
    recordSettingAccess(): void;
    recordFunctionCall(): void;
    setChromeFlag(): void;
    requestRestart(): void;
    loadNetworkResource(_urlString: string, _headers: string, _streamId: number, _callback: (arg0: DevTools.Host.InspectorFrontendHostAPI.LoadNetworkResourceResult) => void): void;
}
export declare class McpHostBindingAdapter extends BaseMcpHostBindingAdapter {
    #private;
    constructor(loadResource: (path: string) => Promise<string>);
    isolatedFileSystem(): null;
    platform(): string;
    zoomFactor(): number;
    isHostedMode(): boolean;
    initialTargetId(): Promise<string | null>;
    loadNetworkResource(urlString: string, _headers: string, streamId: number, callback: (arg0: DevTools.Host.InspectorFrontendHostAPI.LoadNetworkResourceResult) => void): void;
}
export {};
