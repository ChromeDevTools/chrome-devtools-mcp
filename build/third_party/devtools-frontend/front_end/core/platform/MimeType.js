// Copyright 2023 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * MIME types other than the ones with the "text" type that have text content.
 */
const ADDITIONAL_TEXT_MIME_TYPES = new Set([
    'application/ecmascript',
    'application/javascript',
    'application/json',
    'application/json+protobuf',
    'application/mpegurl',
    'application/vnd.apple.mpegurl',
    'application/vnd.dart',
    'application/xml',
    'application/x-aspx',
    'application/x-javascript',
    'application/x-jsp',
    'application/x-httpd-php',
    'application/x-mpegurl',
    'audio/mpegurl',
    'audio/x-mpegurl',
]);
/**
 * @returns true iff `mimeType` has textual content. Concretely we return true if:
 *   - `mimeType` starts with "text/" or "multipart/"
 *   - `mimeType` ends with "+xml"
 *   - `mimeType` contains "json"
 *   - if `mimeType` is one of a predefined list textual mime types.
 */
export function isTextType(mimeType) {
    return mimeType.startsWith('text/') || mimeType.startsWith('multipart/') || mimeType.includes('json') ||
        mimeType.endsWith('+xml') || ADDITIONAL_TEXT_MIME_TYPES.has(mimeType);
}
/**
 * Port of net::HttpUtils::ParseContentType to extract mimeType and charset from
 * the 'Content-Type' header.
 */
export function parseContentType(contentType) {
    if (contentType === '*/*') {
        return { mimeType: null, charset: null };
    }
    const { mimeType, params } = parseMimeType(contentType);
    const charset = params.get('charset')?.toLowerCase().trim() ?? null;
    return { mimeType, charset };
}
function parseMimeType(contentType) {
    // Remove any leading and trailing whitespace. Note that String.prototype.trim removes a lot more
    // than what the spec considers whitespace. We are fine with that.
    contentType = contentType.trim();
    // The mimetype is basically everything until the first ';' (but trimmed).
    let mimeTypeEnd = findFirstIndexOf(contentType, ' \t;(');
    if (mimeTypeEnd < 0) {
        mimeTypeEnd = contentType.length;
    }
    const slashPos = contentType.indexOf('/');
    if (slashPos < 0 || slashPos > mimeTypeEnd) {
        return { mimeType: null, params: new Map() };
    }
    const mimeType = contentType.substring(0, mimeTypeEnd).toLowerCase();
    // Iterate over parameters. We can't split the string around semicolons because quoted
    // strings may include semicolons.
    const params = new Map();
    let offset = contentType.indexOf(';', mimeTypeEnd);
    while (offset >= 0 && offset < contentType.length) {
        // Trim off the semicolon.
        ++offset;
        // Trim off whitespace
        offset = findFirstIndexNotOf(contentType, ' \t', offset);
        if (offset < 0) {
            continue;
        }
        const paramNameStart = offset;
        // Extend parameter name until we run into semicolon or equals sign.
        offset = findFirstIndexOf(contentType, ';=', offset);
        if (offset < 0 || contentType[offset] === ';') {
            // Nothing more to do if no more input or there is no parameter value.
            continue;
        }
        const paramName = contentType.substring(paramNameStart, offset).toLowerCase();
        //  Trim off the '='.
        ++offset;
        // Trim off whitespace.
        offset = findFirstIndexNotOf(contentType, ' \t', offset);
        let paramValue = '';
        if (offset < 0 || contentType[offset] === ';') {
            // Nothing to do here: the value is an unquoted string of only whitespace.
            continue;
        }
        else if (contentType[offset] !== '"') {
            // Not a quote so we can copy the value as-is.
            const valueStart = offset;
            offset = contentType.indexOf(';', offset);
            const valueEnd = offset >= 0 ? offset : contentType.length;
            paramValue = contentType.substring(valueStart, valueEnd).trimEnd();
        }
        else {
            // Otherwise append data with special handling for backslashes, until a close quote.
            // Don't trim whitespace for quoted strings.
            // Trim off the opening quote '"'
            ++offset;
            while (offset < contentType.length && contentType[offset] !== '"') {
                // Skip over backslash and append the next character, when not at the end
                // of the string. Otherwise, copy the next character (which may be a backslash).
                if (contentType[offset] === '\\' && offset + 1 < contentType.length) {
                    ++offset;
                }
                paramValue += contentType[offset];
                ++offset;
            }
            offset = contentType.indexOf(';', offset);
        }
        if (!params.has(paramName)) {
            // The first one wins!
            params.set(paramName, paramValue);
        }
    }
    return { mimeType, params };
}
/**
 * @returns the smallest index of any character in 'characters' or -1 if none of
 * the characters occur in 'searchString'
 */
function findFirstIndexOf(searchString, characters, pos = 0) {
    for (let i = pos; i < searchString.length; i++) {
        if (characters.includes(searchString[i])) {
            return i;
        }
    }
    return -1;
}
/**
 * @returns the smallest index of any character not in 'characters' or -1 if only
 * 'characters' occur in 'searchString'
 */
function findFirstIndexNotOf(searchString, characters, pos = 0) {
    for (let i = pos; i < searchString.length; i++) {
        if (!characters.includes(searchString[i])) {
            return i;
        }
    }
    return -1;
}
//# sourceMappingURL=MimeType.js.map