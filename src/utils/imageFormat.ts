/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Detects the actual image format from binary data by inspecting magic numbers.
 *
 * @param data - The image data as a Uint8Array or Buffer
 * @returns The detected MIME type ('image/png', 'image/jpeg', or 'image/webp')
 * @throws Error if the format cannot be detected
 */
export function detectImageFormat(
  data: Uint8Array | Buffer,
): 'image/png' | 'image/jpeg' | 'image/webp' {
  if (data.length < 12) {
    throw new Error('Image data too small to detect format');
  }

  // Check PNG: starts with 89 50 4E 47 (‰PNG)
  if (
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47
  ) {
    return 'image/png';
  }

  // Check JPEG: starts with FF D8 FF
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'image/jpeg';
  }

  // Check WebP: starts with "RIFF" and contains "WEBP" at offset 8
  if (
    data[0] === 0x52 && // R
    data[1] === 0x49 && // I
    data[2] === 0x46 && // F
    data[3] === 0x46 && // F
    data[8] === 0x57 && // W
    data[9] === 0x45 && // E
    data[10] === 0x42 && // B
    data[11] === 0x50 // P
  ) {
    return 'image/webp';
  }

  throw new Error(
    `Unable to detect image format. First bytes: ${Array.from(data.slice(0, 12))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ')}`,
  );
}
