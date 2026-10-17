// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { DevToolsLocale } from './DevToolsLocale.js';
/**
 * Creates an instance of NumberFormatter.
 *
 * Safe to call in top-level of a module, since the creation of Intl.NumberFormat is deferred
 * until first usage.
 */
export function defineFormatter(options) {
    let intlNumberFormat;
    return {
        format(value, separator) {
            if (!intlNumberFormat) {
                intlNumberFormat = new Intl.NumberFormat(DevToolsLocale.instance().locale, options);
            }
            return formatAndEnsureSpace(intlNumberFormat, value, separator);
        },
        formatToParts(value) {
            if (!intlNumberFormat) {
                intlNumberFormat = new Intl.NumberFormat(DevToolsLocale.instance().locale, options);
            }
            return intlNumberFormat.formatToParts(value);
        },
    };
}
/**
 * When using 'narrow' unitDisplay, many locales exclude the space between the literal and the unit.
 * We don't like that, so when there is no space literal we inject the provided separator manually.
 */
function formatAndEnsureSpace(formatter, value, separator = '\xA0') {
    // TODO(crbug.com/443038315): this method is defined in
    // models/ai_assistance in the UnitFormatters file. We can't currently
    // re-use it because various models depend on i18n and that creates a
    // circular build.
    // We should move the unit formatters to their own model so it can be
    // used across the codebase.
    const parts = formatter.formatToParts(value);
    let hasSpace = false;
    for (const part of parts) {
        if (part.type === 'literal') {
            if (part.value === ' ') {
                hasSpace = true;
                part.value = separator;
            }
            else if (part.value === separator) {
                hasSpace = true;
            }
        }
    }
    if (hasSpace) {
        return parts.map(part => part.value).join('');
    }
    const unitIndex = parts.findIndex(part => part.type === 'unit');
    // Unexpected for there to be no unit, but just in case, handle that.
    if (unitIndex === -1) {
        return parts.map(part => part.value).join('');
    }
    // For locales where the unit comes first (sw), the space has to come after the unit.
    if (unitIndex === 0) {
        return parts[0].value + separator + parts.slice(1).map(part => part.value).join('');
    }
    // Otherwise, it comes before.
    return parts.slice(0, unitIndex).map(part => part.value).join('') + separator +
        parts.slice(unitIndex).map(part => part.value).join('');
}
//# sourceMappingURL=NumberFormatter.js.map