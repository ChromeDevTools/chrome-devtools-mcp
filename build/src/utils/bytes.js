/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { zod } from '../third_party/index.js';
const BYTE_UNITS = {
    b: 1,
    byte: 1,
    bytes: 1,
    k: 1000,
    kb: 1000,
    kib: 1024,
    m: 1000 * 1000,
    mb: 1000 * 1000,
    mib: 1024 * 1024,
    g: 1000 * 1000 * 1000,
    gb: 1000 * 1000 * 1000,
    gib: 1024 * 1024 * 1024,
    t: 1000 * 1000 * 1000 * 1000,
    tb: 1000 * 1000 * 1000 * 1000,
    tib: 1024 * 1024 * 1024 * 1024,
};
/**
 * Parses a byte size string (e.g. "1M", "1MB", "500KB", "1.5GB", "1024") into bytes.
 */
export function parseByteSize(value) {
    const trimmed = value.trim();
    if (trimmed === '') {
        throw new Error(`Invalid byte size: "${value}"`);
    }
    const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?$/);
    if (!match) {
        throw new Error(`Invalid byte size format: "${value}". Expected a number or format like "1024", "1M", "1MB", "1G", "1GB".`);
    }
    const numMatch = match[1];
    if (numMatch === undefined) {
        throw new Error(`Invalid byte size: "${value}"`);
    }
    const num = Number(numMatch);
    if (!Number.isFinite(num) || num < 0) {
        throw new Error(`Invalid byte size: "${value}"`);
    }
    const unitMatch = match[2];
    if (unitMatch === undefined) {
        return Math.round(num);
    }
    const unit = unitMatch.toLowerCase();
    const multiplier = BYTE_UNITS[unit];
    if (multiplier === undefined) {
        throw new Error(`Unknown unit "${unitMatch}" in "${value}". Supported units: B, KB, KiB, MB, MiB, GB, GiB, TB, TiB.`);
    }
    const bytes = Math.round(num * multiplier);
    if (!Number.isFinite(bytes)) {
        throw new Error(`Invalid byte size: "${value}"`);
    }
    return bytes;
}
/**
 * Parses an inclusive byte-size range (e.g. "1MB", "1MB-2MB", "-1MB", "1MB-").
 */
export function parseByteSizeRange(value) {
    const trimmed = value.trim();
    if (!trimmed.includes('-')) {
        return { min: parseByteSize(trimmed), max: undefined };
    }
    const parts = trimmed.split('-');
    if (parts.length !== 2) {
        throw new Error(`Invalid byte size range: "${value}". Expected a size or range like "1MB", "1MB-2MB", "-1MB", or "1MB-".`);
    }
    const minValue = parts[0];
    const maxValue = parts[1];
    if (minValue === undefined || maxValue === undefined) {
        throw new Error(`Invalid byte size range: "${value}"`);
    }
    const minText = minValue.trim();
    const maxText = maxValue.trim();
    if (minText === '' && maxText === '') {
        throw new Error(`Invalid byte size range: "${value}". At least one bound is required.`);
    }
    const min = minText === '' ? 0 : parseByteSize(minText);
    const max = maxText === '' ? undefined : parseByteSize(maxText);
    if (max !== undefined && min > max) {
        throw new Error(`Invalid byte size range: "${value}". The lower bound must not exceed the upper bound.`);
    }
    return { min, max };
}
export function byteSizeRangeSchema(description) {
    return zod
        .string()
        .transform((value, context) => {
        try {
            return parseByteSizeRange(value);
        }
        catch (error) {
            context.addIssue({
                code: zod.ZodIssueCode.custom,
                message: error instanceof Error ? error.message : 'Invalid byte size range',
            });
            return zod.NEVER;
        }
    })
        .describe(description);
}
//# sourceMappingURL=bytes.js.map