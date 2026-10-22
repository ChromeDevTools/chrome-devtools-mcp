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
/**
 * Enum for recordEnumeratedHistogram
 * Warning: There is another definition of this enum in the DevTools code
 * base, keep them in sync:
 * front_end/devtools_compatibility.js
 */
export var EnumeratedHistogram;
(function (EnumeratedHistogram) {
    /* eslint-disable @typescript-eslint/naming-convention -- Shadows a legacy enum */
    // LINT.IfChange(EnumeratedHistogram)
    EnumeratedHistogram["ActionTaken"] = "DevTools.ActionTaken";
    EnumeratedHistogram["PanelShown"] = "DevTools.PanelShown";
    EnumeratedHistogram["KeyboardShortcutFired"] = "DevTools.KeyboardShortcutFired";
    EnumeratedHistogram["IssueCreated"] = "DevTools.IssueCreated";
    EnumeratedHistogram["IssuesPanelIssueExpanded"] = "DevTools.IssuesPanelIssueExpanded";
    EnumeratedHistogram["IssuesPanelOpenedFrom"] = "DevTools.IssuesPanelOpenedFrom";
    EnumeratedHistogram["IssuesPanelResourceOpened"] = "DevTools.IssuesPanelResourceOpened";
    EnumeratedHistogram["KeybindSetSettingChanged"] = "DevTools.KeybindSetSettingChanged";
    EnumeratedHistogram["ExperimentEnabledAtLaunch"] = "DevTools.ExperimentEnabledAtLaunch";
    EnumeratedHistogram["ExperimentDisabledAtLaunch"] = "DevTools.ExperimentDisabledAtLaunch";
    EnumeratedHistogram["ExperimentEnabled"] = "DevTools.ExperimentEnabled";
    EnumeratedHistogram["ExperimentDisabled"] = "DevTools.ExperimentDisabled";
    EnumeratedHistogram["DeveloperResourceLoaded"] = "DevTools.DeveloperResourceLoaded";
    EnumeratedHistogram["DeveloperResourceScheme"] = "DevTools.DeveloperResourceScheme";
    EnumeratedHistogram["Language"] = "DevTools.Language";
    EnumeratedHistogram["SyncSetting"] = "DevTools.SyncSetting";
    EnumeratedHistogram["RecordingReplayFinished"] = "DevTools.RecordingReplayFinished";
    EnumeratedHistogram["RecordingReplayStarted"] = "DevTools.RecordingReplayStarted";
    EnumeratedHistogram["RecordingToggled"] = "DevTools.RecordingToggled";
    EnumeratedHistogram["SourcesPanelFileDebugged"] = "DevTools.SourcesPanelFileDebugged";
    EnumeratedHistogram["SourcesPanelFileOpened"] = "DevTools.SourcesPanelFileOpened";
    EnumeratedHistogram["NetworkPanelResponsePreviewOpened"] = "DevTools.NetworkPanelResponsePreviewOpened";
    EnumeratedHistogram["TimelineNavigationSettingState"] = "DevTools.TimelineNavigationSettingState";
    EnumeratedHistogram["LighthouseModeRun"] = "DevTools.LighthouseModeRun";
    EnumeratedHistogram["LighthouseCategoryUsed"] = "DevTools.LighthouseCategoryUsed";
    EnumeratedHistogram["SwatchActivated"] = "DevTools.SwatchActivated";
    EnumeratedHistogram["BuiltInAiAvailability"] = "DevTools.BuiltInAiAvailability";
    EnumeratedHistogram["ResendRequest"] = "DevTools.ResendRequest";
    EnumeratedHistogram["EditResendRequest"] = "DevTools.EditResendRequest";
    // LINT.ThenChange(/front_end/devtools_compatibility.js:EnumeratedHistogram)
})(EnumeratedHistogram || (EnumeratedHistogram = {}));
//# sourceMappingURL=InspectorFrontendHostAPI.js.map