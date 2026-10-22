export interface DevToolsLocaleData {
    settingLanguage: string;
    navigatorLanguage: string;
    lookupClosestDevToolsLocale: (locale: string) => string;
}
export type DevToolsLocaleCreationOptions = {
    create: true;
    data: DevToolsLocaleData;
} | {
    create: false;
};
/**
 * Simple class that determines the DevTools locale based on:
 *   1) navigator.language, which matches the Chrome UI
 *   2) the value of the "language" Setting the user choses
 *   3) available locales in DevTools.
 *
 * The DevTools locale is only determined once during startup and
 * guaranteed to never change. Use this class when using
 * `Intl` APIs.
 */
export declare class DevToolsLocale {
    readonly locale: string;
    readonly lookupClosestDevToolsLocale: (locale: string) => string;
    private constructor();
    static instance(opts?: DevToolsLocaleCreationOptions): DevToolsLocale;
    static removeInstance(): void;
    forceFallbackLocale(): void;
    /**
     * Returns true iff DevTools supports the language of the passed locale.
     * Note that it doesn't have to be a one-to-one match, e.g. if DevTools supports
     * 'de', then passing 'de-AT' will return true.
     */
    languageIsSupportedByDevTools(localeString: string): boolean;
}
/**
 * Returns true iff the two locales have matching languages. This means the
 * passing 'de-AT' and 'de-DE' will return true, while 'de-DE' and 'en' will
 * return false.
 */
export declare function localeLanguagesMatch(localeString1: string, localeString2: string): boolean;
