/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-empty-function */

import {DevTools} from '../third_party/index.js';

/**
 * BaseClass that is noop or throws for methods.
 * the McpHostBindingAdapter should only implement methods
 * that it needs to support.
 */
class BaseMcpHostBindingAdapter
  implements DevTools.Host.InspectorFrontendHostAPI.InspectorFrontendHostAPI
{
  declare events: DevTools.Common.EventTarget.EventTarget<DevTools.Host.InspectorFrontendHostAPI.EventTypes>;
  connectAutomaticFileSystem(): void {}

  disconnectAutomaticFileSystem(): void {}

  addFileSystem(): void {}

  loadCompleted(): void {}

  indexPath(): void {}

  setInspectedPageBounds(): void {}

  showCertificateViewer(): void {}

  setWhitelistedShortcuts(): void {}

  setEyeDropperActive(): void {}

  inspectElementCompleted(): void {}

  openInNewTab(): void {}

  openSearchResultsInNewTab(): void {}

  showItemInFolder(): void {}

  removeFileSystem(): void {}

  requestFileSystems(): void {}

  save(): void {}

  append(): void {}

  close(): void {}

  searchInPath(): void {}

  stopIndexing(): void {}

  bringToFront(): void {}

  closeWindow(): void {}

  copyText(): void {}

  inspectedURLChanged(): void {}

  isolatedFileSystem(): null {
    throw new Error('Not implemented');
  }

  registerPreference(): void {}

  getPreferences(): void {}

  getPreference(): void {}

  setPreference(): void {}

  removePreference(): void {}

  clearPreferences(): void {}

  getSyncInformation(): void {}

  getHostConfig(): void {}

  upgradeDraggedFileSystemPermissions(): void {}

  platform(): string {
    throw new Error('Not implemented');
  }

  recordCountHistogram(): void {}

  recordEnumeratedHistogram(): void {}

  recordPerformanceHistogram(): void {}

  recordPerformanceHistogramMedium(): void {}

  recordUserMetricsAction(): void {}

  recordNewBadgeUsage(): void {}

  sendMessageToBackend(): void {}

  setDevicesDiscoveryConfig(): void {}

  setDevicesUpdatesEnabled(): void {}

  openRemotePage(): void {}

  openNodeFrontend(): void {}

  setInjectedScriptForOrigin(): void {}

  setIsDocked(): void {}

  showSurvey(): void {}

  canShowSurvey(): void {}

  zoomFactor(): number {
    throw new Error('Not implemented');
  }

  zoomIn(): void {}

  zoomOut(): void {}

  resetZoom(): void {}

  showContextMenuAtPoint(): void {}

  reattach(): void {}

  readyForTest(): void {}

  connectionReady(): void {}

  setOpenNewWindowForPopups(): void {}

  isHostedMode(): boolean {
    throw new Error('Not implemented');
  }

  setAddExtensionCallback(): void {}

  initialTargetId(): Promise<string | null> {
    throw new Error('Not implemented');
  }

  doAidaConversation(
    _request: string,
    _streamId: number,
    cb: (
      result: DevTools.Host.InspectorFrontendHostAPI.DoAidaConversationResult,
    ) => void,
  ): void {
    cb({
      error: 'Not implemented',
    });
  }

  registerAidaClientEvent(
    _request: string,
    cb: (
      result: DevTools.Host.InspectorFrontendHostAPI.AidaClientResult,
    ) => void,
  ): void {
    cb({
      error: 'Not implemented',
    });
  }

  aidaCodeComplete(
    _request: string,
    cb: (
      result: DevTools.Host.InspectorFrontendHostAPI.AidaCodeCompleteResult,
    ) => void,
  ): void {
    cb({
      error: 'Not implemented',
    });
  }

  dispatchHttpRequest(
    _request: DevTools.Host.InspectorFrontendHostAPI.DispatchHttpRequestRequest,
    cb: (
      result: DevTools.Host.InspectorFrontendHostAPI.DispatchHttpRequestResult,
    ) => void,
  ): void {
    cb({
      error: 'Not implemented',
    });
  }

  recordImpression(): void {}

  recordResize(): void {}

  recordClick(): void {}

  recordHover(): void {}

  recordDrag(): void {}

  recordChange(): void {}

  recordKeyDown(): void {}

  recordSettingAccess(): void {}

  recordFunctionCall(): void {}

  setChromeFlag(): void {}

  requestRestart(): void {}

  loadNetworkResource(
    _urlString: string,
    _headers: string,
    _streamId: number,
    _callback: (
      arg0: DevTools.Host.InspectorFrontendHostAPI.LoadNetworkResourceResult,
    ) => void,
  ): void {}
}

export class McpHostBindingAdapter extends BaseMcpHostBindingAdapter {
  #loadResource: (path: string) => Promise<string>;

  constructor(loadResource: (path: string) => Promise<string>) {
    super();
    this.#loadResource = loadResource;
  }

  override isolatedFileSystem(): null {
    return null;
  }

  override platform(): string {
    switch (process.platform) {
      case 'darwin':
        return 'mac';
      case 'win32':
        return 'windows';
      default:
        return 'linux';
    }
  }

  override zoomFactor(): number {
    return 1;
  }

  override isHostedMode(): boolean {
    return true;
  }

  override initialTargetId(): Promise<string | null> {
    return Promise.resolve(null);
  }

  override loadNetworkResource(
    urlString: string,
    _headers: string,
    streamId: number,
    callback: (
      arg0: DevTools.Host.InspectorFrontendHostAPI.LoadNetworkResourceResult,
    ) => void,
  ): void {
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
        callback({statusCode: 200});
      })
      .catch(() => {
        callback({statusCode: 404});
      });
  }
}
