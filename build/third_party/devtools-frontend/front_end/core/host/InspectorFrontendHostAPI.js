// Copyright 2015 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * This values should match the one getting called from Chromium
 */
export var Events;
(function (Events) {
    /* eslint-disable @typescript-eslint/naming-convention -- Accessed from web_tests */
    Events["AppendedToURL"] = "appendedToURL";
    Events["CanceledSaveURL"] = "canceledSaveURL";
    Events["ColorThemeChanged"] = "colorThemeChanged";
    Events["ContextMenuCleared"] = "contextMenuCleared";
    Events["ContextMenuItemSelected"] = "contextMenuItemSelected";
    Events["DeviceCountUpdated"] = "deviceCountUpdated";
    Events["DevicesDiscoveryConfigChanged"] = "devicesDiscoveryConfigChanged";
    Events["DevicesPortForwardingStatusChanged"] = "devicesPortForwardingStatusChanged";
    Events["DevicesUpdated"] = "devicesUpdated";
    Events["DispatchMessage"] = "dispatchMessage";
    Events["DispatchMessageChunk"] = "dispatchMessageChunk";
    Events["EnterInspectElementMode"] = "enterInspectElementMode";
    Events["EyeDropperPickedColor"] = "eyeDropperPickedColor";
    Events["FileSystemsLoaded"] = "fileSystemsLoaded";
    Events["FileSystemRemoved"] = "fileSystemRemoved";
    Events["FileSystemAdded"] = "fileSystemAdded";
    Events["FileSystemFilesChangedAddedRemoved"] = "fileSystemFilesChangedAddedRemoved";
    Events["IndexingTotalWorkCalculated"] = "indexingTotalWorkCalculated";
    Events["IndexingWorked"] = "indexingWorked";
    Events["IndexingDone"] = "indexingDone";
    Events["KeyEventUnhandled"] = "keyEventUnhandled";
    Events["ReloadInspectedPage"] = "reloadInspectedPage";
    Events["RevealSourceLine"] = "revealSourceLine";
    Events["SavedURL"] = "savedURL";
    Events["SearchCompleted"] = "searchCompleted";
    Events["SetInspectedTabId"] = "setInspectedTabId";
    Events["SetUseSoftMenu"] = "setUseSoftMenu";
    Events["ShowPanel"] = "showPanel";
    /* eslint-enable @typescript-eslint/naming-convention */
})(Events || (Events = {}));
export const EventDescriptors = [
    [Events.AppendedToURL, ['url']],
    [Events.CanceledSaveURL, ['url']],
    [Events.ColorThemeChanged, []],
    [Events.ContextMenuCleared, []],
    [Events.ContextMenuItemSelected, ['id']],
    [Events.DeviceCountUpdated, ['count']],
    [Events.DevicesDiscoveryConfigChanged, ['config']],
    [Events.DevicesPortForwardingStatusChanged, ['status']],
    [Events.DevicesUpdated, ['devices']],
    [Events.DispatchMessage, ['messageObject']],
    [Events.DispatchMessageChunk, ['messageChunk', 'messageSize']],
    [Events.EnterInspectElementMode, []],
    [Events.EyeDropperPickedColor, ['color']],
    [Events.FileSystemsLoaded, ['fileSystems']],
    [Events.FileSystemRemoved, ['fileSystemPath']],
    [Events.FileSystemAdded, ['errorMessage', 'fileSystem']],
    [Events.FileSystemFilesChangedAddedRemoved, ['changed', 'added', 'removed']],
    [Events.IndexingTotalWorkCalculated, ['requestId', 'fileSystemPath', 'totalWork']],
    [Events.IndexingWorked, ['requestId', 'fileSystemPath', 'worked']],
    [Events.IndexingDone, ['requestId', 'fileSystemPath']],
    [Events.KeyEventUnhandled, ['event']],
    [Events.ReloadInspectedPage, ['hard']],
    [Events.RevealSourceLine, ['url', 'lineNumber', 'columnNumber']],
    [Events.SavedURL, ['url', 'fileSystemPath']],
    [Events.SearchCompleted, ['requestId', 'fileSystemPath', 'files']],
    [Events.SetInspectedTabId, ['tabId']],
    [Events.SetUseSoftMenu, ['useSoftMenu']],
    [Events.ShowPanel, ['panelName']],
];
//# sourceMappingURL=InspectorFrontendHostAPI.js.map