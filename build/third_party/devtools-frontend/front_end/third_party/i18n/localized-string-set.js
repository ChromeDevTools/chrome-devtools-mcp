// Copyright 2018 The Lighthouse Authors. All Rights Reserved.
// Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
// Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
import * as IntlMessageFormat from '../intl-messageformat/intl-messageformat.js';
const EMPTY_VALUES_OBJECT = {};
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
export class RegisteredFileStrings {
    filename;
    stringStructure;
    localizedMessages;
    localizedStringSet;
    constructor(filename, stringStructure, localizedMessages) {
        this.filename = filename;
        this.stringStructure = stringStructure;
        this.localizedMessages = localizedMessages;
    }
    getLocalizedStringSetFor(locale) {
        if (this.localizedStringSet) {
            return this.localizedStringSet;
        }
        const localeData = this.localizedMessages.get(locale);
        if (!localeData) {
            throw new Error(`No locale data registered for '${locale}'`);
        }
        this.localizedStringSet = new LocalizedStringSet(this.filename, this.stringStructure, locale, localeData);
        return this.localizedStringSet;
    }
}
/**
 * A set of translated strings for a single file in a specific locale.
 *
 * The class is a wrapper around `IntlMessageFormat#format` plus a cache
 * to speed up consecutive lookups of the same message.
 */
export class LocalizedStringSet {
    filename;
    stringStructure;
    localizedMessages;
    cachedSimpleStrings = new Map();
    cachedMessageFormatters = new Map();
    /** For pseudo locales, use 'de-DE' for number formatting */
    localeForFormatter;
    constructor(filename, stringStructure, locale, localizedMessages) {
        this.filename = filename;
        this.stringStructure = stringStructure;
        this.localizedMessages = localizedMessages;
        this.localeForFormatter = (locale === 'en-XA' || locale === 'en-XL') ? 'de-DE' : locale;
    }
    getLocalizedString(message, values = EMPTY_VALUES_OBJECT) {
        if (values === EMPTY_VALUES_OBJECT || Object.keys(values).length === 0) {
            return this.getSimpleLocalizedString(message);
        }
        return this.getFormattedLocalizedString(message, values);
    }
    getMessageFormatterFor(message) {
        const keyname = Object.keys(this.stringStructure).find(key => this.stringStructure[key] === message);
        if (!keyname) {
            throw new Error(`Unable to locate '${message}' in UIStrings object`);
        }
        const i18nId = `${this.filename} | ${keyname}`;
        const localeMessage = this.localizedMessages[i18nId];
        // The requested string might not yet have been collected into en-US.json or
        // been translated yet. Fall back to the original TypeScript UIStrings message.
        const messageToTranslate = localeMessage ? localeMessage.message : message;
        return new IntlMessageFormat.IntlMessageFormat(messageToTranslate, this.localeForFormatter, undefined, { ignoreTag: true });
    }
    getSimpleLocalizedString(message) {
        const cachedSimpleString = this.cachedSimpleStrings.get(message);
        if (cachedSimpleString) {
            return cachedSimpleString;
        }
        const formatter = this.getMessageFormatterFor(message);
        try {
            const translatedString = formatter.format();
            this.cachedSimpleStrings.set(message, translatedString);
            return translatedString;
        }
        catch {
            // The message could have been updated and use different placeholders then
            // the translation. This is a rare edge case so it's fine to create a temporary
            // IntlMessageFormat and fall back to the UIStrings message.
            const formatter = new IntlMessageFormat.IntlMessageFormat(message, this.localeForFormatter, undefined, { ignoreTag: true });
            const translatedString = formatter.format();
            this.cachedSimpleStrings.set(message, translatedString);
            return translatedString;
        }
    }
    getFormattedLocalizedString(message, values) {
        let formatter = this.cachedMessageFormatters.get(message);
        if (!formatter) {
            formatter = this.getMessageFormatterFor(message);
            this.cachedMessageFormatters.set(message, formatter);
        }
        try {
            return formatter.format(values);
        }
        catch {
            // The message could have been updated and use different placeholders then
            // the translation. This is a rare edge case so it's fine to create a temporary
            // IntlMessageFormat and fall back to the UIStrings message.
            const formatter = new IntlMessageFormat.IntlMessageFormat(message, this.localeForFormatter, undefined, { ignoreTag: true });
            return formatter.format(values);
        }
    }
}
//# sourceMappingURL=localized-string-set.js.map