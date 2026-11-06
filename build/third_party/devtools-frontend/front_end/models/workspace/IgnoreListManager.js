// Copyright 2014 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Platform from '../../core/platform/platform.js';
import * as Root from '../../core/root/root.js';
import * as SDK from '../../core/sdk/sdk.js';
import { projectTypes } from './WorkspaceImpl.js';
const UIStrings = {
    /**
     * @description Text to stop preventing the debugger from stepping into library code.
     */
    removeFromIgnoreList: 'Remove from ignore list',
    /**
     * @description Text for scripts that should not be stepped into when debugging.
     */
    addScriptToIgnoreList: 'Add script to ignore list',
    /**
     * @description Text for directories whose scripts should not be stepped into when debugging.
     */
    addDirectoryToIgnoreList: 'Add directory to ignore list',
    /**
     * @description A context menu item in the Call Stack sidebar of the Sources panel.
     */
    addAllContentScriptsToIgnoreList: 'Add all extension scripts to ignore list',
    /**
     * @description A context menu item in the Call Stack sidebar of the Sources panel.
     */
    addAllThirdPartyScriptsToIgnoreList: 'Add all third-party scripts to ignore list',
    /**
     * @description A context menu item in the Call Stack sidebar of the Sources panel.
     */
    addAllAnonymousScriptsToIgnoreList: 'Add all anonymous scripts to ignore list',
};
const str_ = i18n.i18n.registerUIStrings('models/workspace/IgnoreListManager.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export const skipStackFramesPatternSettingDescriptor = {
    name: 'skip-stack-frames-pattern',
    type: "regex" /* Common.Settings.SettingType.REGEX */,
    defaultValue: '/node_modules/|^node:',
    storageType: "Synced" /* Common.Settings.SettingStorageType.SYNCED */,
};
export const skipContentScriptsSettingDescriptor = {
    name: 'skip-content-scripts',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: true,
    storageType: "Synced" /* Common.Settings.SettingStorageType.SYNCED */,
};
export const automaticallyIgnoreListKnownThirdPartyScriptsSettingDescriptor = {
    name: 'automatically-ignore-list-known-third-party-scripts',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: true,
    storageType: "Synced" /* Common.Settings.SettingStorageType.SYNCED */,
};
export const skipAnonymousScriptsSettingDescriptor = {
    name: 'skip-anonymous-scripts',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: false,
    storageType: "Synced" /* Common.Settings.SettingStorageType.SYNCED */,
};
export const enableIgnoreListingSettingDescriptor = {
    name: 'enable-ignore-listing',
    type: "boolean" /* Common.Settings.SettingType.BOOLEAN */,
    defaultValue: true,
    storageType: "Synced" /* Common.Settings.SettingStorageType.SYNCED */,
};
export class IgnoreListManager extends Common.ObjectWrapper.ObjectWrapper {
    #settings;
    #targetManager;
    #listeners = new Set();
    #isIgnoreListedURLCache = new Map();
    #contentScriptExecutionContexts = new Set();
    constructor(settings, targetManager) {
        super();
        this.#settings = settings;
        this.#targetManager = targetManager;
        this.#targetManager.addModelListener(SDK.DebuggerModel.DebuggerModel, SDK.DebuggerModel.Events.GlobalObjectCleared, this.clearCacheIfNeeded.bind(this), this);
        this.#targetManager.addModelListener(SDK.RuntimeModel.RuntimeModel, SDK.RuntimeModel.Events.ExecutionContextCreated, this.onExecutionContextCreated, this, { scoped: true });
        this.#targetManager.addModelListener(SDK.RuntimeModel.RuntimeModel, SDK.RuntimeModel.Events.ExecutionContextDestroyed, this.onExecutionContextDestroyed, this, { scoped: true });
        this.#settings.resolve(skipStackFramesPatternSettingDescriptor).addChangeListener(this.patternChanged.bind(this));
        this.#settings.resolve(skipContentScriptsSettingDescriptor).addChangeListener(this.patternChanged.bind(this));
        this.#settings.resolve(automaticallyIgnoreListKnownThirdPartyScriptsSettingDescriptor)
            .addChangeListener(this.patternChanged.bind(this));
        this.#settings.resolve(enableIgnoreListingSettingDescriptor).addChangeListener(this.patternChanged.bind(this));
        this.#settings.resolve(skipAnonymousScriptsSettingDescriptor).addChangeListener(this.patternChanged.bind(this));
        this.#targetManager.observeModels(SDK.DebuggerModel.DebuggerModel, this);
    }
    static instance(opts = {
        forceNew: null,
    }) {
        const { forceNew } = opts;
        if (forceNew) {
            Root.DevToolsContext.globalInstance().set(IgnoreListManager, new IgnoreListManager(
            // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
            opts.settings ?? Common.Settings.Settings.instance(), 
            // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
            opts.targetManager ?? SDK.TargetManager.TargetManager.instance()));
        }
        return Root.DevToolsContext.globalInstance().get(IgnoreListManager);
    }
    static removeInstance() {
        Root.DevToolsContext.globalInstance().delete(IgnoreListManager);
    }
    addChangeListener(listener) {
        this.#listeners.add(listener);
    }
    removeChangeListener(listener) {
        this.#listeners.delete(listener);
    }
    modelAdded(debuggerModel) {
        void this.setIgnoreListPatterns(debuggerModel);
        const sourceMapManager = debuggerModel.sourceMapManager();
        sourceMapManager.addEventListener(SDK.SourceMapManager.Events.SourceMapAttached, this.sourceMapAttached, this);
        sourceMapManager.addEventListener(SDK.SourceMapManager.Events.SourceMapDetached, this.sourceMapDetached, this);
    }
    modelRemoved(debuggerModel) {
        this.clearCacheIfNeeded();
        const sourceMapManager = debuggerModel.sourceMapManager();
        sourceMapManager.removeEventListener(SDK.SourceMapManager.Events.SourceMapAttached, this.sourceMapAttached, this);
        sourceMapManager.removeEventListener(SDK.SourceMapManager.Events.SourceMapDetached, this.sourceMapDetached, this);
    }
    isContentScript(executionContext) {
        return !executionContext.isDefault;
    }
    onExecutionContextCreated(event) {
        if (this.isContentScript(event.data)) {
            this.#contentScriptExecutionContexts.add(event.data.uniqueId);
            if (this.skipContentScripts) {
                for (const debuggerModel of this.#targetManager.models(SDK.DebuggerModel.DebuggerModel)) {
                    void this.updateIgnoredExecutionContexts(debuggerModel);
                }
            }
        }
    }
    onExecutionContextDestroyed(event) {
        if (this.isContentScript(event.data)) {
            this.#contentScriptExecutionContexts.delete(event.data.uniqueId);
            if (this.skipContentScripts) {
                for (const debuggerModel of this.#targetManager.models(SDK.DebuggerModel.DebuggerModel)) {
                    void this.updateIgnoredExecutionContexts(debuggerModel);
                }
            }
        }
    }
    clearCacheIfNeeded() {
        if (this.#isIgnoreListedURLCache.size > 1024) {
            this.#isIgnoreListedURLCache.clear();
        }
    }
    getSkipStackFramesPatternSetting() {
        return this.#settings.resolve(skipStackFramesPatternSettingDescriptor);
    }
    setIgnoreListPatterns(debuggerModel) {
        const regexPatterns = this.enableIgnoreListing ? this.getSkipStackFramesPatternSetting().getAsArray() : [];
        const patterns = [];
        for (const item of regexPatterns) {
            if (!item.disabled && item.pattern) {
                patterns.push(item.pattern);
            }
        }
        return debuggerModel.setBlackboxPatterns(patterns, this.skipAnonymousScripts);
    }
    updateIgnoredExecutionContexts(debuggerModel) {
        return debuggerModel.setBlackboxExecutionContexts(this.skipContentScripts ? Array.from(this.#contentScriptExecutionContexts) : []);
    }
    getGeneralRulesForUISourceCode(uiSourceCode) {
        const projectType = uiSourceCode.project().type();
        const isContentScript = projectType === projectTypes.ContentScripts;
        const isKnownThirdParty = uiSourceCode.isKnownThirdParty();
        return { isContentScript, isKnownThirdParty };
    }
    isUserOrSourceMapIgnoreListedUISourceCode(uiSourceCode) {
        if (uiSourceCode.isUnconditionallyIgnoreListed()) {
            return true;
        }
        const url = this.uiSourceCodeURL(uiSourceCode);
        return this.isUserIgnoreListedURL(url, this.getGeneralRulesForUISourceCode(uiSourceCode));
    }
    isUserIgnoreListedURL(url, options) {
        if (!this.enableIgnoreListing) {
            return false;
        }
        if (options?.isContentScript && this.skipContentScripts) {
            return true;
        }
        if (options?.isKnownThirdParty && this.automaticallyIgnoreListKnownThirdPartyScripts) {
            return true;
        }
        if (!url) {
            return this.skipAnonymousScripts;
        }
        if (this.#isIgnoreListedURLCache.has(url)) {
            return Boolean(this.#isIgnoreListedURLCache.get(url));
        }
        const isIgnoreListed = this.getFirstMatchedRegex(url) !== null;
        this.#isIgnoreListedURLCache.set(url, isIgnoreListed);
        return isIgnoreListed;
    }
    getFirstMatchedRegex(url) {
        if (!url) {
            return null;
        }
        const regexPatterns = this.getSkipStackFramesPatternSetting().getAsArray();
        const regexValue = this.urlToRegExpString(url);
        if (!regexValue) {
            return null;
        }
        for (let i = 0; i < regexPatterns.length; ++i) {
            const item = regexPatterns[i];
            if (item.disabled || item.disabledForUrl === url) {
                continue;
            }
            const regex = new RegExp(item.pattern);
            if (regex.test(url)) {
                return regex;
            }
        }
        return null;
    }
    sourceMapAttached(event) {
        const script = event.data.client;
        const sourceMap = event.data.sourceMap;
        void this.updateScriptRanges(script, sourceMap);
    }
    sourceMapDetached(event) {
        const script = event.data.client;
        void this.updateScriptRanges(script, undefined);
    }
    async updateScriptRanges(script, sourceMap) {
        let hasIgnoreListedMappings = false;
        let artificialRanges = [];
        if (!this.isUserIgnoreListedURL(script.sourceURL, { isContentScript: script.isContentScript() })) {
            hasIgnoreListedMappings =
                sourceMap?.sourceURLs().some(url => this.isUserIgnoreListedURL(url, { isKnownThirdParty: sourceMap.hasIgnoreListHint(url) })) ??
                    false;
            // Artificial functions (compiler helpers without authored code, from encoded source map scopes) are blackboxed
            // independently of user ignore-listing, so that stepping never stops in them. Same coordinates as the
            // `findRanges` output below. (Not needed for ignore-listed scripts: V8 checks the blackbox patterns before the
            // per-script ranges.)
            if (Root.Runtime.hostConfig.devToolsSourceMapScopesInSourcesPanel?.enabled) {
                const toSourceRange = ({ line, column }) => ({ lineNumber: line, columnNumber: column });
                const ranges = sourceMap?.artificialFunctionRanges() ?? [];
                artificialRanges = ranges.map(({ start, end }) => ({ start: toSourceRange(start), end: toSourceRange(end) }));
            }
        }
        if (!hasIgnoreListedMappings && artificialRanges.length === 0) {
            if (scriptToRange.get(script) && await script.setBlackboxedRanges([])) {
                scriptToRange.delete(script);
            }
            this.dispatchEventToListeners("IGNORED_SCRIPT_RANGES_UPDATED" /* Events.IGNORED_SCRIPT_RANGES_UPDATED */, script);
            return;
        }
        if (!sourceMap) {
            return;
        }
        const userRanges = hasIgnoreListedMappings ?
            sourceMap.findRanges(srcURL => this.isUserIgnoreListedURL(srcURL, { isKnownThirdParty: sourceMap.hasIgnoreListHint(srcURL) }), { isStartMatching: true }) :
            [];
        const newRanges = mergeSourceRanges([...userRanges, ...artificialRanges]).flatMap(range => [range.start, range.end]);
        const oldRanges = scriptToRange.get(script) || [];
        if (!isEqual(oldRanges, newRanges) && await script.setBlackboxedRanges(newRanges)) {
            scriptToRange.set(script, newRanges);
        }
        this.dispatchEventToListeners("IGNORED_SCRIPT_RANGES_UPDATED" /* Events.IGNORED_SCRIPT_RANGES_UPDATED */, script);
        function isEqual(rangesA, rangesB) {
            if (rangesA.length !== rangesB.length) {
                return false;
            }
            for (let i = 0; i < rangesA.length; ++i) {
                if (rangesA[i].lineNumber !== rangesB[i].lineNumber || rangesA[i].columnNumber !== rangesB[i].columnNumber) {
                    return false;
                }
            }
            return true;
        }
    }
    uiSourceCodeURL(uiSourceCode) {
        return uiSourceCode.project().type() === projectTypes.Debugger ? null : uiSourceCode.url();
    }
    canIgnoreListUISourceCode(uiSourceCode) {
        const url = this.uiSourceCodeURL(uiSourceCode);
        return url ? Boolean(this.urlToRegExpString(url)) : false;
    }
    ignoreListUISourceCode(uiSourceCode) {
        const url = this.uiSourceCodeURL(uiSourceCode);
        if (url) {
            this.ignoreListURL(url);
        }
    }
    unIgnoreListUISourceCode(uiSourceCode) {
        this.unIgnoreListURL(this.uiSourceCodeURL(uiSourceCode), this.getGeneralRulesForUISourceCode(uiSourceCode));
    }
    get enableIgnoreListing() {
        return this.#settings.resolve(enableIgnoreListingSettingDescriptor).get();
    }
    set enableIgnoreListing(value) {
        this.#settings.resolve(enableIgnoreListingSettingDescriptor).set(value);
    }
    get skipContentScripts() {
        return this.enableIgnoreListing && this.#settings.resolve(skipContentScriptsSettingDescriptor).get();
    }
    get skipAnonymousScripts() {
        return this.enableIgnoreListing && this.#settings.resolve(skipAnonymousScriptsSettingDescriptor).get();
    }
    get automaticallyIgnoreListKnownThirdPartyScripts() {
        return this.enableIgnoreListing &&
            this.#settings.resolve(automaticallyIgnoreListKnownThirdPartyScriptsSettingDescriptor).get();
    }
    ignoreListContentScripts() {
        if (!this.enableIgnoreListing) {
            this.enableIgnoreListing = true;
        }
        this.#settings.resolve(skipContentScriptsSettingDescriptor).set(true);
    }
    unIgnoreListContentScripts() {
        this.#settings.resolve(skipContentScriptsSettingDescriptor).set(false);
    }
    ignoreListAnonymousScripts() {
        if (!this.enableIgnoreListing) {
            this.enableIgnoreListing = true;
        }
        this.#settings.resolve(skipAnonymousScriptsSettingDescriptor).set(true);
    }
    unIgnoreListAnonymousScripts() {
        this.#settings.resolve(skipAnonymousScriptsSettingDescriptor).set(false);
    }
    ignoreListThirdParty() {
        if (!this.enableIgnoreListing) {
            this.enableIgnoreListing = true;
        }
        this.#settings.resolve(automaticallyIgnoreListKnownThirdPartyScriptsSettingDescriptor).set(true);
    }
    unIgnoreListThirdParty() {
        this.#settings.resolve(automaticallyIgnoreListKnownThirdPartyScriptsSettingDescriptor).set(false);
    }
    ignoreListURL(url) {
        const regexValue = this.urlToRegExpString(url);
        if (!regexValue) {
            return;
        }
        this.addRegexToIgnoreList(regexValue, url);
    }
    addRegexToIgnoreList(regexValue, disabledForUrl) {
        const regexPatterns = this.getSkipStackFramesPatternSetting().getAsArray();
        let found = false;
        for (let i = 0; i < regexPatterns.length; ++i) {
            const item = regexPatterns[i];
            if (item.pattern === regexValue || (disabledForUrl && item.disabledForUrl === disabledForUrl)) {
                item.disabled = false;
                item.disabledForUrl = undefined;
                found = true;
            }
        }
        if (!found) {
            regexPatterns.push({ pattern: regexValue, disabled: false });
        }
        if (!this.enableIgnoreListing) {
            this.enableIgnoreListing = true;
        }
        this.getSkipStackFramesPatternSetting().setAsArray(regexPatterns);
    }
    unIgnoreListURL(url, options) {
        if (options?.isContentScript) {
            this.unIgnoreListContentScripts();
        }
        if (options?.isKnownThirdParty) {
            this.unIgnoreListThirdParty();
        }
        if (!url) {
            this.unIgnoreListAnonymousScripts();
            return;
        }
        let regexPatterns = this.getSkipStackFramesPatternSetting().getAsArray();
        const regexValue = this.urlToRegExpString(url);
        if (!regexValue) {
            return;
        }
        regexPatterns = regexPatterns.filter(function (item) {
            return item.pattern !== regexValue;
        });
        for (let i = 0; i < regexPatterns.length; ++i) {
            const item = regexPatterns[i];
            if (item.disabled) {
                continue;
            }
            try {
                const regex = new RegExp(item.pattern);
                if (regex.test(url)) {
                    item.disabled = true;
                    item.disabledForUrl = url;
                }
            }
            catch {
            }
        }
        this.getSkipStackFramesPatternSetting().setAsArray(regexPatterns);
    }
    removeIgnoreListPattern(regexValue) {
        let regexPatterns = this.getSkipStackFramesPatternSetting().getAsArray();
        regexPatterns = regexPatterns.filter(function (item) {
            return item.pattern !== regexValue;
        });
        this.getSkipStackFramesPatternSetting().setAsArray(regexPatterns);
    }
    ignoreListHasPattern(regexValue, enabledOnly) {
        const regexPatterns = this.getSkipStackFramesPatternSetting().getAsArray();
        return regexPatterns.some(item => !(enabledOnly && item.disabled) && item.pattern === regexValue);
    }
    async patternChanged() {
        this.#isIgnoreListedURLCache.clear();
        const promises = [];
        for (const debuggerModel of this.#targetManager.models(SDK.DebuggerModel.DebuggerModel)) {
            promises.push(this.setIgnoreListPatterns(debuggerModel));
            const sourceMapManager = debuggerModel.sourceMapManager();
            for (const script of debuggerModel.scripts()) {
                promises.push(this.updateScriptRanges(script, sourceMapManager.sourceMapForClient(script)));
            }
            promises.push(this.updateIgnoredExecutionContexts(debuggerModel));
        }
        await Promise.all(promises);
        const listeners = Array.from(this.#listeners);
        for (const listener of listeners) {
            listener();
        }
        this.patternChangeFinishedForTests();
    }
    patternChangeFinishedForTests() {
        // This method is sniffed in tests.
    }
    urlToRegExpString(url) {
        const parsedURL = new Common.ParsedURL.ParsedURL(url);
        if (parsedURL.isAboutBlank() || parsedURL.isDataURL()) {
            return '';
        }
        if (!parsedURL.isValid) {
            return '^' + Platform.StringUtilities.escapeForRegExp(url) + '$';
        }
        let name = parsedURL.lastPathComponent;
        if (name) {
            name = '/' + name;
        }
        else if (parsedURL.folderPathComponents) {
            name = parsedURL.folderPathComponents + '/';
        }
        if (!name) {
            name = parsedURL.host;
        }
        if (!name) {
            return '';
        }
        const scheme = parsedURL.scheme;
        let prefix = '';
        if (scheme && scheme !== 'http' && scheme !== 'https') {
            prefix = '^' + scheme + '://';
            if (scheme === 'chrome-extension') {
                prefix += parsedURL.host + '\\b';
            }
            prefix += '.*';
        }
        return prefix + Platform.StringUtilities.escapeForRegExp(name) + (url.endsWith(name) ? '$' : '\\b');
    }
    getIgnoreListURLContextMenuItems(uiSourceCode) {
        if (uiSourceCode.project().type() === projectTypes.FileSystem) {
            return [];
        }
        const menuItems = [];
        const canIgnoreList = this.canIgnoreListUISourceCode(uiSourceCode);
        const isIgnoreListed = this.isUserOrSourceMapIgnoreListedUISourceCode(uiSourceCode);
        const isAnonymous = !this.uiSourceCodeURL(uiSourceCode);
        const { isContentScript, isKnownThirdParty } = this.getGeneralRulesForUISourceCode(uiSourceCode);
        if (isIgnoreListed) {
            if (canIgnoreList || isContentScript || isKnownThirdParty || isAnonymous) {
                menuItems.push({
                    text: i18nString(UIStrings.removeFromIgnoreList),
                    callback: this.unIgnoreListUISourceCode.bind(this, uiSourceCode),
                    jslogContext: 'remove-script-from-ignorelist',
                });
            }
        }
        else {
            if (canIgnoreList) {
                menuItems.push({
                    text: i18nString(UIStrings.addScriptToIgnoreList),
                    callback: this.ignoreListUISourceCode.bind(this, uiSourceCode),
                    jslogContext: 'add-script-to-ignorelist',
                });
            }
            else if (isAnonymous) {
                menuItems.push({
                    text: i18nString(UIStrings.addAllAnonymousScriptsToIgnoreList),
                    callback: this.ignoreListAnonymousScripts.bind(this),
                    jslogContext: 'add-anonymous-scripts-to-ignorelist',
                });
            }
            menuItems.push(...this.getIgnoreListGeneralContextMenuItems({ isContentScript, isKnownThirdParty }));
        }
        return menuItems;
    }
    getIgnoreListGeneralContextMenuItems(options) {
        const menuItems = [];
        if (options?.isContentScript) {
            menuItems.push({
                text: i18nString(UIStrings.addAllContentScriptsToIgnoreList),
                callback: this.ignoreListContentScripts.bind(this),
                jslogContext: 'add-content-scripts-to-ignorelist',
            });
        }
        if (options?.isKnownThirdParty) {
            menuItems.push({
                text: i18nString(UIStrings.addAllThirdPartyScriptsToIgnoreList),
                callback: this.ignoreListThirdParty.bind(this),
                jslogContext: 'add-3p-scripts-to-ignorelist',
            });
        }
        return menuItems;
    }
    getIgnoreListFolderContextMenuItems(url, options) {
        const menuItems = [];
        const regexValue = '^' + Platform.StringUtilities.escapeForRegExp(url) + '/';
        if (this.ignoreListHasPattern(regexValue, true)) {
            menuItems.push({
                text: i18nString(UIStrings.removeFromIgnoreList),
                callback: this.removeIgnoreListPattern.bind(this, regexValue),
                jslogContext: 'remove-from-ignore-list',
            });
        }
        else if (this.isUserIgnoreListedURL(url, options)) {
            // This specific url isn't on the ignore list, but there are rules that match it.
            menuItems.push({
                text: i18nString(UIStrings.removeFromIgnoreList),
                callback: this.unIgnoreListURL.bind(this, url, options),
                jslogContext: 'remove-from-ignore-list',
            });
        }
        else if (!options?.isCurrentlyIgnoreListed) {
            // Provide options to add to ignore list, unless folder currently displays
            // as entirely ignored.
            menuItems.push({
                text: i18nString(UIStrings.addDirectoryToIgnoreList),
                callback: this.addRegexToIgnoreList.bind(this, regexValue),
                jslogContext: 'add-directory-to-ignore-list',
            });
            menuItems.push(...this.getIgnoreListGeneralContextMenuItems(options));
        }
        return menuItems;
    }
}
const scriptToRange = new WeakMap();
/** Sorts `ranges` by start and merges overlapping or touching ranges. Doesn't modify the input. */
function mergeSourceRanges(ranges) {
    const compare = (a, b) => (a.lineNumber - b.lineNumber) || (a.columnNumber - b.columnNumber);
    const sorted = ranges.map(({ start, end }) => ({ start, end })).sort((a, b) => compare(a.start, b.start));
    const result = [];
    for (const range of sorted) {
        const last = result.at(-1);
        if (last && compare(range.start, last.end) <= 0) {
            if (compare(range.end, last.end) > 0) {
                last.end = range.end;
            }
        }
        else {
            result.push(range);
        }
    }
    return result;
}
export var Events;
(function (Events) {
    Events["IGNORED_SCRIPT_RANGES_UPDATED"] = "IGNORED_SCRIPT_RANGES_UPDATED";
})(Events || (Events = {}));
//# sourceMappingURL=IgnoreListManager.js.map