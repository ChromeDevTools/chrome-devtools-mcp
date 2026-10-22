/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { zod } from '../third_party/index.js';
/**
 * Parses a byte size string (e.g. "1M", "1MB", "500KB", "1.5GB", "1024") into bytes.
 */
export declare function parseByteSize(value: string): number;
export interface ByteSizeRange {
    min: number;
    max?: number;
}
/**
 * Parses an inclusive byte-size range (e.g. "1MB", "1MB-2MB", "-1MB", "1MB-").
 */
export declare function parseByteSizeRange(value: string): ByteSizeRange;
export declare function byteSizeRangeSchema(description: string): zod.ZodType<ByteSizeRange>;
