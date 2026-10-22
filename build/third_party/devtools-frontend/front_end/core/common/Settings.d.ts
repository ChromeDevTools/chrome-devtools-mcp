import * as Root from '../root/root.js';
import type { Console } from './Console.js';
import type { EventDescriptor, EventTargetEvent, GenericEvents } from './EventTarget.js';
import { ObjectWrapper } from './Object.js';
import { getLocalizedSettingsCategory, maybeRemoveSettingExtension, type RegExpSettingItem, registerSettingExtension, registerSettingsForTest, resetSettings, SettingCategory, type SettingExtensionOption, type SettingRegistration, SettingType } from './SettingRegistration.js';
/**
 * Describes and configures a Setting.
 *
 * Use `Settings#resolve` to get the concrete `Setting` instance for a descriptor.
 */
export interface SettingDescriptor<ValueT> {
    /** The unique identifier of a setting */
    readonly name: string;
    /**
     * Determines how the possible values of the setting are expressed.
     *
     * - If the setting can only be enabled and disabled use BOOLEAN
     * - If the setting has a list of possible values use ENUM
     * - If each setting value is a set of objects use ARRAY
     * - If the setting value is a regular expression use REGEX
     */
    readonly type: SettingType;
    /**
     * The default value for this setting.
     *
     * Can be computed based on the `hostConfig` (but NOTHING ELSE).
     */
    readonly defaultValue: ValueT | ((hostConfig: Root.Runtime.HostConfig) => ValueT);
    /**
     * Determines if the setting value is stored in the global, local or session storage.
     */
    readonly storageType?: SettingStorageType;
}
/**
 * Describes and configures a Setting that might be unavailable or disabled depending on the HostConfig.
 *
 * See {@link SettingAvailability} for details.
 *
 * Use `Settings#maybeResolve` to get the concrete `Setting` instance (or a reason why it's not available).
 */
export interface ConditionalSettingDescriptor<ValueT, ReasonT> extends SettingDescriptor<ValueT> {
    /** The function used as `isAvailable` must only read the host config, NOTHING ELSE. */
    isAvailable: (hostConfig: Root.Runtime.HostConfig) => SettingAvailabilityStatus<ReasonT>;
}
export type SettingAvailabilityStatus<ReasonT> = {
    status: SettingAvailability.AVAILABLE;
} | {
    status: SettingAvailability.UNAVAILABLE | SettingAvailability.DISABLED;
    reason: ReasonT;
};
export declare const enum SettingAvailability {
    /**
     * Setting is available and can be changed by the user or programmatically.
     */
    AVAILABLE = 1,
    /**
     * Setting is not available at all. Any `maybeResolve` or `resolve` call will fail.
     * The setting should be hidden from the user.
     */
    UNAVAILABLE = 2,
    /**
     * Setting is available, but its value can't be read or written.
     */
    DISABLED = 3
}
export interface SettingsCreationOptions {
    syncedStorage: SettingsStorage;
    globalStorage: SettingsStorage;
    localStorage: SettingsStorage;
    settingRegistrations: SettingRegistration[];
    logSettingAccess?: (name: string, value: number | string | boolean) => Promise<void>;
    runSettingsMigration?: boolean;
    console: Console;
}
type NoFunction<T> = T extends (...args: never[]) => unknown ? never : T;
export declare class Settings {
    #private;
    readonly syncedStorage: SettingsStorage;
    readonly globalStorage: SettingsStorage;
    readonly localStorage: SettingsStorage;
    settingNameSet: Set<string>;
    readonly moduleSettings: Map<string, Setting<unknown>>;
    constructor({ syncedStorage, globalStorage, localStorage, settingRegistrations, logSettingAccess, runSettingsMigration, console, }: SettingsCreationOptions);
    getRegisteredSettings(): SettingRegistration[];
    static hasInstance(): boolean;
    static instance(opts?: {
        forceNew: boolean | null;
        syncedStorage: SettingsStorage | null;
        globalStorage: SettingsStorage | null;
        localStorage: SettingsStorage | null;
        settingRegistrations: SettingRegistration[] | null;
        console: Console | null;
        logSettingAccess?: (name: string, value: number | string | boolean) => Promise<void>;
        runSettingsMigration?: boolean;
    }): Settings;
    static removeInstance(): void;
    private registerModuleSetting;
    static normalizeSettingName(name: string): string;
    /**
     * Prefer a module setting if this setting is one that you might not want to
     * surface to the user to control themselves. Examples of these are settings
     * to store UI state such as how a user choses to position a split widget or
     * which panel they last opened.
     * If you are creating a setting that you expect the user to control, and
     * sync, prefer {@link Settings.createSetting}
     */
    moduleSetting<T = any>(settingName: string): Setting<T>;
    settingForTest(settingName: string): Setting<unknown>;
    /** The event target shared by all settings. Change listeners are registered with the setting name as event type. */
    get eventTargetForTest(): ObjectWrapper<GenericEvents>;
    /**
     * Get setting via key, and create a new setting if the requested setting does not exist.
     * @param key kebab-case string ID
     * @param defaultValue
     * @param storageType If not specified, SettingStorageType.GLOBAL is used.
     */
    createSetting<T>(key: string, defaultValue: T, storageType?: SettingStorageType): Setting<T>;
    createLocalSetting<T>(key: string, defaultValue: T): Setting<T>;
    createRegExpSetting(key: string, defaultValue: string, regexFlags?: string, storageType?: SettingStorageType): RegExpSetting;
    clearAll(): void;
    private storageFromType;
    getRegistry(): Map<string, Setting<unknown>>;
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
    resolve<T>(descriptor: SettingDescriptor<NoFunction<T>> & {
        isAvailable?: never;
    }): Setting<T>;
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
    maybeResolve<T, R>(descriptor: ConditionalSettingDescriptor<NoFunction<T>, R>): {
        setting: Setting<T>;
    } | {
        status: SettingAvailability.UNAVAILABLE | SettingAvailability.DISABLED;
        reason: R;
    };
}
export interface SettingsBackingStore {
    register(setting: string): void;
    get(setting: string): Promise<string>;
    set(setting: string, value: string): void;
    remove(setting: string): void;
    clear(): void;
}
export declare class InMemoryStorage implements SettingsBackingStore {
    #private;
    register(_setting: string): void;
    set(key: string, value: string): void;
    get(key: string): Promise<string>;
    remove(key: string): void;
    clear(): void;
}
export declare class SettingsStorage {
    private object;
    private readonly backingStore;
    private readonly storagePrefix;
    constructor(object: Record<string, string>, backingStore?: SettingsBackingStore, storagePrefix?: string);
    register(name: string): void;
    set(name: string, value: string): void;
    has(name: string): boolean;
    get(name: string): string;
    forceGet(originalName: string): Promise<string>;
    remove(name: string): void;
    removeAll(): void;
    keys(): string[];
    dumpSizes(commonConsole: Console): void;
}
export declare class Setting<V> {
    #private;
    readonly name: string;
    readonly defaultValue: V;
    private readonly eventSupport;
    readonly storage: SettingsStorage;
    constructor(name: string, defaultValue: V, eventSupport: ObjectWrapper<GenericEvents>, storage: SettingsStorage, console: Console, logSettingAccess?: (name: string, value: number | string | boolean) => Promise<void>);
    descriptor(): SettingDescriptor<V>;
    addChangeListener(listener: (arg0: EventTargetEvent<V>) => void, thisObject?: Object): EventDescriptor;
    removeChangeListener(listener: (arg0: EventTargetEvent<V>) => void, thisObject?: Object): void;
    setRequiresUserAction(requiresUserAction: boolean): void;
    get(): V;
    forceGet(): Promise<V>;
    set(value: V): void;
    setSettingType(type: SettingType): void;
    setRegistration(registration: SettingRegistration): void;
    type(): SettingType | null;
    private printSettingsSavingError;
}
export declare class RegExpSetting extends Setting<any> {
    #private;
    constructor(name: string, defaultValue: string, eventSupport: ObjectWrapper<GenericEvents>, storage: SettingsStorage, console: Console, regexFlags?: string, logSettingAccess?: (name: string, value: number | string | boolean) => Promise<void>);
    get(): string;
    getAsArray(): RegExpSettingItem[];
    set(value: string): void;
    setAsArray(value: RegExpSettingItem[]): void;
    asRegExp(): RegExp | null;
}
export declare const enum SettingStorageType {
    /** Persists with the active Chrome profile but also syncs the settings across devices via Chrome Sync. */
    SYNCED = "Synced",
    /**
     * Persists with the active Chrome profile, but not synchronized to other devices.
     * The default SettingStorageType of createSetting().
     */
    GLOBAL = "Global",
    /** Uses Window.localStorage. Not recommended, legacy. */
    LOCAL = "Local",
    /**
     * Session storage dies when DevTools window closes. Useful for atypical conditions that should be reverted when the
     * user is done with their task. (eg Emulation modes, Debug overlays). These are also not carried into/out of incognito
     */
    SESSION = "Session"
}
export { getLocalizedSettingsCategory, maybeRemoveSettingExtension, RegExpSettingItem, registerSettingExtension, registerSettingsForTest, resetSettings, SettingCategory, SettingExtensionOption, SettingRegistration, SettingType, };
