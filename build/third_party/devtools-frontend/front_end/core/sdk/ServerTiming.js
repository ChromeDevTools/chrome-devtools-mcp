// Copyright 2016 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as i18n from '../i18n/i18n.js';
const UIStrings = {
    /**
     * @description Warning message when deprecated Server-Timing header syntax is found.
     * @example {sql-lookup} PH1
     */
    deprecatedSyntaxFoundPleaseUse: 'Deprecated syntax found for metric "{PH1}". Use: <name>;dur=<duration>;desc=<description>.',
    /**
     * @description Warning message when a duplicate parameter is found in Server-Timing header.
     * @example {https} PH1
     */
    duplicateParameterSIgnored: 'Duplicate parameter "{PH1}" ignored',
    /**
     * @description Warning message when no value is found for a parameter in Server-Timing header.
     * @example {https} PH1
     */
    noValueFoundForParameterS: 'No value found for parameter "{PH1}"',
    /**
     * @description Warning message when an unrecognized parameter is found in Server-Timing header.
     * @example {https} PH1
     */
    unrecognizedParameterS: 'Unrecognized parameter "{PH1}"',
    /**
     * @description Warning message when extraneous trailing characters are found in Server-Timing header.
     */
    extraneousTrailingCharacters: 'Extraneous trailing characters',
    /**
     * @description Warning message when a parameter value cannot be parsed in Server-Timing header.
     * @example {https} PH1
     * @example {2.0} PH2
     */
    unableToParseSValueS: 'Unable to parse "{PH1}" value "{PH2}"',
};
const str_ = i18n.i18n.registerUIStrings('core/sdk/ServerTiming.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export const cloudflarePrefix = '(cf) ';
export const cloudinaryPrefix = '(cld) ';
export class ServerTiming {
    metric;
    value;
    description;
    constructor(metric, value, description) {
        this.metric = metric;
        this.value = value;
        this.description = description;
    }
    static parseHeaders(headers, devToolsConsole) {
        const rawServerTimingHeaders = headers.filter(item => item.name.toLowerCase() === 'server-timing');
        if (!rawServerTimingHeaders.length) {
            return null;
        }
        const serverTimings = rawServerTimingHeaders.reduce((timings, header) => {
            const timing = this.createFromHeaderValue(header.value, devToolsConsole);
            timings.push(...timing.map(function (entry) {
                return new ServerTiming(entry.name, entry.dur ?? null, entry.desc ?? '');
            }));
            return timings;
        }, []);
        return serverTimings;
    }
    static createFromHeaderValue(valueString, devToolsConsole = new Common.Console.Console()) {
        function trimLeadingWhiteSpace() {
            valueString = valueString.replace(/^\s*/, '');
        }
        function consumeDelimiter(char) {
            console.assert(char.length === 1);
            trimLeadingWhiteSpace();
            if (valueString.charAt(0) !== char) {
                return false;
            }
            valueString = valueString.substring(1);
            return true;
        }
        function consumeToken() {
            // https://tools.ietf.org/html/rfc7230#appendix-B
            const result = /^(?:\s*)([\w!#$%&'*+\-.^`|~]+)(?:\s*)(.*)/.exec(valueString);
            if (!result) {
                return null;
            }
            valueString = result[2];
            return result[1];
        }
        function consumeTokenOrQuotedString() {
            trimLeadingWhiteSpace();
            if (valueString.charAt(0) === '"') {
                return consumeQuotedString();
            }
            return consumeToken();
        }
        function consumeQuotedString() {
            console.assert(valueString.charAt(0) === '"');
            valueString = valueString.substring(1); // remove leading DQUOTE
            let value = '';
            while (valueString.length) {
                // split into two parts:
                //  -everything before the first " or \
                //  -everything else
                const result = /^([^"\\]*)(.*)/.exec(valueString);
                if (!result) {
                    return null; // not a valid quoted-string
                }
                value += result[1];
                if (result[2].charAt(0) === '"') {
                    // we have found our closing "
                    valueString = result[2].substring(1); // strip off everything after the closing "
                    return value; // we are done here
                }
                console.assert(result[2].charAt(0) === '\\');
                // special rules for \ found in quoted-string (https://tools.ietf.org/html/rfc7230#section-3.2.6)
                value += result[2].charAt(1); // grab the character AFTER the \ (if there was one)
                valueString = result[2].substring(2); // strip off \ and next character
            }
            return null; // not a valid quoted-string
        }
        function consumeExtraneous() {
            const result = /([,;].*)/.exec(valueString);
            if (result) {
                valueString = result[1];
            }
        }
        const result = [];
        let name;
        while ((name = consumeToken()) !== null) {
            const entry = { name };
            if (valueString.charAt(0) === '=') {
                this.#showWarning(i18nString(UIStrings.deprecatedSyntaxFoundPleaseUse, { PH1: name }), devToolsConsole);
            }
            while (consumeDelimiter(';')) {
                let paramName;
                if ((paramName = consumeToken()) === null) {
                    continue;
                }
                paramName = paramName.toLowerCase();
                const parseParameter = this.#getParserForParameter(paramName, devToolsConsole);
                let paramValue = null;
                if (consumeDelimiter('=')) {
                    // always parse the value, even if we don't recognize the parameter #name
                    paramValue = consumeTokenOrQuotedString();
                    consumeExtraneous();
                }
                if (parseParameter) {
                    // paramName is valid
                    if (entry.hasOwnProperty(paramName)) {
                        this.#showWarning(i18nString(UIStrings.duplicateParameterSIgnored, { PH1: paramName }), devToolsConsole);
                        continue;
                    }
                    if (paramValue === null) {
                        this.#showWarning(i18nString(UIStrings.noValueFoundForParameterS, { PH1: paramName }), devToolsConsole);
                    }
                    parseParameter.call(this, entry, paramValue);
                }
                else {
                    // paramName is not valid
                    // TODO(paulirish): consider showing other included params, like `start`: https://github.com/w3c/server-timing/issues/43
                    this.#showWarning(i18nString(UIStrings.unrecognizedParameterS, { PH1: paramName }), devToolsConsole);
                }
            }
            result.push(entry);
            // Special parsing for cloudflare's bespoke format. https://blog.cloudflare.com/new-standards/#measuring-impact
            // We extract the individual items of the cfL4 server-timing for clear presentation
            if (entry.name === 'cfL4' && entry.desc) {
                new URLSearchParams(entry.desc).entries().forEach(([key, val]) => {
                    result.push({ name: `${cloudflarePrefix}${key}`, desc: val });
                });
            }
            // Special parsing for cloudinary's bespoke format. https://cloudinary.com/blog/inside_the_black_box_with_server_timing#what_details_are_you_sharing_
            // The format has changed since this blog post
            if (entry.name === 'content-info' && entry.desc) {
                new URLSearchParams(entry.desc.replace(/,/g, '&')).entries().forEach(([key, val]) => {
                    result.push({ name: `${cloudinaryPrefix}${key}`, desc: val });
                });
            }
            if (!consumeDelimiter(',')) {
                break;
            }
        }
        if (valueString.length) {
            this.#showWarning(i18nString(UIStrings.extraneousTrailingCharacters), devToolsConsole);
        }
        return result;
    }
    static #getParserForParameter(paramName, devToolsConsole) {
        switch (paramName) {
            case 'dur': {
                function durParser(entry, paramValue) {
                    entry.dur = 0;
                    if (paramValue !== null) {
                        const duration = parseFloat(paramValue);
                        if (isNaN(duration)) {
                            ServerTiming.#showWarning(i18nString(UIStrings.unableToParseSValueS, { PH1: paramName, PH2: paramValue }), devToolsConsole);
                            return;
                        }
                        entry.dur = duration;
                    }
                }
                return durParser;
            }
            case 'desc': {
                function descParser(entry, paramValue) {
                    entry.desc = paramValue || '';
                }
                return descParser;
            }
            default: {
                return null;
            }
        }
    }
    static #showWarning(msg, devToolsConsole) {
        devToolsConsole.warn(`ServerTiming: ${msg}`);
    }
}
//# sourceMappingURL=ServerTiming.js.map