/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {DevTools} from '../third_party/index.js';

class HostBindingUnsupported extends Error {
  constructor(method: string) {
    super(`Host binding ${method} is not supported`);
  }
}

export class McpHostBidningAdapter
  implements DevTools.Host.InspectorFrontendHostAPI.InspectorFrontendHostAPI
{
  declare events: DevTools.Common.EventTarget.EventTarget<DevTools.Host.InspectorFrontendHostAPI.EventTypes>;
  requestShowPanel(): never {
    throw new HostBindingUnsupported('requestShowPanel');
  }
  requestInspectElement(): never {
    throw new HostBindingUnsupported('requestInspectElement');
  }
  inspectElementCompleted(): never {
    throw new HostBindingUnsupported('inspectElementCompleted');
  }
  inspectedURLChanged(): never {
    throw new HostBindingUnsupported('inspectedURLChanged');
  }
  openInEditor(): never {
    throw new HostBindingUnsupported('openInEditor');
  }
  openRawFile(): never {
    throw new HostBindingUnsupported('openRawFile');
  }
  identifyForPane(): boolean {
    throw new HostBindingUnsupported('identifyForPane');
  }
  setInspectedPageBounds(): never {
    throw new HostBindingUnsupported('setInspectedPageBounds');
  }
  closeWindow(): never {
    throw new HostBindingUnsupported('closeWindow');
  }
  bringToFront(): never {
    throw new HostBindingUnsupported('bringToFront');
  }
  concentrationChanged(): never {
    throw new HostBindingUnsupported('concentrationChanged');
  }
  recordedPageWidth(): number {
    throw new HostBindingUnsupported('recordedPageWidth');
  }
  recordedPageHeight(): number {
    throw new HostBindingUnsupported('recordedPageHeight');
  }
  loadExtensions(): never {
    throw new HostBindingUnsupported('loadExtensions');
  }
  canInspectURL(): boolean {
    throw new HostBindingUnsupported('canInspectURL');
  }
  isHostedMode(): boolean {
    throw new HostBindingUnsupported('isHostedMode');
  }
  connectAutomaticFileSystem(): never {
    throw new HostBindingUnsupported('connectAutomaticFileSystem');
  }
  disconnectAutomaticFileSystem(): never {
    throw new HostBindingUnsupported('disconnectAutomaticFileSystem');
  }
  addFileSystem(): never {
    throw new HostBindingUnsupported('addFileSystem');
  }
  loadCompleted(): never {
    throw new HostBindingUnsupported('loadCompleted');
  }
  indexPath(): never {
    throw new HostBindingUnsupported('indexPath');
  }
  showCertificateViewer(): never {
    throw new HostBindingUnsupported('showCertificateViewer');
  }
  setWhitelistedShortcuts(): never {
    throw new HostBindingUnsupported('setWhitelistedShortcuts');
  }
  setEyeDropperActive(): never {
    throw new HostBindingUnsupported('setEyeDropperActive');
  }
  openInNewTab(): never {
    throw new HostBindingUnsupported('openInNewTab');
  }
  openSearchResultsInNewTab(): never {
    throw new HostBindingUnsupported('openSearchResultsInNewTab');
  }
  showItemInFolder(): never {
    throw new HostBindingUnsupported('showItemInFolder');
  }
  removeFileSystem(): never {
    throw new HostBindingUnsupported('removeFileSystem');
  }
  requestFileSystems(): never {
    throw new HostBindingUnsupported('requestFileSystems');
  }
  save(): never {
    throw new HostBindingUnsupported('save');
  }
  append(): never {
    throw new HostBindingUnsupported('append');
  }
  close(): never {
    throw new HostBindingUnsupported('close');
  }
  searchInPath(): never {
    throw new HostBindingUnsupported('searchInPath');
  }
  stopIndexing(): never {
    throw new HostBindingUnsupported('stopIndexing');
  }
  copyText(): never {
    throw new HostBindingUnsupported('copyText');
  }
  isolatedFileSystem(): never {
    throw new HostBindingUnsupported('isolatedFileSystem');
  }
  loadNetworkResource(): never {
    throw new HostBindingUnsupported('loadNetworkResource');
  }
  registerPreference(): never {
    throw new HostBindingUnsupported('registerPreference');
  }
  getPreferences(): never {
    throw new HostBindingUnsupported('getPreferences');
  }
  getPreference(): never {
    throw new HostBindingUnsupported('getPreference');
  }
  setPreference(): never {
    throw new HostBindingUnsupported('setPreference');
  }
  removePreference(): never {
    throw new HostBindingUnsupported('removePreference');
  }
  clearPreferences(): never {
    throw new HostBindingUnsupported('clearPreferences');
  }
  getSyncInformation(): never {
    throw new HostBindingUnsupported('getSyncInformation');
  }
  getHostConfig(): never {
    throw new HostBindingUnsupported('getHostConfig');
  }
  upgradeDraggedFileSystemPermissions(): never {
    throw new HostBindingUnsupported('upgradeDraggedFileSystemPermissions');
  }
  platform(): never {
    throw new HostBindingUnsupported('platform');
  }
  recordCountHistogram(): never {
    throw new HostBindingUnsupported('recordCountHistogram');
  }
  recordEnumeratedHistogram(): never {
    throw new HostBindingUnsupported('recordEnumeratedHistogram');
  }
  recordPerformanceHistogram(): never {
    throw new HostBindingUnsupported('recordPerformanceHistogram');
  }
  recordPerformanceHistogramMedium(): never {
    throw new HostBindingUnsupported('recordPerformanceHistogramMedium');
  }
  recordUserMetricsAction(): never {
    throw new HostBindingUnsupported('recordUserMetricsAction');
  }
  recordNewBadgeUsage(): never {
    throw new HostBindingUnsupported('recordNewBadgeUsage');
  }
  sendMessageToBackend(): never {
    throw new HostBindingUnsupported('sendMessageToBackend');
  }
  setDevicesDiscoveryConfig(): never {
    throw new HostBindingUnsupported('setDevicesDiscoveryConfig');
  }
  setDevicesUpdatesEnabled(): never {
    throw new HostBindingUnsupported('setDevicesUpdatesEnabled');
  }
  openRemotePage(): never {
    throw new HostBindingUnsupported('openRemotePage');
  }
  openNodeFrontend(): never {
    throw new HostBindingUnsupported('openNodeFrontend');
  }
  setInjectedScriptForOrigin(): never {
    throw new HostBindingUnsupported('setInjectedScriptForOrigin');
  }
  setIsDocked(): never {
    throw new HostBindingUnsupported('setIsDocked');
  }
  showSurvey(): never {
    throw new HostBindingUnsupported('showSurvey');
  }
  canShowSurvey(): never {
    throw new HostBindingUnsupported('canShowSurvey');
  }
  zoomFactor(): never {
    throw new HostBindingUnsupported('zoomFactor');
  }
  zoomIn(): never {
    throw new HostBindingUnsupported('zoomIn');
  }
  zoomOut(): never {
    throw new HostBindingUnsupported('zoomOut');
  }
  resetZoom(): never {
    throw new HostBindingUnsupported('resetZoom');
  }
  showContextMenuAtPoint(): never {
    throw new HostBindingUnsupported('showContextMenuAtPoint');
  }
  reattach(): never {
    throw new HostBindingUnsupported('reattach');
  }
  readyForTest(): never {
    throw new HostBindingUnsupported('readyForTest');
  }
  connectionReady(): never {
    throw new HostBindingUnsupported('connectionReady');
  }
  setOpenNewWindowForPopups(): never {
    throw new HostBindingUnsupported('setOpenNewWindowForPopups');
  }
  setAddExtensionCallback(): never {
    throw new HostBindingUnsupported('setAddExtensionCallback');
  }
  initialTargetId(): never {
    throw new HostBindingUnsupported('initialTargetId');
  }
  doAidaConversation = (): never => {
    throw new HostBindingUnsupported('doAidaConversation');
  };
  registerAidaClientEvent = (): never => {
    throw new HostBindingUnsupported('registerAidaClientEvent');
  };
  aidaCodeComplete = (): never => {
    throw new HostBindingUnsupported('aidaCodeComplete');
  };
  dispatchHttpRequest = (): never => {
    throw new HostBindingUnsupported('dispatchHttpRequest');
  };
  recordImpression(): never {
    throw new HostBindingUnsupported('recordImpression');
  }
  recordResize(): never {
    throw new HostBindingUnsupported('recordResize');
  }
  recordClick(): never {
    throw new HostBindingUnsupported('recordClick');
  }
  recordHover(): never {
    throw new HostBindingUnsupported('recordHover');
  }
  recordDrag(): never {
    throw new HostBindingUnsupported('recordDrag');
  }
  recordChange(): never {
    throw new HostBindingUnsupported('recordChange');
  }
  recordKeyDown(): never {
    throw new HostBindingUnsupported('recordKeyDown');
  }
  recordSettingAccess(): never {
    throw new HostBindingUnsupported('recordSettingAccess');
  }
  recordFunctionCall(): never {
    throw new HostBindingUnsupported('recordFunctionCall');
  }
  setChromeFlag(): never {
    throw new HostBindingUnsupported('setChromeFlag');
  }
  requestRestart(): never {
    throw new HostBindingUnsupported('requestRestart');
  }
}
