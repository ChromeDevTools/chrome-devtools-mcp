import * as I18n from '../../third_party/i18n/i18n.js';
import type * as Platform from '../platform/platform.js';
import { DevToolsLocale } from './DevToolsLocale.js';
import type * as i18nTypes from './i18nTypes.js';
/**
 * Look up the best available locale for the requested language through these fall backs:
 * - exact match
 * - progressively shorter prefixes (`de-CH-1996` -> `de-CH` -> `de`)
 * - the default locale ('en-US') if no match is found
 *
 * If `locale` isn't provided, the default is used.
 */
export declare function lookupClosestSupportedDevToolsLocale(locale: string): string;
/**
 * Returns a list of all supported DevTools locales, including pseudo locales.
 */
export declare function getAllSupportedDevToolsLocales(): string[];
/**
 * Fetches the locale data of the specified locale.
 * Callers have to ensure that `locale` is an officially supported locale.
 * Depending whether a locale is present in `bundledLocales`, the data will be
 * fetched locally or remotely.
 */
export declare function fetchAndRegisterLocaleData(locale: Intl.UnicodeBCP47LocaleIdentifier, location?: string): Promise<void>;
export declare function hasLocaleDataForTest(locale: Intl.UnicodeBCP47LocaleIdentifier): boolean;
export declare function resetLocaleDataForTest(): void;
export declare function registerLocaleDataForTest(locale: Intl.UnicodeBCP47LocaleIdentifier, messages: I18n.I18n.LocalizedMessages): void;
/**
 * Returns an anonymous function that wraps a call to retrieve a localized string.
 * This is introduced so that localized strings can be declared in environments where
 * the i18n system has not been configured and so, cannot be directly invoked. Instead,
 * strings are lazily localized when they are used. This is used for instance in the
 * meta files used to register module extensions.
 */
export declare function getLazilyComputedLocalizedString(registeredStrings: I18n.LocalizedStringSet.RegisteredFileStrings, id: string, values?: i18nTypes.Values): () => Platform.UIString.LocalizedString;
/**
 * Retrieve the localized string.
 */
export declare function getLocalizedString(registeredStrings: I18n.LocalizedStringSet.RegisteredFileStrings, id: string, values?: i18nTypes.Values): Platform.UIString.LocalizedString;
/**
 * Register a file's UIStrings with i18n, return function to generate the string ids.
 */
export declare function registerUIStrings(path: string, stringStructure: Record<string, string>): I18n.LocalizedStringSet.RegisteredFileStrings;
export declare function serializeUIString(string: string, values?: Record<string, Object>): string;
export declare function deserializeUIString(serializedMessage: string): i18nTypes.SerializedMessage;
/**
 * Use this function in places where a `LocalizedString` is expected but the
 * term/phrase you want to use does not require translation.
 */
export declare function lockedString(str: string): Platform.UIString.LocalizedString;
/**
 * Same as `lockedString` but for places where `i18nLazyString` would be used otherwise.
 */
export declare function lockedLazyString(str: string): () => Platform.UIString.LocalizedString;
/**
 * Returns a string of the form:
 *   "German (Austria) - Deutsch (Österreich)"
 * where the former locale representation is written in the currently enabled DevTools
 * locale and the latter locale representation is written in the locale of `localeString`.
 *
 * Should the two locales match (i.e. have the same language) then the latter locale
 * representation is written in English.
 */
export declare function getLocalizedLanguageRegion(localeString: Intl.UnicodeBCP47LocaleIdentifier, devtoolsLocale: DevToolsLocale): Platform.UIString.LocalizedString;
