// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as I18n from '../../third_party/i18n/i18n.js';
import * as Root from '../root/root.js';
import { DevToolsLocale } from './DevToolsLocale.js';
import { BUNDLED_LOCALES as BUNDLED_LOCALES_GENERATED, DEFAULT_LOCALE, LOCAL_FETCH_PATTERN, LOCALES, REMOTE_FETCH_PATTERN, } from './locales.js';
const i18nInstance = new I18n.I18n.I18n(LOCALES, DEFAULT_LOCALE);
// All the locales that are part of the DevTools bundle and should not be fetched
// remotely.
const BUNDLED_LOCALES = new Set([...BUNDLED_LOCALES_GENERATED]);
/**
 * Look up the best available locale for the requested language through these fall backs:
 * - exact match
 * - progressively shorter prefixes (`de-CH-1996` -> `de-CH` -> `de`)
 * - the default locale ('en-US') if no match is found
 *
 * If `locale` isn't provided, the default is used.
 */
export function lookupClosestSupportedDevToolsLocale(locale) {
    return i18nInstance.lookupClosestSupportedLocale(locale);
}
/**
 * Returns a list of all supported DevTools locales, including pseudo locales.
 */
export function getAllSupportedDevToolsLocales() {
    return [...i18nInstance.supportedLocales];
}
/**
 * Returns the Url from which a locale can be fetched. This depends on the
 * specific locale, as some are bundled with DevTools while others
 * have to be fetched remotely.
 */
function getLocaleFetchUrl(locale, location) {
    const remoteBase = Root.Runtime.getRemoteBase(location);
    if (remoteBase?.version && !BUNDLED_LOCALES.has(locale)) {
        return REMOTE_FETCH_PATTERN.replace('@HOST@', 'devtools://devtools')
            .replace('@VERSION@', remoteBase.version)
            .replace('@LOCALE@', locale);
    }
    const path = LOCAL_FETCH_PATTERN.replace('@LOCALE@', locale);
    return new URL(path, import.meta.url).toString();
}
/**
 * Fetches the locale data of the specified locale.
 * Callers have to ensure that `locale` is an officially supported locale.
 * Depending whether a locale is present in `bundledLocales`, the data will be
 * fetched locally or remotely.
 */
export async function fetchAndRegisterLocaleData(locale, 
// Type issue with universal types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
location = globalThis.location?.toString() ?? '') {
    const localeDataTextPromise = fetch(getLocaleFetchUrl(locale, location)).then(result => result.json());
    const timeoutPromise = new Promise((_, reject) => globalThis.setTimeout(() => reject(new Error('timed out fetching locale')), 5000));
    const localeData = await Promise.race([timeoutPromise, localeDataTextPromise]);
    i18nInstance.registerLocaleData(locale, localeData);
}
export function hasLocaleDataForTest(locale) {
    return i18nInstance.hasLocaleDataForTest(locale);
}
export function resetLocaleDataForTest() {
    i18nInstance.resetLocaleDataForTest();
}
export function registerLocaleDataForTest(locale, messages) {
    i18nInstance.registerLocaleData(locale, messages);
}
/**
 * Returns an anonymous function that wraps a call to retrieve a localized string.
 * This is introduced so that localized strings can be declared in environments where
 * the i18n system has not been configured and so, cannot be directly invoked. Instead,
 * strings are lazily localized when they are used. This is used for instance in the
 * meta files used to register module extensions.
 */
export function getLazilyComputedLocalizedString(registeredStrings, id, values = {}) {
    return () => getLocalizedString(registeredStrings, id, values);
}
/**
 * Retrieve the localized string.
 */
export function getLocalizedString(registeredStrings, id, values = {}) {
    return registeredStrings.getLocalizedStringSetFor(DevToolsLocale.instance().locale).getLocalizedString(id, values);
}
/**
 * Register a file's UIStrings with i18n, return function to generate the string ids.
 */
export function registerUIStrings(path, stringStructure) {
    return i18nInstance.registerFileStrings(path, stringStructure);
}
export function serializeUIString(string, values = {}) {
    const serializedMessage = { string, values };
    return JSON.stringify(serializedMessage);
}
export function deserializeUIString(serializedMessage) {
    if (!serializedMessage) {
        return { string: '', values: {} };
    }
    return JSON.parse(serializedMessage);
}
/**
 * Use this function in places where a `LocalizedString` is expected but the
 * term/phrase you want to use does not require translation.
 */
export function lockedString(str) {
    return str;
}
/**
 * Same as `lockedString` but for places where `i18nLazyString` would be used otherwise.
 */
export function lockedLazyString(str) {
    return () => str;
}
/**
 * Returns a string of the form:
 *   "German (Austria) - Deutsch (Österreich)"
 * where the former locale representation is written in the currently enabled DevTools
 * locale and the latter locale representation is written in the locale of `localeString`.
 *
 * Should the two locales match (i.e. have the same language) then the latter locale
 * representation is written in English.
 */
export function getLocalizedLanguageRegion(localeString, devtoolsLocale) {
    const locale = new Intl.Locale(localeString);
    const { language, baseName } = locale;
    const devtoolsLoc = new Intl.Locale(devtoolsLocale.locale);
    const targetLanguage = language === devtoolsLoc.language ? 'en' : baseName;
    const languageInCurrentLocale = new Intl.DisplayNames([devtoolsLocale.locale], { type: 'language' }).of(language);
    const languageInTargetLocale = new Intl.DisplayNames([targetLanguage], { type: 'language' }).of(language);
    let wrappedRegionInCurrentLocale = '';
    let wrappedRegionInTargetLocale = '';
    if (locale.region) {
        const regionInCurrentLocale = new Intl.DisplayNames([devtoolsLocale.locale], { type: 'region', style: 'short' }).of(locale.region);
        const regionInTargetLocale = new Intl.DisplayNames([targetLanguage], { type: 'region', style: 'short' }).of(locale.region);
        wrappedRegionInCurrentLocale = ` (${regionInCurrentLocale})`;
        wrappedRegionInTargetLocale = ` (${regionInTargetLocale})`;
    }
    return `${languageInCurrentLocale}${wrappedRegionInCurrentLocale} - ${languageInTargetLocale}${wrappedRegionInTargetLocale}`;
}
//# sourceMappingURL=i18nImpl.js.map