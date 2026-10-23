/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Reads a gzipped JSON file, decompresses it, parses the JSON,
 * and returns a Uint8Array buffer of the parsed data.
 * @param filePath The path to the .json.gz file.
 * @returns A Uint8Array containing the stringified JSON data.
 */
export declare function loadTraceAsBuffer(filePath: string): Uint8Array;
