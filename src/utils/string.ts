/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Converts a given string to snake_case.
 * This function handles camelCase, PascalCase, and acronyms, including transitions between letters and numbers.
 * It uses Unicode-aware regular expressions (`\p{L}`, `\p{N}`, `\p{Lu}`, `\p{Ll}` with the `u` flag)
 * to correctly process letters and numbers from various languages.
 *
 * @param text The input string to convert to snake_case.
 * @returns The snake_case version of the input string.
 */
export function toSnakeCase(text: string): string {
  if (!text) {
    return '';
  }
  // First, handle case-based transformations to insert underscores correctly.
  // 1. Add underscore between a letter and a number.
  //    e.g., "version2" -> "version_2"
  // 2. Add underscore between an uppercase letter sequence and a following uppercase+lowercase sequence.
  //    e.g., "APIFlags" -> "API_Flags"
  // 3. Add underscore between a lowercase/number and an uppercase letter.
  //    e.g., "lastName" -> "last_Name", "version_2Update" -> "version_2_Update"
  // 4. Replace sequences of non-alphanumeric with a single underscore
  // 5. Remove any leading or trailing underscores.
  const result = text
    .replace(/(\p{L})(\p{N})/gu, '$1_$2') // 1
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1_$2') // 2
    .replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, '$1_$2') // 3
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_') // 4
    .replace(/^_|_$/g, ''); // 5

  return result;
}
