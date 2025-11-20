/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {describe, it} from 'node:test';

import {detectImageFormat} from '../../src/utils/imageFormat.js';

describe('imageFormat', () => {
  describe('detectImageFormat', () => {
    it('detects PNG format', () => {
      // PNG magic number: 89 50 4E 47 0D 0A 1A 0A
      const pngData = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      ]);
      const format = detectImageFormat(pngData);
      assert.equal(format, 'image/png');
    });

    it('detects JPEG format', () => {
      // JPEG magic number: FF D8 FF
      const jpegData = new Uint8Array([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      ]);
      const format = detectImageFormat(jpegData);
      assert.equal(format, 'image/jpeg');
    });

    it('detects WebP format', () => {
      // WebP magic number: RIFF ... WEBP
      const webpData = new Uint8Array([
        0x52,
        0x49,
        0x46,
        0x46, // RIFF
        0x00,
        0x00,
        0x00,
        0x00, // file size (placeholder)
        0x57,
        0x45,
        0x42,
        0x50, // WEBP
      ]);
      const format = detectImageFormat(webpData);
      assert.equal(format, 'image/webp');
    });

    it('throws error for data that is too small', () => {
      const smallData = new Uint8Array([0x89, 0x50]);
      assert.throws(
        () => detectImageFormat(smallData),
        /Image data too small to detect format/,
      );
    });

    it('throws error for unknown format', () => {
      const unknownData = new Uint8Array([
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ]);
      assert.throws(
        () => detectImageFormat(unknownData),
        /Unable to detect image format/,
      );
    });

    it('works with Buffer objects', () => {
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      ]);
      const format = detectImageFormat(pngBuffer);
      assert.equal(format, 'image/png');
    });
  });
});
