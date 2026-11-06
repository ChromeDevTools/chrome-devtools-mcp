import { RegisteredFileStrings } from './localized-string-set.js';
export type UIStrings = Record<string, string>;
export type LocalizedMessages = Record<string, {
    message: string;
}>;
/**
 * Encapsulates the global state of the i18n runtime.
 */
export declare class I18n {
    readonly supportedLocales: ReadonlySet<Intl.UnicodeBCP47LocaleIdentifier>;
    private localeData;
    readonly defaultLocale: Intl.UnicodeBCP47LocaleIdentifier;
    constructor(supportedLocales: readonly Intl.UnicodeBCP47LocaleIdentifier[], defaultLocale: Intl.UnicodeBCP47LocaleIdentifier);
    registerLocaleData(locale: Intl.UnicodeBCP47LocaleIdentifier, messages: LocalizedMessages): void;
    hasLocaleDataForTest(locale: Intl.UnicodeBCP47LocaleIdentifier): boolean;
    resetLocaleDataForTest(): void;
    registerFileStrings(filename: string, stringStructure: UIStrings): RegisteredFileStrings;
    /**
     * Look up the best available locale for the requested language through these fall backs:
     * - exact match
     * - progressively shorter prefixes (`de-CH-1996` -> `de-CH` -> `de`)
     * - the default locale if no match is found
     */
    lookupClosestSupportedLocale(locale: Intl.UnicodeBCP47LocaleIdentifier): Intl.UnicodeBCP47LocaleIdentifier;
}
