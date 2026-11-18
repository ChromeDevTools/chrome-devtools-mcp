/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Parses the text of a JSON file.
 *
 * Strips a leading UTF-8 byte order mark (U+FEFF) first. Windows PowerShell 5.1
 * writes one by default, and JSON.parse rejects it.
 *
 * When `errorMessage` is given, it replaces the parser's own message in the
 * thrown error. Use it for files that can hold secrets, because a SyntaxError
 * can quote part of the input. The original error is kept out of the result.
 */
export function parseJsonFile(content: string, errorMessage?: string): unknown {
  try {
    return JSON.parse(content.replace(/^\uFEFF/, ''));
  } catch (error) {
    if (errorMessage === undefined) {
      throw error;
    }
    // Deliberately no `{cause: error}`. A JSON.parse SyntaxError quotes part of
    // the input, and Node prints `[cause]` whenever the error is logged or
    // inspected, so keeping it would leak the file contents we are hiding.
    throw new Error(errorMessage);
  }
}
