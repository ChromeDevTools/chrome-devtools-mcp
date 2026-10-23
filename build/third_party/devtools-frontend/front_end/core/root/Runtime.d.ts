import * as Platform from '../platform/platform.js';
import type { ExperimentName } from './ExperimentNames.js';
/**
 * Returns the base URL (similar to `<base>`).
 * Used to resolve the relative URLs of any additional DevTools files (locale strings, etc) needed.
 * See: https://cs.chromium.org/remoteBase+f:devtools_window
 */
export declare function getRemoteBase(location?: string): {
    base: string;
    version: string;
} | null;
export declare function getPathName(): string;
export declare function isNodeEntry(pathname: string): boolean;
export declare const getChromeVersion: () => string;
export declare class Runtime {
    #private;
    private constructor();
    static instance(opts?: {
        forceNew: boolean | null;
    } | undefined): Runtime;
    static removeInstance(): void;
    static queryParam(name: string): string | null;
    static setQueryParamForTesting(name: string, value: string): void;
    static isNode(): boolean;
    /**
     * Returns true if viewing the slimmed-down devtools meant for just viewing a
     * performance trace, e.g. devtools://devtools/bundled/trace_app.html?traceURL=http://...
     */
    static isTraceApp(): boolean;
    static setPlatform(platform: string): void;
    static platform(): string;
    static isDescriptorEnabled(descriptor: {
        experiment?: string | null;
        condition?: Condition;
    }): boolean;
    loadLegacyModule(modulePath: string): Promise<unknown>;
}
export interface Option {
    title: string;
    value: string | boolean;
    raw?: boolean;
    text?: string;
}
export declare class ExperimentsSupport {
    #private;
    allConfigurableExperiments(): Experiment[];
    register(params: {
        name: ExperimentName;
        title: string;
        aboutFlag: string;
        isEnabled: boolean;
        requiresChromeRestart: boolean;
        docLink?: Platform.DevToolsPath.UrlString;
        readonly feedbackLink?: Platform.DevToolsPath.UrlString;
    }): Experiment;
    isEnabled(experimentName: ExperimentName): boolean;
    setEnabled(experimentName: ExperimentName, enabled: boolean): void;
    enableForTest(experimentName: ExperimentName): void;
    disableForTest(experimentName: ExperimentName): void;
    isEnabledForTest(experimentName: ExperimentName): boolean;
    clearForTest(): void;
}
export declare class Experiment {
    #private;
    name: ExperimentName;
    title: string;
    aboutFlag: string;
    readonly requiresChromeRestart: boolean;
    docLink?: Platform.DevToolsPath.UrlString;
    readonly feedbackLink?: Platform.DevToolsPath.UrlString;
    constructor(params: {
        name: ExperimentName;
        title: string;
        experiments: ExperimentsSupport;
        aboutFlag: string;
        isEnabled: boolean;
        requiresChromeRestart: boolean;
        docLink?: Platform.DevToolsPath.UrlString;
        feedbackLink?: Platform.DevToolsPath.UrlString;
    });
    isEnabled(): boolean;
    setEnabled(enabled: boolean): void;
}
/** This must be constructed after the query parameters have been parsed. **/
export declare const experiments: ExperimentsSupport;
export declare enum GenAiEnterprisePolicyValue {
    ALLOW = 0,
    ALLOW_WITHOUT_LOGGING = 1,
    DISABLE = 2
}
export interface AidaAvailability {
    enabled: boolean;
    blockedByAge: boolean;
    blockedByEnterprisePolicy: boolean;
    blockedByGeo: boolean;
    disallowLogging: boolean;
    enterprisePolicyValue: number;
}
type Channel = 'stable' | 'beta' | 'dev' | 'canary';
export interface HostConfigConsoleInsights {
    modelId: string;
    temperature: number;
    enabled: boolean;
}
export declare enum HostConfigFreestylerExecutionMode {
    ALL_SCRIPTS = "ALL_SCRIPTS",
    SIDE_EFFECT_FREE_SCRIPTS_ONLY = "SIDE_EFFECT_FREE_SCRIPTS_ONLY",
    NO_SCRIPTS = "NO_SCRIPTS"
}
export interface HostConfigFreestyler {
    modelId: string;
    temperature: number;
    enabled: boolean;
    userTier: string;
    executionMode?: HostConfigFreestylerExecutionMode;
    multimodal?: boolean;
    multimodalUploadInput?: boolean;
    functionCalling?: boolean;
}
export interface HostConfigAiAssistanceNetworkAgent {
    modelId: string;
    temperature: number;
    enabled: boolean;
    userTier: string;
}
export interface HostConfigAiAssistancePerformanceAgent {
    modelId: string;
    temperature: number;
    enabled: boolean;
    userTier: string;
}
export interface HostConfigAiAssistanceFileAgent {
    modelId: string;
    temperature: number;
    enabled: boolean;
    userTier: string;
}
export interface HostConfigAiAssistanceAccessibilityAgent {
    enabled: boolean;
}
export interface HostConfigAiAssistanceStorageAgent {
    enabled: boolean;
}
export interface HostConfigAiCodeCompletion {
    modelId: string;
    temperature: number;
    enabled: boolean;
    userTier: string;
}
export interface HostConfigAiCodeGeneration {
    modelId: string;
    temperature: number;
    enabled: boolean;
    userTier: string;
}
export interface HostConfigAiCodeCompletionStyles {
    modelId: string;
    temperature: number;
    enabled: boolean;
    userTier: string;
}
export interface HostConfigDeepLinksViaExtensibilityApi {
    enabled: boolean;
}
export interface HostConfigGreenDevUi {
    enabled: boolean;
}
export interface HostConfigGeminiRebranding {
    enabled: boolean;
}
export interface HostConfigVeLogging {
    enabled: boolean;
    testing: boolean;
}
export interface HostConfigPrivacyUI {
    enabled: boolean;
}
export interface HostConfigEnableOriginBoundCookies {
    portBindingEnabled: boolean;
    schemeBindingEnabled: boolean;
}
export interface HostConfigAnimationStylesInStylesTab {
    enabled: boolean;
}
export interface HostConfigJpegXlImageFormat {
    enabled: boolean;
}
export interface HostConfigSourceMapScopesInSourcesPanel {
    enabled: boolean;
}
interface AiGeneratedTimelineLabels {
    enabled: boolean;
}
interface AllowInterestForcing {
    enabled: boolean;
}
interface GlobalAiButton {
    enabled: boolean;
    promotionEnabled: boolean;
}
interface GdpProfiles {
    enabled: boolean;
    badgesEnabled: boolean;
    starterBadgeEnabled: boolean;
}
export declare enum GdpProfilesEnterprisePolicyValue {
    ENABLED = 0,
    ENABLED_WITHOUT_BADGES = 1,
    DISABLED = 2
}
interface GdpProfilesAvailability {
    enabled: boolean;
    enterprisePolicyValue: GdpProfilesEnterprisePolicyValue;
}
interface ExtensionsOnChromeUrls {
    enabled: boolean;
}
interface DevToolsFlexibleLayout {
    verticalDrawerEnabled: boolean;
}
interface DeviceBoundSessionsDebugging {
    enabled: boolean;
}
export interface DevToolsEnableDurableMessages {
    enabled: boolean;
}
interface HostConfigAiAssistanceContextSelectionAgent {
    enabled: boolean;
}
interface ConsoleInsightsTeasers {
    enabled: boolean;
    allowWithoutGpu: boolean;
}
interface UseGcaApi {
    enabled: boolean;
}
interface DevToolsAiV2Architecture {
    enabled: boolean;
    userTier?: string;
}
interface DevToolsProtocolMonitor {
    enabled: boolean;
}
interface DevToolsAdsPanel {
    enabled: boolean;
}
interface DevToolsPlusButton {
    enabled: boolean;
}
interface DevToolsInstrumentationBreakpoints {
    enabled: boolean;
}
interface HostConfigDevToolsComments {
    enabled: boolean;
}
interface DevToolsAriaLiveRecording {
    enabled: boolean;
}
interface DevToolsMobileSafeAreaEmulation {
    enabled: boolean;
}
interface DevToolsNetworkBackendLinking {
    enabled: boolean;
}
interface DevToolsAiNaturalLanguageInterface {
    enabled: boolean;
}
/**
 * The host configuration that we expect from the DevTools back-end.
 *
 * We use `RecursivePartial` here to enforce that DevTools code is able to
 * handle `HostConfig` objects of an unexpected shape. This can happen if
 * the implementation in the Chromium backend is changed without correctly
 * updating the DevTools frontend. Or if remote debugging a different version
 * of Chrome, resulting in the local browser window and the local DevTools
 * window being of different versions, and consequently potentially having
 * differently shaped `HostConfig`s.
 *
 * @see hostConfig
 */
export type HostConfig = Platform.TypeScriptUtilities.RecursivePartial<{
    aidaAvailability: AidaAvailability;
    channel: Channel;
    devToolsConsoleInsights: HostConfigConsoleInsights;
    devToolsDeepLinksViaExtensibilityApi: HostConfigDeepLinksViaExtensibilityApi;
    devToolsFreestyler: HostConfigFreestyler;
    devToolsGreenDevUi: HostConfigGreenDevUi;
    devToolsAiAssistanceNetworkAgent: HostConfigAiAssistanceNetworkAgent;
    devToolsAiAssistanceFileAgent: HostConfigAiAssistanceFileAgent;
    devToolsAiAssistancePerformanceAgent: HostConfigAiAssistancePerformanceAgent;
    devToolsAiAssistanceAccessibilityAgent: HostConfigAiAssistanceAccessibilityAgent;
    devToolsAiAssistanceStorageAgent: HostConfigAiAssistanceStorageAgent;
    devToolsAiV2Architecture: DevToolsAiV2Architecture;
    devToolsAiCodeCompletion: HostConfigAiCodeCompletion;
    devToolsAiCodeGeneration: HostConfigAiCodeGeneration;
    devToolsAiCodeCompletionStyles: HostConfigAiCodeCompletionStyles;
    devToolsVeLogging: HostConfigVeLogging;
    devToolsAiNaturalLanguageInterface: DevToolsAiNaturalLanguageInterface;
    /**
     * OffTheRecord here indicates that the user's profile is either incognito,
     * or guest mode, rather than a "normal" profile.
     */
    isOffTheRecord: boolean;
    devToolsEnableOriginBoundCookies: HostConfigEnableOriginBoundCookies;
    devToolsAnimationStylesInStylesTab: HostConfigAnimationStylesInStylesTab;
    devToolsJpegXlImageFormat: HostConfigJpegXlImageFormat;
    devToolsSourceMapScopesInSourcesPanel: HostConfigSourceMapScopesInSourcesPanel;
    devToolsAiGeneratedTimelineLabels: AiGeneratedTimelineLabels;
    devToolsAllowInterestForcing: AllowInterestForcing;
    devToolsGlobalAiButton: GlobalAiButton;
    devToolsGdpProfiles: GdpProfiles;
    devToolsGdpProfilesAvailability: GdpProfilesAvailability;
    devToolsFlexibleLayout: DevToolsFlexibleLayout;
    deviceBoundSessionsDebugging: DeviceBoundSessionsDebugging;
    devToolsEnableDurableMessages: DevToolsEnableDurableMessages;
    devToolsAiAssistanceContextSelectionAgent: HostConfigAiAssistanceContextSelectionAgent;
    devToolsConsoleInsightsTeasers: ConsoleInsightsTeasers;
    devToolsGeminiRebranding: HostConfigGeminiRebranding;
    devToolsProtocolMonitor: DevToolsProtocolMonitor;
    devToolsAdsPanel: DevToolsAdsPanel;
    devToolsUseGcaApi: UseGcaApi;
    devToolsPlusButton: DevToolsPlusButton;
    devToolsAriaLiveRecording: DevToolsAriaLiveRecording;
    devToolsInstrumentationBreakpoints: DevToolsInstrumentationBreakpoints;
    devToolsMobileSafeAreaEmulation: DevToolsMobileSafeAreaEmulation;
    devToolsNetworkBackendLinking: DevToolsNetworkBackendLinking;
    extensionsOnChromeUrls: ExtensionsOnChromeUrls;
    devToolsComments: HostConfigDevToolsComments;
}>;
/**
 * The host configuration for this DevTools instance.
 *
 * This is initialized early during app startup and should not be modified
 * afterwards. In some cases it can be necessary to re-request the host
 * configuration from Chrome while DevTools is already running. In these
 * cases, the new host configuration should be reflected here, e.g.:
 *
 * ```js
 * const config = await new Promise<Root.Runtime.HostConfig>(
 *   resolve => InspectorFrontendHostInstance.getHostConfig(resolve));
 * Object.assign(Root.runtime.hostConfig, config);
 * ```
 */
export declare const hostConfig: Platform.TypeScriptUtilities.RecursiveReadonly<HostConfig>;
/**
 * When defining conditions make sure that objects used by the function have
 * been instantiated.
 */
export type Condition = (config?: HostConfig) => boolean;
export declare const conditions: {
    canDock: Condition;
};
export {};
