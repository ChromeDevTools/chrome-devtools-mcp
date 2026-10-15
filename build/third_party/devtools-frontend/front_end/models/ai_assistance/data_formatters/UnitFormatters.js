// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * This module contains unit formatters that are only to be used within
 * the AI models because they do not account for locales other than en-US.
 */
const defaultTimeFormatterOptions = {
    style: 'unit',
    unitDisplay: 'narrow',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
};
const defaultByteFormatterOptions = {
    style: 'unit',
    unitDisplay: 'narrow',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
};
const timeFormatters = {
    milli: new Intl.NumberFormat('en-US', {
        ...defaultTimeFormatterOptions,
        unit: 'millisecond',
    }),
    milliWithPrecision: new Intl.NumberFormat('en-US', {
        ...defaultTimeFormatterOptions,
        maximumFractionDigits: 1,
        unit: 'millisecond',
    }),
    second: new Intl.NumberFormat('en-US', {
        ...defaultTimeFormatterOptions,
        maximumFractionDigits: 1,
        unit: 'second',
    }),
    micro: new Intl.NumberFormat('en-US', {
        ...defaultTimeFormatterOptions,
        unit: 'microsecond',
    }),
};
const byteFormatters = {
    bytes: new Intl.NumberFormat('en-US', {
        ...defaultByteFormatterOptions,
        // Don't need as much precision on bytes.
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
        unit: 'byte',
    }),
    kilobytes: new Intl.NumberFormat('en-US', {
        ...defaultByteFormatterOptions,
        unit: 'kilobyte',
    }),
    kilobytesDecimal: new Intl.NumberFormat('en-US', {
        ...defaultByteFormatterOptions,
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
        unit: 'kilobyte',
    }),
    kilobytesInteger: new Intl.NumberFormat('en-US', {
        ...defaultByteFormatterOptions,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
        unit: 'kilobyte',
    }),
    megabytes: new Intl.NumberFormat('en-US', {
        ...defaultByteFormatterOptions,
        unit: 'megabyte',
    }),
};
function numberIsTooLarge(x) {
    return !Number.isFinite(x) || x === Number.MAX_VALUE;
}
export function seconds(x) {
    if (numberIsTooLarge(x)) {
        return '-';
    }
    if (x === 0) {
        return formatAndEnsureSpace(timeFormatters.second, x);
    }
    const asMilli = x * 1_000;
    if (asMilli < 1) {
        return micros(x * 1_000_000);
    }
    if (asMilli < 1_000) {
        return millis(asMilli);
    }
    return formatAndEnsureSpace(timeFormatters.second, x);
}
export function millis(x) {
    if (numberIsTooLarge(x)) {
        return '-';
    }
    if (x < 1) {
        return formatAndEnsureSpace(timeFormatters.milliWithPrecision, x);
    }
    return formatAndEnsureSpace(timeFormatters.milli, x);
}
export function micros(x) {
    if (numberIsTooLarge(x)) {
        return '-';
    }
    if (x < 100) {
        return formatAndEnsureSpace(timeFormatters.micro, x);
    }
    const asMilli = x / 1_000;
    return millis(asMilli);
}
export function bytes(x) {
    if (x < 1_000) {
        return formatAndEnsureSpace(byteFormatters.bytes, x);
    }
    const kilobytes = x / 1_000;
    if (kilobytes < 1_000) {
        return formatAndEnsureSpace(byteFormatters.kilobytes, kilobytes);
    }
    const megabytes = kilobytes / 1_000;
    return formatAndEnsureSpace(byteFormatters.megabytes, megabytes);
}
export function formatBytesToKb(x) {
    const kilobytes = x / 1_000;
    if (kilobytes < 100) {
        return formatAndEnsureSpace(byteFormatters.kilobytesDecimal, kilobytes);
    }
    return formatAndEnsureSpace(byteFormatters.kilobytesInteger, kilobytes);
}
/**
 * When using 'narrow' unitDisplay, many locales exclude the space between the literal and the unit.
 * We don't like that, so when there is no space literal we inject the provided separator manually.
 */
function formatAndEnsureSpace(formatter, value, separator = '\xA0') {
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
//# sourceMappingURL=UnitFormatters.js.map