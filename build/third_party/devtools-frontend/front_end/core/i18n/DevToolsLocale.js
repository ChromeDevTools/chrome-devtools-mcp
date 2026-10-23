// Copyright 2021 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
let devToolsLocaleInstance = null;
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
export class DevToolsLocale {
    locale;
    lookupClosestDevToolsLocale;
    constructor(data) {
        this.lookupClosestDevToolsLocale = data.lookupClosestDevToolsLocale;
        // TODO(crbug.com/1163928): Use constant once setting actually exists.
        if (data.settingLanguage === 'browserLanguage') {
            this.locale = data.navigatorLanguage || 'en-US';
        }
        else {
            this.locale = data.settingLanguage;
        }
        this.locale = this.lookupClosestDevToolsLocale(this.locale);
    }
    static instance(opts = { create: false }) {
        if (!devToolsLocaleInstance && !opts.create) {
            throw new Error('No LanguageSelector instance exists yet.');
        }
        if (opts.create) {
            devToolsLocaleInstance = new DevToolsLocale(opts.data);
        }
        return devToolsLocaleInstance;
    }
    static removeInstance() {
        devToolsLocaleInstance = null;
    }
    forceFallbackLocale() {
        // Locale is 'readonly', this is the only case where we want to forcibly
        // overwrite the locale.
        this.locale = 'en-US';
    }
    /**
     * Returns true iff DevTools supports the language of the passed locale.
     * Note that it doesn't have to be a one-to-one match, e.g. if DevTools supports
     * 'de', then passing 'de-AT' will return true.
     */
    languageIsSupportedByDevTools(localeString) {
        return localeLanguagesMatch(localeString, this.lookupClosestDevToolsLocale(localeString));
    }
}
/**
 * Returns true iff the two locales have matching languages. This means the
 * passing 'de-AT' and 'de-DE' will return true, while 'de-DE' and 'en' will
 * return false.
 */
export function localeLanguagesMatch(localeString1, localeString2) {
    const locale1 = new Intl.Locale(localeString1);
    const locale2 = new Intl.Locale(localeString2);
    return locale1.language === locale2.language;
}
//# sourceMappingURL=DevToolsLocale.js.map