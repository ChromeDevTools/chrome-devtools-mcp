// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
export const jsSourceMapsEnabledSettingDescriptor = {
    name: 'js-source-maps-enabled',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: true,
    storageType: "Synced" /* Common.Settings.SettingStorageType.SYNCED */,
};
export const cssSourceMapsEnabledSettingDescriptor = {
    name: 'css-source-maps-enabled',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: true,
    storageType: "Synced" /* Common.Settings.SettingStorageType.SYNCED */,
};
export const preserveConsoleLogSettingDescriptor = {
    name: 'preserve-console-log',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    storageType: "Synced" /* Common.Settings.SettingStorageType.SYNCED */,
};
export const pauseOnExceptionEnabledSettingDescriptor = {
    name: 'pause-on-exception-enabled',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
};
export const pauseOnCaughtExceptionSettingDescriptor = {
    name: 'pause-on-caught-exception',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
};
export const pauseOnUncaughtExceptionSettingDescriptor = {
    name: 'pause-on-uncaught-exception',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
};
export const javaScriptDisabledSettingDescriptor = {
    name: 'java-script-disabled',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    storageType: "Session" /* Common.Settings.SettingStorageType.SESSION */,
};
export const disableAsyncStackTracesSettingDescriptor = {
    name: 'disable-async-stack-traces',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
};
export const breakpointsActiveSettingDescriptor = {
    name: 'breakpoints-active',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: true,
    storageType: "Session" /* Common.Settings.SettingStorageType.SESSION */,
};
export const showMetricsRulersSettingDescriptor = {
    name: 'show-metrics-rulers',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    storageType: "Synced" /* Common.Settings.SettingStorageType.SYNCED */,
};
export const apcaSettingDescriptor = {
    name: 'apca',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    storageType: "Synced" /* Common.Settings.SettingStorageType.SYNCED */,
};
export const showGridAreasSettingDescriptor = {
    name: 'show-grid-areas',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    storageType: "Synced" /* Common.Settings.SettingStorageType.SYNCED */,
};
export const showGridTrackSizesSettingDescriptor = {
    name: 'show-grid-track-sizes',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    storageType: "Synced" /* Common.Settings.SettingStorageType.SYNCED */,
};
export const extendGridLinesSettingDescriptor = {
    name: 'extend-grid-lines',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    storageType: "Synced" /* Common.Settings.SettingStorageType.SYNCED */,
};
export const showGridLineLabelsSettingDescriptor = {
    name: 'show-grid-line-labels',
    type: "enum" /* Common.Settings.SettingType.ENUM */,
    defaultValue: 'lineNumbers',
    storageType: "Synced" /* Common.Settings.SettingStorageType.SYNCED */,
};
export const showPaintRectsSettingDescriptor = {
    name: 'show-paint-rects',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    storageType: "Session" /* Common.Settings.SettingStorageType.SESSION */,
};
export const showLayoutShiftRegionsSettingDescriptor = {
    name: 'show-layout-shift-regions',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    storageType: "Session" /* Common.Settings.SettingStorageType.SESSION */,
};
export const showAdHighlightsSettingDescriptor = {
    name: 'show-ad-highlights',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    storageType: "Session" /* Common.Settings.SettingStorageType.SESSION */,
};
export const showDebugBordersSettingDescriptor = {
    name: 'show-debug-borders',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    storageType: "Session" /* Common.Settings.SettingStorageType.SESSION */,
};
export const showFPSCounterSettingDescriptor = {
    name: 'show-fps-counter',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    storageType: "Session" /* Common.Settings.SettingStorageType.SESSION */,
};
export const showScrollBottleneckRectsSettingDescriptor = {
    name: 'show-scroll-bottleneck-rects',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    storageType: "Session" /* Common.Settings.SettingStorageType.SESSION */,
};
export const emulatePageFocusSettingDescriptor = {
    name: 'emulate-page-focus',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    storageType: "Local" /* Common.Settings.SettingStorageType.LOCAL */,
};
export const emulatedCSSMediaSettingDescriptor = {
    name: 'emulated-css-media',
    type: "enum" /* Common.Settings.SettingType.ENUM */,
    defaultValue: '',
    storageType: "Session" /* Common.Settings.SettingStorageType.SESSION */,
};
export const cpuPressureSettingDescriptor = {
    name: 'emulation.cpu-pressure',
    type: "enum" /* Common.Settings.SettingType.ENUM */,
    defaultValue: 'none',
};
export const cpuPerformanceSettingDescriptor = {
    name: 'emulation.cpu-performance',
    type: "enum" /* Common.Settings.SettingType.ENUM */,
    defaultValue: 'no-override',
};
export const touchSettingDescriptor = {
    name: 'emulation.touch',
    type: "enum" /* Common.Settings.SettingType.ENUM */,
    defaultValue: 'none',
};
export const idleDetectionSettingDescriptor = {
    name: 'emulation.idle-detection',
    type: "enum" /* Common.Settings.SettingType.ENUM */,
    defaultValue: 'none',
};
export const emulatedCSSMediaFeaturePrefersColorSchemeSettingDescriptor = {
    name: 'emulated-css-media-feature-prefers-color-scheme',
    type: "enum" /* Common.Settings.SettingType.ENUM */,
    defaultValue: '',
    storageType: "Session" /* Common.Settings.SettingStorageType.SESSION */,
};
export const emulatedCSSMediaFeatureForcedColorsSettingDescriptor = {
    name: 'emulated-css-media-feature-forced-colors',
    type: "enum" /* Common.Settings.SettingType.ENUM */,
    defaultValue: '',
    storageType: "Session" /* Common.Settings.SettingStorageType.SESSION */,
};
export const emulatedCSSMediaFeaturePrefersReducedMotionSettingDescriptor = {
    name: 'emulated-css-media-feature-prefers-reduced-motion',
    type: "enum" /* Common.Settings.SettingType.ENUM */,
    defaultValue: '',
    storageType: "Session" /* Common.Settings.SettingStorageType.SESSION */,
};
export const emulatedCSSMediaFeaturePrefersContrastSettingDescriptor = {
    name: 'emulated-css-media-feature-prefers-contrast',
    type: "enum" /* Common.Settings.SettingType.ENUM */,
    defaultValue: '',
    storageType: "Session" /* Common.Settings.SettingStorageType.SESSION */,
};
export const emulatedCSSMediaFeaturePrefersReducedDataSettingDescriptor = {
    name: 'emulated-css-media-feature-prefers-reduced-data',
    type: "enum" /* Common.Settings.SettingType.ENUM */,
    defaultValue: '',
    storageType: "Session" /* Common.Settings.SettingStorageType.SESSION */,
};
export const dataSaverSettingDescriptor = {
    name: 'emulation.data-saver',
    type: "enum" /* Common.Settings.SettingType.ENUM */,
    defaultValue: "unset" /* DataSaverOverride.UNSET */,
    storageType: "Session" /* Common.Settings.SettingStorageType.SESSION */,
};
export const emulatedCSSMediaFeaturePrefersReducedTransparencySettingDescriptor = {
    name: 'emulated-css-media-feature-prefers-reduced-transparency',
    type: "enum" /* Common.Settings.SettingType.ENUM */,
    defaultValue: '',
    storageType: "Session" /* Common.Settings.SettingStorageType.SESSION */,
};
export const emulatedCSSMediaFeatureColorGamutSettingDescriptor = {
    name: 'emulated-css-media-feature-color-gamut',
    type: "enum" /* Common.Settings.SettingType.ENUM */,
    defaultValue: '',
    storageType: "Session" /* Common.Settings.SettingStorageType.SESSION */,
};
export const emulatedVisionDeficiencySettingDescriptor = {
    name: 'emulated-vision-deficiency',
    type: "enum" /* Common.Settings.SettingType.ENUM */,
    defaultValue: 'none',
    storageType: "Session" /* Common.Settings.SettingStorageType.SESSION */,
};
export const emulatedOSTextScaleSettingDescriptor = {
    name: 'emulated-os-text-scale',
    type: "enum" /* Common.Settings.SettingType.ENUM */,
    defaultValue: '',
    storageType: "Session" /* Common.Settings.SettingStorageType.SESSION */,
};
export const localFontsDisabledSettingDescriptor = {
    name: 'local-fonts-disabled',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    storageType: "Session" /* Common.Settings.SettingStorageType.SESSION */,
};
export const avifFormatDisabledSettingDescriptor = {
    name: 'avif-format-disabled',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    storageType: "Session" /* Common.Settings.SettingStorageType.SESSION */,
};
export const jpegXlFormatDisabledSettingDescriptor = {
    name: 'jpeg-xl-format-disabled',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    storageType: "Session" /* Common.Settings.SettingStorageType.SESSION */,
};
export const webpFormatDisabledSettingDescriptor = {
    name: 'webp-format-disabled',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    storageType: "Session" /* Common.Settings.SettingStorageType.SESSION */,
};
export const customFormattersSettingDescriptor = {
    name: 'custom-formatters',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
};
export const requestBlockingEnabledSettingDescriptor = {
    name: 'request-blocking-enabled',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    storageType: "Local" /* Common.Settings.SettingStorageType.LOCAL */,
};
export const cacheDisabledSettingDescriptor = {
    name: 'cache-disabled',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
};
export const emulateAutoDarkModeSettingDescriptor = {
    name: 'emulate-auto-dark-mode',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    storageType: "Session" /* Common.Settings.SettingStorageType.SESSION */,
};
export const enableRemoteFileLoadingSettingDescriptor = {
    name: 'network.enable-remote-file-loading',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    storageType: "Synced" /* Common.Settings.SettingStorageType.SYNCED */,
};
export const consoleUserActivationEvalSettingDescriptor = {
    name: 'console-user-activation-eval',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: true,
    storageType: "Synced" /* Common.Settings.SettingStorageType.SYNCED */,
};
export const monitoringXHREnabledSettingDescriptor = {
    name: 'monitoring-xhr-enabled',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    storageType: "Synced" /* Common.Settings.SettingStorageType.SYNCED */,
};
export const disablePausedStateOverlaySettingDescriptor = {
    name: 'disable-paused-state-overlay',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    storageType: "Synced" /* Common.Settings.SettingStorageType.SYNCED */,
};
export const preserveNetworkLogSettingDescriptor = {
    name: 'network-log.preserve-log',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
};
export const textEditorIndentSettingDescriptor = {
    name: 'text-editor-indent',
    type: "enum" /* Common.Settings.SettingType.ENUM */,
    defaultValue: '    ',
    storageType: "Synced" /* Common.Settings.SettingStorageType.SYNCED */,
};
//# sourceMappingURL=SDKSettings.js.map