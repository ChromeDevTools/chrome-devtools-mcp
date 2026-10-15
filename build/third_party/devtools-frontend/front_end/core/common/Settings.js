// Copyright 2009 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../platform/platform.js';
import * as Root from '../root/root.js';
import { ObjectWrapper } from './Object.js';
import { getLocalizedSettingsCategory, maybeRemoveSettingExtension, registerSettingExtension, registerSettingsForTest, resetSettings, } from './SettingRegistration.js';
import { VersionController } from './VersionController.js';
export class Settings {
    syncedStorage;
    globalStorage;
    localStorage;
    #settingRegistrations;
    #sessionStorage = new SettingsStorage({});
    settingNameSet = new Set();
    #eventSupport = new ObjectWrapper();
    #registry = new Map();
    moduleSettings = new Map();
    #logSettingAccess;
    #console;
    constructor({ syncedStorage, globalStorage, localStorage, settingRegistrations, logSettingAccess, runSettingsMigration, console, }) {
        this.#console = console;
        this.syncedStorage = syncedStorage;
        this.globalStorage = globalStorage;
        this.localStorage = localStorage;
        this.#settingRegistrations = settingRegistrations;
        this.#logSettingAccess = logSettingAccess;
        for (const registration of this.#settingRegistrations) {
            const { settingName, defaultValue, storageType } = registration;
            const isRegex = registration.settingType === "regex" /* SettingType.REGEX */;
            const evaluatedDefaultValue = typeof defaultValue === 'function' ? defaultValue(Root.Runtime.hostConfig) : defaultValue;
            const setting = isRegex && typeof evaluatedDefaultValue === 'string' ?
                this.createRegExpSetting(settingName, evaluatedDefaultValue, undefined, storageType) :
                this.createSetting(settingName, evaluatedDefaultValue, storageType);
            setting.setRegistration(registration);
            this.registerModuleSetting(setting);
        }
        if (runSettingsMigration) {
            new VersionController(this).updateVersion();
        }
    }
    getRegisteredSettings() {
        return this.#settingRegistrations;
    }
    static hasInstance() {
        return Root.DevToolsContext.globalInstance().has(Settings);
    }
    static instance(opts = {
        forceNew: null,
        syncedStorage: null,
        globalStorage: null,
        localStorage: null,
        settingRegistrations: null,
        console: null,
    }) {
        const { forceNew, syncedStorage, globalStorage, localStorage, settingRegistrations, logSettingAccess, runSettingsMigration, console, } = opts;
        if (!Root.DevToolsContext.globalInstance().has(Settings) || forceNew) {
            if (!syncedStorage || !globalStorage || !localStorage || !settingRegistrations || !console) {
                throw new Error(`Unable to create settings: global and local storage must be provided: ${new Error().stack}`);
            }
            Root.DevToolsContext.globalInstance().set(Settings, new Settings({
                syncedStorage,
                globalStorage,
                localStorage,
                settingRegistrations,
                logSettingAccess,
                runSettingsMigration,
                console,
            }));
        }
        return Root.DevToolsContext.globalInstance().get(Settings);
    }
    static removeInstance() {
        Root.DevToolsContext.globalInstance().delete(Settings);
    }
    registerModuleSetting(setting) {
        const settingName = setting.name;
        if (this.settingNameSet.has(settingName)) {
            throw new Error(`Duplicate Setting name '${settingName}'`);
        }
        this.settingNameSet.add(settingName);
        this.moduleSettings.set(setting.name, setting);
    }
    static normalizeSettingName(name) {
        if ([
            VersionController.GLOBAL_VERSION_SETTING_NAME,
            VersionController.SYNCED_VERSION_SETTING_NAME,
            VersionController.LOCAL_VERSION_SETTING_NAME,
            'currentDockState',
            'isUnderTest',
        ].includes(name)) {
            return name;
        }
        return Platform.StringUtilities.toKebabCase(name);
    }
    /**
     * Prefer a module setting if this setting is one that you might not want to
     * surface to the user to control themselves. Examples of these are settings
     * to store UI state such as how a user choses to position a split widget or
     * which panel they last opened.
     * If you are creating a setting that you expect the user to control, and
     * sync, prefer {@link Settings.createSetting}
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    moduleSetting(settingName) {
        const setting = this.moduleSettings.get(settingName);
        if (!setting) {
            throw new Error('No setting registered: ' + settingName);
        }
        return setting;
    }
    settingForTest(settingName) {
        const setting = this.#registry.get(settingName);
        if (!setting) {
            throw new Error('No setting registered: ' + settingName);
        }
        return setting;
    }
    /** The event target shared by all settings. Change listeners are registered with the setting name as event type. */
    get eventTargetForTest() {
        return this.#eventSupport;
    }
    /**
     * Get setting via key, and create a new setting if the requested setting does not exist.
     * @param key kebab-case string ID
     * @param defaultValue
     * @param storageType If not specified, SettingStorageType.GLOBAL is used.
     */
    createSetting(key, defaultValue, storageType) {
        const storage = this.storageFromType(storageType);
        let setting = this.#registry.get(key);
        if (!setting) {
            setting = new Setting(key, defaultValue, this.#eventSupport, storage, this.#console, this.#logSettingAccess);
            this.#registry.set(key, setting);
        }
        return setting;
    }
    createLocalSetting(key, defaultValue) {
        return this.createSetting(key, defaultValue, "Local" /* SettingStorageType.LOCAL */);
    }
    createRegExpSetting(key, defaultValue, regexFlags, storageType) {
        if (!this.#registry.get(key)) {
            this.#registry.set(key, new RegExpSetting(key, defaultValue, this.#eventSupport, this.storageFromType(storageType), this.#console, regexFlags, this.#logSettingAccess));
        }
        return this.#registry.get(key);
    }
    clearAll() {
        this.globalStorage.removeAll();
        this.syncedStorage.removeAll();
        this.localStorage.removeAll();
        new VersionController(this).resetToCurrent();
    }
    storageFromType(storageType) {
        switch (storageType) {
            case "Local" /* SettingStorageType.LOCAL */:
                return this.localStorage;
            case "Session" /* SettingStorageType.SESSION */:
                return this.#sessionStorage;
            case "Global" /* SettingStorageType.GLOBAL */:
                return this.globalStorage;
            case "Synced" /* SettingStorageType.SYNCED */:
                return this.syncedStorage;
        }
        return this.globalStorage;
    }
    getRegistry() {
        return this.#registry;
    }
    /**
     * Resolves a setting descriptor to a concrete {@link Setting} instance.
     *
     * If a setting with the same name already exists (either pre-registered or
     * previously resolved), that instance is returned. Otherwise, a new setting
     * is created and registered.
     *
     * @param descriptor The descriptor defining the setting. Must not be conditional.
     * @throws If the descriptor is conditional (contains `isAvailable`). Use `maybeResolve` instead.
     */
    resolve(descriptor) {
        if ('isAvailable' in descriptor) {
            // TS can only do so much if developers downcast explicitly.
            throw new Error('Use Settings#maybeResolve for conditional descriptors.');
        }
        return this.#resolve(descriptor);
    }
    #resolve(descriptor) {
        let setting = this.moduleSettings.get(descriptor.name);
        if (setting) {
            return setting;
        }
        const { name, type, defaultValue, storageType } = descriptor;
        const isRegex = type === "regex" /* SettingType.REGEX */;
        const isGetter = (value) => typeof value === 'function';
        const evaluatedDefaultValue = isGetter(defaultValue) ? defaultValue(Root.Runtime.hostConfig) : defaultValue;
        setting = isRegex && typeof evaluatedDefaultValue === 'string' ?
            this.createRegExpSetting(name, evaluatedDefaultValue, undefined, storageType) :
            this.createSetting(name, evaluatedDefaultValue, storageType);
        setting.setSettingType(type);
        this.registerModuleSetting(setting);
        return setting;
    }
    /**
     * Resolves a conditional setting descriptor to a concrete {@link Setting} instance if it is available.
     *
     * This method checks the availability of the setting using the descriptor's `isAvailable` function
     * and the current `hostConfig`. If available, it resolves and returns the setting (caching it if
     * necessary). If not available (either unavailable or disabled), it returns the availability status
     * and the reason.
     *
     * @param descriptor The conditional descriptor defining the setting.
     * @returns An object with either the resolved `setting` or the availability `status` and `reason`.
     */
    maybeResolve(descriptor) {
        const available = descriptor.isAvailable(Root.Runtime.hostConfig);
        if (available.status === 1 /* SettingAvailability.AVAILABLE */) {
            return { setting: this.#resolve(descriptor) };
        }
        return available;
    }
}
export class InMemoryStorage {
    #store = new Map();
    register(_setting) {
    }
    set(key, value) {
        this.#store.set(key, value);
    }
    get(key) {
        return this.#store.get(key);
    }
    remove(key) {
        this.#store.delete(key);
    }
    clear() {
        this.#store.clear();
    }
}
export class SettingsStorage {
    object;
    backingStore;
    storagePrefix;
    constructor(object, backingStore = new InMemoryStorage(), storagePrefix = '') {
        this.object = object;
        this.backingStore = backingStore;
        this.storagePrefix = storagePrefix;
    }
    register(name) {
        name = this.storagePrefix + name;
        this.backingStore.register(name);
    }
    set(name, value) {
        name = this.storagePrefix + name;
        this.object[name] = value;
        this.backingStore.set(name, value);
    }
    has(name) {
        name = this.storagePrefix + name;
        return name in this.object;
    }
    get(name) {
        name = this.storagePrefix + name;
        return this.object[name];
    }
    async forceGet(originalName) {
        const name = this.storagePrefix + originalName;
        const value = await this.backingStore.get(name);
        if (value && value !== this.object[name]) {
            this.set(originalName, value);
        }
        else if (!value) {
            this.remove(originalName);
        }
        return value;
    }
    remove(name) {
        name = this.storagePrefix + name;
        delete this.object[name];
        this.backingStore.remove(name);
    }
    removeAll() {
        this.object = {};
        this.backingStore.clear();
    }
    keys() {
        return Object.keys(this.object);
    }
    dumpSizes(commonConsole) {
        commonConsole.log('Ten largest settings: ');
        // @ts-expect-error __proto__ optimization
        const sizes = { __proto__: null };
        for (const key in this.object) {
            sizes[key] = this.object[key].length;
        }
        const keys = Object.keys(sizes);
        function comparator(key1, key2) {
            return sizes[key2] - sizes[key1];
        }
        keys.sort(comparator);
        for (let i = 0; i < 10 && i < keys.length; ++i) {
            commonConsole.log('Setting: \'' + keys[i] + '\', size: ' + sizes[keys[i]]);
        }
    }
}
export class Setting {
    name;
    defaultValue;
    eventSupport;
    storage;
    #registration = null;
    #type = null;
    #requiresUserAction;
    #value;
    #hadUserAction;
    #loggedInitialAccess = false;
    #logSettingAccess;
    #console;
    constructor(name, defaultValue, eventSupport, storage, console, logSettingAccess) {
        this.name = name;
        this.defaultValue = defaultValue;
        this.eventSupport = eventSupport;
        this.storage = storage;
        storage.register(this.name);
        this.#console = console;
        this.#logSettingAccess = logSettingAccess;
    }
    descriptor() {
        return {
            name: this.name,
            type: this.type() ?? "boolean" /* SettingType.BOOLEAN */,
            defaultValue: this.defaultValue,
            storageType: this.#registration?.storageType,
        };
    }
    addChangeListener(listener, thisObject) {
        return this.eventSupport.addEventListener(this.name, listener, thisObject);
    }
    removeChangeListener(listener, thisObject) {
        this.eventSupport.removeEventListener(this.name, listener, thisObject);
    }
    setRequiresUserAction(requiresUserAction) {
        this.#requiresUserAction = requiresUserAction;
    }
    #maybeLogAccess(value) {
        try {
            const valueToLog = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ?
                value :
                JSON.stringify(value);
            if (valueToLog !== undefined && this.#logSettingAccess) {
                void this.#logSettingAccess(this.name, valueToLog);
            }
        }
        catch {
        }
    }
    #maybeLogInitialAccess(value) {
        if (!this.#loggedInitialAccess) {
            this.#maybeLogAccess(value);
            this.#loggedInitialAccess = true;
        }
    }
    get() {
        if (this.#requiresUserAction && !this.#hadUserAction) {
            this.#maybeLogInitialAccess(this.defaultValue);
            return this.defaultValue;
        }
        if (typeof this.#value !== 'undefined') {
            this.#maybeLogInitialAccess(this.#value);
            return this.#value;
        }
        this.#value = this.defaultValue;
        if (this.storage.has(this.name)) {
            try {
                this.#value = JSON.parse(this.storage.get(this.name));
            }
            catch {
                this.storage.remove(this.name);
            }
        }
        this.#maybeLogInitialAccess(this.#value);
        return this.#value;
    }
    async forceGet() {
        const name = this.name;
        const oldValue = this.storage.get(name);
        const value = await this.storage.forceGet(name);
        this.#value = this.defaultValue;
        if (value) {
            try {
                this.#value = JSON.parse(value);
            }
            catch {
                this.storage.remove(this.name);
            }
        }
        if (oldValue !== value) {
            this.eventSupport.dispatchEventToListeners(this.name, this.#value);
        }
        this.#maybeLogInitialAccess(this.#value);
        return this.#value;
    }
    set(value) {
        this.#maybeLogAccess(value);
        this.#hadUserAction = true;
        this.#value = value;
        try {
            const settingString = JSON.stringify(value);
            try {
                this.storage.set(this.name, settingString);
            }
            catch (e) {
                this.printSettingsSavingError(e.message, settingString);
            }
        }
        catch (e) {
            this.#console.error('Cannot stringify setting with name: ' + this.name + ', error: ' + e.message);
        }
        this.eventSupport.dispatchEventToListeners(this.name, value);
    }
    setSettingType(type) {
        this.#type = type;
    }
    setRegistration(registration) {
        this.#registration = registration;
        if (registration.settingType) {
            this.#type = registration.settingType;
        }
    }
    type() {
        return this.#type ?? this.#registration?.settingType ?? null;
    }
    printSettingsSavingError(message, value) {
        const errorMessage = 'Error saving setting with name: ' + this.name + ', value length: ' + value.length + '. Error: ' + message;
        console.error(errorMessage);
        this.#console.error(errorMessage);
        this.storage.dumpSizes(this.#console);
    }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class RegExpSetting extends Setting {
    #regexFlags;
    #regex;
    constructor(name, defaultValue, eventSupport, storage, console, regexFlags, logSettingAccess) {
        super(name, defaultValue ? [{ pattern: defaultValue }] : [], eventSupport, storage, console, logSettingAccess);
        this.#regexFlags = regexFlags;
    }
    get() {
        const result = [];
        const items = this.getAsArray();
        for (let i = 0; i < items.length; ++i) {
            const item = items[i];
            if (item.pattern && !item.disabled) {
                result.push(item.pattern);
            }
        }
        return result.join('|');
    }
    getAsArray() {
        return super.get();
    }
    set(value) {
        this.setAsArray([{ pattern: value, disabled: false }]);
    }
    setAsArray(value) {
        this.#regex = undefined;
        super.set(value);
    }
    asRegExp() {
        if (typeof this.#regex !== 'undefined') {
            return this.#regex;
        }
        this.#regex = null;
        try {
            const pattern = this.get();
            if (pattern) {
                this.#regex = new RegExp(pattern, this.#regexFlags || '');
            }
        }
        catch {
        }
        return this.#regex;
    }
}
export { getLocalizedSettingsCategory, maybeRemoveSettingExtension, registerSettingExtension, registerSettingsForTest, resetSettings, };
//# sourceMappingURL=Settings.js.map