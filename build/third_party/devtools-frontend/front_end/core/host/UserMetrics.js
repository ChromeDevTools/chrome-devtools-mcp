// Copyright 2011 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import { InspectorFrontendHostInstance } from './InspectorFrontendHost.js';
import * as Enums from './UserMetricsEnums.js';
export class UserMetrics {
    sourcesPanelFileDebugged(mediaType) {
        const code = (mediaType && MediaTypes[mediaType]) || MediaTypes.Unknown;
        InspectorFrontendHostInstance.recordEnumeratedHistogram("DevTools.SourcesPanelFileDebugged" /* EnumeratedHistogram.SourcesPanelFileDebugged */, code, MediaTypes.MAX_VALUE);
    }
    sourcesPanelFileOpened(mediaType) {
        const code = (mediaType && MediaTypes[mediaType]) || MediaTypes.Unknown;
        InspectorFrontendHostInstance.recordEnumeratedHistogram("DevTools.SourcesPanelFileOpened" /* EnumeratedHistogram.SourcesPanelFileOpened */, code, MediaTypes.MAX_VALUE);
    }
    networkPanelResponsePreviewOpened(mediaType) {
        const code = (mediaType && MediaTypes[mediaType]) || MediaTypes.Unknown;
        InspectorFrontendHostInstance.recordEnumeratedHistogram("DevTools.NetworkPanelResponsePreviewOpened" /* EnumeratedHistogram.NetworkPanelResponsePreviewOpened */, code, MediaTypes.MAX_VALUE);
    }
    actionTaken(action) {
        InspectorFrontendHostInstance.recordEnumeratedHistogram("DevTools.ActionTaken" /* EnumeratedHistogram.ActionTaken */, action, Action.MAX_VALUE);
    }
    resendRequest(resourceType) {
        InspectorFrontendHostInstance.recordEnumeratedHistogram("DevTools.ResendRequest" /* EnumeratedHistogram.ResendRequest */, resourceType, ResendRequestType.MAX_VALUE);
    }
    editResendRequest(type) {
        InspectorFrontendHostInstance.recordEnumeratedHistogram("DevTools.EditResendRequest" /* EnumeratedHistogram.EditResendRequest */, type, ResendRequestType.MAX_VALUE);
    }
    keybindSetSettingChanged(keybindSet) {
        const value = KeybindSetSettings[keybindSet] || 0;
        InspectorFrontendHostInstance.recordEnumeratedHistogram("DevTools.KeybindSetSettingChanged" /* EnumeratedHistogram.KeybindSetSettingChanged */, value, KeybindSetSettings.MAX_VALUE);
    }
    keyboardShortcutFired(actionId) {
        const action = KeyboardShortcutAction[actionId] || KeyboardShortcutAction.OtherShortcut;
        InspectorFrontendHostInstance.recordEnumeratedHistogram("DevTools.KeyboardShortcutFired" /* EnumeratedHistogram.KeyboardShortcutFired */, action, KeyboardShortcutAction.MAX_VALUE);
    }
    issuesPanelOpenedFrom(issueOpener) {
        InspectorFrontendHostInstance.recordEnumeratedHistogram("DevTools.IssuesPanelOpenedFrom" /* EnumeratedHistogram.IssuesPanelOpenedFrom */, issueOpener, IssueOpener.MAX_VALUE);
    }
    issuesPanelIssueExpanded(issueExpandedCategory) {
        if (issueExpandedCategory === undefined) {
            return;
        }
        const issueExpanded = IssueExpanded[issueExpandedCategory];
        if (issueExpanded === undefined) {
            return;
        }
        InspectorFrontendHostInstance.recordEnumeratedHistogram("DevTools.IssuesPanelIssueExpanded" /* EnumeratedHistogram.IssuesPanelIssueExpanded */, issueExpanded, IssueExpanded.MAX_VALUE);
    }
    issuesPanelResourceOpened(issueCategory, type) {
        const key = issueCategory + type;
        const value = IssueResourceOpened[key];
        if (value === undefined) {
            return;
        }
        InspectorFrontendHostInstance.recordEnumeratedHistogram("DevTools.IssuesPanelResourceOpened" /* EnumeratedHistogram.IssuesPanelResourceOpened */, value, IssueResourceOpened.MAX_VALUE);
    }
    issueCreated(code) {
        const issueCreated = IssueCreated[code];
        if (issueCreated === undefined) {
            return;
        }
        InspectorFrontendHostInstance.recordEnumeratedHistogram("DevTools.IssueCreated" /* EnumeratedHistogram.IssueCreated */, issueCreated, IssueCreated.MAX_VALUE);
    }
    experimentEnabledAtLaunch(experimentId) {
        const experiment = DevtoolsExperiments[experimentId];
        if (experiment === undefined) {
            return;
        }
        InspectorFrontendHostInstance.recordEnumeratedHistogram("DevTools.ExperimentEnabledAtLaunch" /* EnumeratedHistogram.ExperimentEnabledAtLaunch */, experiment, DevtoolsExperiments.MAX_VALUE);
    }
    navigationSettingAtFirstTimelineLoad(state) {
        InspectorFrontendHostInstance.recordEnumeratedHistogram("DevTools.TimelineNavigationSettingState" /* EnumeratedHistogram.TimelineNavigationSettingState */, state, TimelineNavigationSetting.MAX_VALUE);
    }
    experimentDisabledAtLaunch(experimentId) {
        const experiment = DevtoolsExperiments[experimentId];
        if (experiment === undefined) {
            return;
        }
        InspectorFrontendHostInstance.recordEnumeratedHistogram("DevTools.ExperimentDisabledAtLaunch" /* EnumeratedHistogram.ExperimentDisabledAtLaunch */, experiment, DevtoolsExperiments.MAX_VALUE);
    }
    experimentChanged(experimentId, isEnabled) {
        const experiment = DevtoolsExperiments[experimentId];
        if (experiment === undefined) {
            return;
        }
        const actionName = isEnabled ? "DevTools.ExperimentEnabled" /* EnumeratedHistogram.ExperimentEnabled */ : "DevTools.ExperimentDisabled" /* EnumeratedHistogram.ExperimentDisabled */;
        InspectorFrontendHostInstance.recordEnumeratedHistogram(actionName, experiment, DevtoolsExperiments.MAX_VALUE);
    }
    developerResourceLoaded(developerResourceLoaded) {
        if (developerResourceLoaded >= DeveloperResourceLoaded.MAX_VALUE) {
            return;
        }
        InspectorFrontendHostInstance.recordEnumeratedHistogram("DevTools.DeveloperResourceLoaded" /* EnumeratedHistogram.DeveloperResourceLoaded */, developerResourceLoaded, DeveloperResourceLoaded.MAX_VALUE);
    }
    developerResourceScheme(developerResourceScheme) {
        if (developerResourceScheme >= DeveloperResourceScheme.MAX_VALUE) {
            return;
        }
        InspectorFrontendHostInstance.recordEnumeratedHistogram("DevTools.DeveloperResourceScheme" /* EnumeratedHistogram.DeveloperResourceScheme */, developerResourceScheme, DeveloperResourceScheme.MAX_VALUE);
    }
    language(language) {
        const languageCode = Language[language];
        if (languageCode === undefined) {
            return;
        }
        InspectorFrontendHostInstance.recordEnumeratedHistogram("DevTools.Language" /* EnumeratedHistogram.Language */, languageCode, Language.MAX_VALUE);
    }
    syncSetting(devtoolsSyncSettingEnabled) {
        InspectorFrontendHostInstance.getSyncInformation(syncInfo => {
            let settingValue = SyncSetting.CHROME_SYNC_DISABLED;
            if (syncInfo.isSyncActive && !syncInfo.arePreferencesSynced) {
                settingValue = SyncSetting.CHROME_SYNC_SETTINGS_DISABLED;
            }
            else if (syncInfo.isSyncActive && syncInfo.arePreferencesSynced) {
                settingValue = devtoolsSyncSettingEnabled ? SyncSetting.DEVTOOLS_SYNC_SETTING_ENABLED :
                    SyncSetting.DEVTOOLS_SYNC_SETTING_DISABLED;
            }
            InspectorFrontendHostInstance.recordEnumeratedHistogram("DevTools.SyncSetting" /* EnumeratedHistogram.SyncSetting */, settingValue, SyncSetting.MAX_VALUE);
        });
    }
    recordingToggled(value) {
        InspectorFrontendHostInstance.recordEnumeratedHistogram("DevTools.RecordingToggled" /* EnumeratedHistogram.RecordingToggled */, value, RecordingToggled.MAX_VALUE);
    }
    recordingReplayFinished(value) {
        InspectorFrontendHostInstance.recordEnumeratedHistogram("DevTools.RecordingReplayFinished" /* EnumeratedHistogram.RecordingReplayFinished */, value, RecordingReplayFinished.MAX_VALUE);
    }
    recordingReplayStarted(value) {
        InspectorFrontendHostInstance.recordEnumeratedHistogram("DevTools.RecordingReplayStarted" /* EnumeratedHistogram.RecordingReplayStarted */, value, RecordingReplayStarted.MAX_VALUE);
    }
    lighthouseModeRun(type) {
        InspectorFrontendHostInstance.recordEnumeratedHistogram("DevTools.LighthouseModeRun" /* EnumeratedHistogram.LighthouseModeRun */, type, LighthouseModeRun.MAX_VALUE);
    }
    lighthouseCategoryUsed(type) {
        InspectorFrontendHostInstance.recordEnumeratedHistogram("DevTools.LighthouseCategoryUsed" /* EnumeratedHistogram.LighthouseCategoryUsed */, type, LighthouseCategoryUsed.MAX_VALUE);
    }
    swatchActivated(swatch) {
        InspectorFrontendHostInstance.recordEnumeratedHistogram("DevTools.SwatchActivated" /* EnumeratedHistogram.SwatchActivated */, swatch, SwatchType.MAX_VALUE);
    }
    workspacesPopulated(wallClockTimeInMilliseconds) {
        InspectorFrontendHostInstance.recordPerformanceHistogram('DevTools.Workspaces.PopulateWallClocktime', wallClockTimeInMilliseconds);
    }
    visualLoggingProcessingDone(timeInMilliseconds) {
        InspectorFrontendHostInstance.recordPerformanceHistogram('DevTools.VisualLogging.ProcessingTime', timeInMilliseconds);
    }
    freestylerQueryLength(numberOfCharacters) {
        InspectorFrontendHostInstance.recordCountHistogram('DevTools.Freestyler.QueryLength', numberOfCharacters, 0, 100_000, 100);
    }
    freestylerEvalResponseSize(bytes) {
        InspectorFrontendHostInstance.recordCountHistogram('DevTools.Freestyler.EvalResponseSize', bytes, 0, 100_000, 100);
    }
    builtInAiAvailability(availability) {
        InspectorFrontendHostInstance.recordEnumeratedHistogram("DevTools.BuiltInAiAvailability" /* EnumeratedHistogram.BuiltInAiAvailability */, availability, BuiltInAiAvailability.MAX_VALUE);
    }
    consoleInsightTeaserGenerated(timeInMilliseconds) {
        InspectorFrontendHostInstance.recordPerformanceHistogram('DevTools.Insights.TeaserGenerationTime', timeInMilliseconds);
    }
    consoleInsightTeaserGeneratedMedium(timeInMilliseconds) {
        InspectorFrontendHostInstance.recordPerformanceHistogramMedium('DevTools.Insights.TeaserGenerationTimeMedium', timeInMilliseconds);
    }
    consoleInsightTeaserFirstChunkGenerated(timeInMilliseconds) {
        InspectorFrontendHostInstance.recordPerformanceHistogram('DevTools.Insights.TeaserFirstChunkGenerationTime', timeInMilliseconds);
    }
    consoleInsightTeaserFirstChunkGeneratedMedium(timeInMilliseconds) {
        InspectorFrontendHostInstance.recordPerformanceHistogramMedium('DevTools.Insights.TeaserFirstChunkGenerationTimeMedium', timeInMilliseconds);
    }
    consoleInsightTeaserChunkToEndMedium(timeInMilliseconds) {
        InspectorFrontendHostInstance.recordPerformanceHistogramMedium('DevTools.Insights.TeaserChunkToEndMedium', timeInMilliseconds);
    }
    consoleInsightTeaserAbortedAfterFirstCharacter(timeInMilliseconds) {
        InspectorFrontendHostInstance.recordPerformanceHistogram('DevTools.Insights.TeaserAfterFirstCharacterAbortionTime', timeInMilliseconds);
    }
    consoleInsightTeaserAbortedBeforeFirstCharacter(timeInMilliseconds) {
        InspectorFrontendHostInstance.recordPerformanceHistogram('DevTools.Insights.TeaserBeforeFirstCharacterAbortionTime', timeInMilliseconds);
    }
    consoleInsightLongTeaserGenerated(timeInMilliseconds) {
        InspectorFrontendHostInstance.recordPerformanceHistogram('DevTools.Insights.LongTeaserGenerationTime', timeInMilliseconds);
    }
    consoleInsightShortTeaserGenerated(timeInMilliseconds) {
        InspectorFrontendHostInstance.recordPerformanceHistogram('DevTools.Insights.ShortTeaserGenerationTime', timeInMilliseconds);
    }
    changeRecorded(count) {
        InspectorFrontendHostInstance.recordCountHistogram('DevTools.Comments.ChangeRecorded', count, 1, 100, 50);
    }
    changeSharedWithAgent(count) {
        InspectorFrontendHostInstance.recordCountHistogram('DevTools.Comments.ChangeSharedWithAgent', count, 1, 100, 50);
    }
    commentCreated(count) {
        InspectorFrontendHostInstance.recordCountHistogram('DevTools.Comments.CommentCreated', count, 1, 100, 50);
    }
    commentResolved(resolver, count) {
        InspectorFrontendHostInstance.recordCountHistogram(`DevTools.Comments.CommentResolvedBy${resolver}`, count, 1, 100, 50);
    }
    commentSharedWithAgent(count) {
        InspectorFrontendHostInstance.recordCountHistogram('DevTools.Comments.CommentSharedWithAgent', count, 1, 100, 50);
    }
    commentSize(characters) {
        InspectorFrontendHostInstance.recordCountHistogram('DevTools.Comments.CommentSize', characters, 1, 100_000, 50);
    }
}
/**
 * Creates a proxy that delays the resolution of UMA enum values until runtime.
 * We do this to decouple the UMA metrics from the TypeScript compilation.
 * This ensures that when DevTools is used with remote debugging or as a
 * custom frontend, the enum boundary values exactly match what the host
 * Chrome binary expects (which is provided via devtools_compatibility.js).
 */
function createDynamicEnumProxy(enumName, fallbackEnum) {
    return new Proxy(fallbackEnum, {
        get(_target, prop) {
            if (typeof prop === 'symbol') {
                return Reflect.get(fallbackEnum, prop);
            }
            const metrics = 
            // eslint-disable-next-line @typescript-eslint/naming-convention
            globalThis.DevToolsMetrics;
            const enumObj = metrics && metrics[enumName];
            if (enumObj && prop in enumObj) {
                return enumObj[prop];
            }
            // Support reverse lookups for numeric values.
            if (typeof prop === 'string' && /^\d+$/.test(prop)) {
                const value = Number(prop);
                for (const [key, val] of Object.entries(enumObj || {})) {
                    if (val === value) {
                        return key;
                    }
                }
            }
            // Fallback to the compile-time TypeScript enum if DevToolsMetrics is missing
            return Reflect.get(fallbackEnum, prop);
        },
        has(_target, prop) {
            const metrics = 
            // eslint-disable-next-line @typescript-eslint/naming-convention
            globalThis.DevToolsMetrics;
            const enumObj = metrics && metrics[enumName];
            if (enumObj && prop in enumObj) {
                return true;
            }
            if (typeof prop === 'string' && /^\d+$/.test(prop)) {
                return Object.values(enumObj || {}).includes(Number(prop));
            }
            return Reflect.has(fallbackEnum, prop);
        },
        ownKeys(_target) {
            const metrics = 
            // eslint-disable-next-line @typescript-eslint/naming-convention
            globalThis.DevToolsMetrics;
            const enumObj = metrics && metrics[enumName];
            return enumObj ? Reflect.ownKeys(enumObj) : Reflect.ownKeys(fallbackEnum);
        },
        getOwnPropertyDescriptor(_target, prop) {
            const metrics = 
            // eslint-disable-next-line @typescript-eslint/naming-convention
            globalThis.DevToolsMetrics;
            const enumObj = metrics && metrics[enumName];
            if (!enumObj) {
                return Reflect.getOwnPropertyDescriptor(fallbackEnum, prop);
            }
            return Reflect.getOwnPropertyDescriptor(enumObj, prop);
        },
    });
}
export const Action = createDynamicEnumProxy('Action', Enums.Action);
export const PanelCodes = createDynamicEnumProxy('PanelCodes', Enums.PanelCodes);
export const MediaTypes = createDynamicEnumProxy('MediaTypes', Enums.MediaTypes);
export const KeybindSetSettings = createDynamicEnumProxy('KeybindSetSettings', Enums.KeybindSetSettings);
export const KeyboardShortcutAction = createDynamicEnumProxy('KeyboardShortcutAction', Enums.KeyboardShortcutAction);
export const IssueOpener = createDynamicEnumProxy('IssueOpener', Enums.IssueOpener);
export const DevtoolsExperiments = createDynamicEnumProxy('DevtoolsExperiments', Enums.DevtoolsExperiments);
export const IssueExpanded = createDynamicEnumProxy('IssueExpanded', Enums.IssueExpanded);
export const IssueResourceOpened = createDynamicEnumProxy('IssueResourceOpened', Enums.IssueResourceOpened);
export const IssueCreated = createDynamicEnumProxy('IssueCreated', Enums.IssueCreated);
export const DeveloperResourceLoaded = createDynamicEnumProxy('DeveloperResourceLoaded', Enums.DeveloperResourceLoaded);
export const DeveloperResourceScheme = createDynamicEnumProxy('DeveloperResourceScheme', Enums.DeveloperResourceScheme);
export const Language = createDynamicEnumProxy('Language', Enums.Language);
export const SyncSetting = createDynamicEnumProxy('SyncSetting', Enums.SyncSetting);
export const RecordingToggled = createDynamicEnumProxy('RecordingToggled', Enums.RecordingToggled);
export const RecordingAssertion = createDynamicEnumProxy('RecordingAssertion', Enums.RecordingAssertion);
export const RecordingReplayFinished = createDynamicEnumProxy('RecordingReplayFinished', Enums.RecordingReplayFinished);
export const RecordingReplaySpeed = createDynamicEnumProxy('RecordingReplaySpeed', Enums.RecordingReplaySpeed);
export const RecordingReplayStarted = createDynamicEnumProxy('RecordingReplayStarted', Enums.RecordingReplayStarted);
export const RecordingEdited = createDynamicEnumProxy('RecordingEdited', Enums.RecordingEdited);
export const RecordingExported = createDynamicEnumProxy('RecordingExported', Enums.RecordingExported);
export const RecordingCodeToggled = createDynamicEnumProxy('RecordingCodeToggled', Enums.RecordingCodeToggled);
export const RecordingCopiedToClipboard = createDynamicEnumProxy('RecordingCopiedToClipboard', Enums.RecordingCopiedToClipboard);
export const ManifestSectionCodes = createDynamicEnumProxy('ManifestSectionCodes', Enums.ManifestSectionCodes);
export const LighthouseModeRun = createDynamicEnumProxy('LighthouseModeRun', Enums.LighthouseModeRun);
export const LighthouseCategoryUsed = createDynamicEnumProxy('LighthouseCategoryUsed', Enums.LighthouseCategoryUsed);
export const SwatchType = createDynamicEnumProxy('SwatchType', Enums.SwatchType);
export const BadgeType = createDynamicEnumProxy('BadgeType', Enums.BadgeType);
export const AnimationsPlaybackRate = createDynamicEnumProxy('AnimationsPlaybackRate', Enums.AnimationsPlaybackRate);
export const TimelineNavigationSetting = createDynamicEnumProxy('TimelineNavigationSetting', Enums.TimelineNavigationSetting);
export const BuiltInAiAvailability = createDynamicEnumProxy('BuiltInAiAvailability', Enums.BuiltInAiAvailability);
export const ResendRequestType = createDynamicEnumProxy('ResendRequestType', Enums.ResendRequestType);
const resendRequestTypeMap = new Map([
    [Common.ResourceType.resourceTypes.XHR, 'XHR'],
    [Common.ResourceType.resourceTypes.Fetch, 'FETCH'],
    [Common.ResourceType.resourceTypes.Script, 'SCRIPT'],
    [Common.ResourceType.resourceTypes.Stylesheet, 'STYLESHEET'],
    [Common.ResourceType.resourceTypes.Image, 'IMAGE'],
    [Common.ResourceType.resourceTypes.Media, 'MEDIA'],
    [Common.ResourceType.resourceTypes.Font, 'FONT'],
    [Common.ResourceType.resourceTypes.Wasm, 'WASM'],
    [Common.ResourceType.resourceTypes.Manifest, 'MANIFEST'],
    [Common.ResourceType.resourceTypes.TextTrack, 'TEXT_TRACK'],
    [Common.ResourceType.resourceTypes.SourceMapScript, 'SOURCE_MAP_SCRIPT'],
    [Common.ResourceType.resourceTypes.SourceMapStyleSheet, 'SOURCE_MAP_STYLE_SHEET'],
    [Common.ResourceType.resourceTypes.Document, 'DOCUMENT'],
    [Common.ResourceType.resourceTypes.Prefetch, 'PREFETCH'],
    [Common.ResourceType.resourceTypes.Ping, 'PING'],
]);
export function resendRequestType(resourceType) {
    const key = resendRequestTypeMap.get(resourceType);
    return (key ? ResendRequestType[key] : undefined) ?? ResendRequestType.OTHER;
}
//# sourceMappingURL=UserMetrics.js.map