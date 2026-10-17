// Copyright 2010 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
// Ideally, we would rely on platform support for parsing a cookie, since
// this would save us from any potential inconsistency. However, exposing
// platform cookie parsing logic would require quite a bit of additional
// plumbing, and at least some platforms lack support for parsing Cookie,
// which is in a format slightly different from Set-Cookie and is normally
// only required on the server side.
import { Cookie } from './Cookie.js';
export class CookieParser {
    #domain;
    #cookies;
    #input;
    #originalInputLength;
    #lastCookie;
    #lastCookieLine;
    #lastCookiePosition;
    constructor(domain) {
        if (domain) {
            // Handle #domain according to
            // https://tools.ietf.org/html/draft-ietf-httpbis-rfc6265bis-03#section-5.3.3
            this.#domain = domain.toLowerCase().replace(/^\./, '');
        }
        this.#cookies = [];
        this.#originalInputLength = 0;
    }
    static parseSetCookie(header, domain) {
        return (new CookieParser(domain)).parseSetCookie(header);
    }
    getCookieAttribute(header) {
        if (!header) {
            return null;
        }
        switch (header.toLowerCase()) {
            case 'domain':
                return "domain" /* Attribute.DOMAIN */;
            case 'expires':
                return "expires" /* Attribute.EXPIRES */;
            case 'max-age':
                return "max-age" /* Attribute.MAX_AGE */;
            case 'httponly':
                return "http-only" /* Attribute.HTTP_ONLY */;
            case 'name':
                return "name" /* Attribute.NAME */;
            case 'path':
                return "path" /* Attribute.PATH */;
            case 'samesite':
                return "same-site" /* Attribute.SAME_SITE */;
            case 'secure':
                return "secure" /* Attribute.SECURE */;
            case 'value':
                return "value" /* Attribute.VALUE */;
            case 'priority':
                return "priority" /* Attribute.PRIORITY */;
            case 'sourceport':
                return "source-port" /* Attribute.SOURCE_PORT */;
            case 'sourcescheme':
                return "source-scheme" /* Attribute.SOURCE_SCHEME */;
            case 'partitioned':
                return "partitioned" /* Attribute.PARTITIONED */;
            default:
                console.error('Failed getting cookie attribute: ' + header);
                return null;
        }
    }
    cookies() {
        return this.#cookies;
    }
    parseSetCookie(setCookieHeader) {
        if (!this.initialize(setCookieHeader)) {
            return null;
        }
        for (let kv = this.extractKeyValue(); kv; kv = this.extractKeyValue()) {
            if (this.#lastCookie) {
                this.#lastCookie.addAttribute(this.getCookieAttribute(kv.key), kv.value);
            }
            else {
                this.addCookie(kv, 1 /* Type.RESPONSE */);
            }
            if (this.advanceAndCheckCookieDelimiter()) {
                this.flushCookie();
            }
        }
        this.flushCookie();
        return this.#cookies;
    }
    initialize(headerValue) {
        this.#input = headerValue;
        if (typeof headerValue !== 'string') {
            return false;
        }
        this.#cookies = [];
        this.#lastCookie = null;
        this.#lastCookieLine = '';
        this.#originalInputLength = this.#input.length;
        return true;
    }
    flushCookie() {
        if (this.#lastCookie) {
            // if we have a last cookie we know that these valeus all exist, hence the typecasts
            this.#lastCookie.setSize(this.#originalInputLength - this.#input.length - this.#lastCookiePosition);
            this.#lastCookie.setCookieLine(this.#lastCookieLine.replace('\n', ''));
        }
        this.#lastCookie = null;
        this.#lastCookieLine = '';
    }
    extractKeyValue() {
        if (!this.#input || !this.#input.length) {
            return null;
        }
        // Note: RFCs offer an option for quoted values that may contain commas and semicolons.
        // Many browsers/platforms do not support this, however (see http://webkit.org/b/16699
        // and http://crbug.com/12361). The logic below matches latest versions of IE, Firefox,
        // Chrome and Safari on some old platforms. The latest version of Safari supports quoted
        // cookie values, though.
        const keyValueMatch = /^[ \t]*([^=;\n]+)[ \t]*(?:=[ \t]*([^;\n]*))?/.exec(this.#input);
        if (!keyValueMatch) {
            console.error('Failed parsing cookie header before: ' + this.#input);
            return null;
        }
        const result = new KeyValue(keyValueMatch[1]?.trim(), keyValueMatch[2]?.trim(), (this.#originalInputLength) - this.#input.length);
        this.#lastCookieLine += keyValueMatch[0];
        this.#input = this.#input.slice(keyValueMatch[0].length);
        return result;
    }
    advanceAndCheckCookieDelimiter() {
        if (!this.#input) {
            return false;
        }
        const match = /^\s*[\n;]\s*/.exec(this.#input);
        if (!match) {
            return false;
        }
        this.#lastCookieLine += match[0];
        this.#input = this.#input.slice(match[0].length);
        return match[0].match('\n') !== null;
    }
    addCookie(keyValue, type) {
        if (this.#lastCookie) {
            this.#lastCookie.setSize(keyValue.position - this.#lastCookiePosition);
        }
        // Mozilla bug 169091: Mozilla, IE and Chrome treat single token (w/o "=") as
        // specifying a value for a cookie with empty name.
        this.#lastCookie = typeof keyValue.value === 'string' ? new Cookie(keyValue.key, keyValue.value, type) :
            new Cookie('', keyValue.key, type);
        if (this.#domain) {
            this.#lastCookie.addAttribute("domain" /* Attribute.DOMAIN */, this.#domain);
        }
        this.#lastCookiePosition = keyValue.position;
        this.#cookies.push(this.#lastCookie);
    }
}
class KeyValue {
    key;
    value;
    position;
    constructor(key, value, position) {
        this.key = key;
        this.value = value;
        this.position = position;
    }
}
//# sourceMappingURL=CookieParser.js.map