import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import type { UISourceCode } from './UISourceCode.js';
export interface IgnoreListGeneralRules {
    isContentScript?: boolean;
    isKnownThirdParty?: boolean;
    isCurrentlyIgnoreListed?: boolean;
}
export declare const skipStackFramesPatternSettingDescriptor: Common.Settings.SettingDescriptor<string>;
export declare const skipContentScriptsSettingDescriptor: Common.Settings.SettingDescriptor<boolean>;
export declare const automaticallyIgnoreListKnownThirdPartyScriptsSettingDescriptor: Common.Settings.SettingDescriptor<boolean>;
export declare const skipAnonymousScriptsSettingDescriptor: Common.Settings.SettingDescriptor<boolean>;
export declare const enableIgnoreListingSettingDescriptor: Common.Settings.SettingDescriptor<boolean>;
export declare class IgnoreListManager extends Common.ObjectWrapper.ObjectWrapper<EventTypes> implements SDK.TargetManager.SDKModelObserver<SDK.DebuggerModel.DebuggerModel> {
    #private;
    constructor(settings: Common.Settings.Settings, targetManager: SDK.TargetManager.TargetManager);
    static instance(opts?: {
        forceNew: boolean | null;
        settings?: Common.Settings.Settings;
        targetManager?: SDK.TargetManager.TargetManager;
    }): IgnoreListManager;
    static removeInstance(): void;
    addChangeListener(listener: () => void): void;
    removeChangeListener(listener: () => void): void;
    modelAdded(debuggerModel: SDK.DebuggerModel.DebuggerModel): void;
    modelRemoved(debuggerModel: SDK.DebuggerModel.DebuggerModel): void;
    private isContentScript;
    private onExecutionContextCreated;
    private onExecutionContextDestroyed;
    private clearCacheIfNeeded;
    private getSkipStackFramesPatternSetting;
    private setIgnoreListPatterns;
    private updateIgnoredExecutionContexts;
    private getGeneralRulesForUISourceCode;
    isUserOrSourceMapIgnoreListedUISourceCode(uiSourceCode: UISourceCode): boolean;
    isUserIgnoreListedURL(url: Platform.DevToolsPath.UrlString | null, options?: IgnoreListGeneralRules): boolean;
    getFirstMatchedRegex(url: Platform.DevToolsPath.UrlString): RegExp | null;
    private sourceMapAttached;
    private sourceMapDetached;
    private updateScriptRanges;
    private uiSourceCodeURL;
    canIgnoreListUISourceCode(uiSourceCode: UISourceCode): boolean;
    ignoreListUISourceCode(uiSourceCode: UISourceCode): void;
    unIgnoreListUISourceCode(uiSourceCode: UISourceCode): void;
    get enableIgnoreListing(): boolean;
    set enableIgnoreListing(value: boolean);
    get skipContentScripts(): boolean;
    get skipAnonymousScripts(): boolean;
    get automaticallyIgnoreListKnownThirdPartyScripts(): boolean;
    ignoreListContentScripts(): void;
    unIgnoreListContentScripts(): void;
    ignoreListAnonymousScripts(): void;
    unIgnoreListAnonymousScripts(): void;
    ignoreListThirdParty(): void;
    unIgnoreListThirdParty(): void;
    ignoreListURL(url: Platform.DevToolsPath.UrlString): void;
    addRegexToIgnoreList(regexValue: string, disabledForUrl?: Platform.DevToolsPath.UrlString): void;
    unIgnoreListURL(url: Platform.DevToolsPath.UrlString | null, options?: IgnoreListGeneralRules): void;
    private removeIgnoreListPattern;
    private ignoreListHasPattern;
    private patternChanged;
    private patternChangeFinishedForTests;
    private urlToRegExpString;
    getIgnoreListURLContextMenuItems(uiSourceCode: UISourceCode): Array<{
        text: string;
        callback: () => void;
        jslogContext: string;
    }>;
    private getIgnoreListGeneralContextMenuItems;
    getIgnoreListFolderContextMenuItems(url: Platform.DevToolsPath.UrlString, options?: IgnoreListGeneralRules): Array<{
        text: string;
        callback: () => void;
        jslogContext: string;
    }>;
}
export interface SourceRange {
    lineNumber: number;
    columnNumber: number;
}
export declare const enum Events {
    IGNORED_SCRIPT_RANGES_UPDATED = "IGNORED_SCRIPT_RANGES_UPDATED"
}
export interface EventTypes {
    [Events.IGNORED_SCRIPT_RANGES_UPDATED]: SDK.Script.Script;
}
