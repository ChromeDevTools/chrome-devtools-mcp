import type { LocalizedMessages, UIStrings } from './i18n-impl.js';
import * as IntlMessageFormat from '../intl-messageformat/intl-messageformat.js';
/**
 * This class is usually created at module instantiation time and
 * holds the filename, the UIStrings object and a reference to
 * all the localization data.
 *
 * Later, once needed, users can request a `LocalizedStringSet` that represents
 * all the translated strings, in a given locale for the specific file and
 * UIStrings object.
 *
 * Please note that this class is implemented with invariant in mind that the
 * DevTools locale never changes. Otherwise we would have to use a Map as
 * the cache. For performance reasons, we store the single possible map entry
 * as a property directly.
 *
 * The DevTools locale CANNOT be passed via the constructor. When instances
 * of `RegisteredFileStrings` are created, the DevTools locale has not yet
 * been determined.
 */
export declare class RegisteredFileStrings {
    private filename;
    private stringStructure;
    private localizedMessages;
    private localizedStringSet?;
    constructor(filename: string, stringStructure: UIStrings, localizedMessages: Map<Intl.UnicodeBCP47LocaleIdentifier, LocalizedMessages>);
    getLocalizedStringSetFor(locale: Intl.UnicodeBCP47LocaleIdentifier): LocalizedStringSet;
}
export type Values = Record<string, string | number | boolean>;
/**
 * A set of translated strings for a single file in a specific locale.
 *
 * The class is a wrapper around `IntlMessageFormat#format` plus a cache
 * to speed up consecutive lookups of the same message.
 */
export declare class LocalizedStringSet {
    private filename;
    private stringStructure;
    private localizedMessages;
    private readonly cachedSimpleStrings;
    private readonly cachedMessageFormatters;
    /** For pseudo locales, use 'de-DE' for number formatting */
    private readonly localeForFormatter;
    constructor(filename: string, stringStructure: UIStrings, locale: Intl.UnicodeBCP47LocaleIdentifier, localizedMessages: LocalizedMessages);
    getLocalizedString(message: string, values?: Values): string;
    getMessageFormatterFor(message: string): IntlMessageFormat.IntlMessageFormat;
    private getSimpleLocalizedString;
    private getFormattedLocalizedString;
}
