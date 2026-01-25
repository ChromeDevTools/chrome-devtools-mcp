/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import sharp from 'sharp';

import {processImage} from '../../src/utils/image-processor.js';

// Create a valid test PNG using sharp (100x100 red square)
async function createTestPng(): Promise<Uint8Array> {
  const buffer = await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: {r: 255, g: 0, b: 0},
    },
  })
    .png()
    .toBuffer();
  return new Uint8Array(buffer);
}

// Cache the test image to avoid regenerating for each test
let testPngCache: Uint8Array | null = null;
async function getTestPng(): Promise<Uint8Array> {
  if (!testPngCache) {
    testPngCache = await createTestPng();
  }
  return testPngCache;
}

describe('image-processor', () => {
  describe('processImage', () => {
    it('returns original image when no options provided', async () => {
      const testPng = await getTestPng();
      const result = await processImage(testPng, 'image/png');

      assert.strictEqual(result.mimeType, 'image/png');
      assert.strictEqual(result.compressionRatio, 1.0);
      assert.strictEqual(result.originalSize.width, result.processedSize.width);
      assert.strictEqual(
        result.originalSize.height,
        result.processedSize.height,
      );
    });

    it('returns original image when empty options provided', async () => {
      const testPng = await getTestPng();
      const result = await processImage(testPng, 'image/png', {});

      assert.strictEqual(result.mimeType, 'image/png');
      assert.strictEqual(result.compressionRatio, 1.0);
    });

    it('respects maxWidth option', async () => {
      const testPng = await getTestPng();
      const result = await processImage(testPng, 'image/png', {maxWidth: 50});

      // 100x100 image resized to max 50 width
      assert.strictEqual(result.processedSize.width, 50);
      assert.strictEqual(result.processedSize.height, 50);
    });

    it('respects maxHeight option', async () => {
      const testPng = await getTestPng();
      const result = await processImage(testPng, 'image/png', {maxHeight: 50});

      // 100x100 image resized to max 50 height
      assert.strictEqual(result.processedSize.width, 50);
      assert.strictEqual(result.processedSize.height, 50);
    });

    it('converts format when specified', async () => {
      const testPng = await getTestPng();
      const result = await processImage(testPng, 'image/png', {format: 'jpeg'});

      assert.strictEqual(result.mimeType, 'image/jpeg');
    });

    it('applies quality setting for jpeg', async () => {
      const testPng = await getTestPng();
      const result = await processImage(testPng, 'image/png', {
        format: 'jpeg',
        quality: 50,
      });

      assert.strictEqual(result.mimeType, 'image/jpeg');
      assert.ok(result.data.length > 0);
    });

    it('applies quality setting for webp', async () => {
      const testPng = await getTestPng();
      const result = await processImage(testPng, 'image/png', {
        format: 'webp',
        quality: 80,
      });

      assert.strictEqual(result.mimeType, 'image/webp');
      assert.ok(result.data.length > 0);
    });

    it('returns metadata about processing', async () => {
      const testPng = await getTestPng();
      const result = await processImage(testPng, 'image/png', {maxWidth: 50});

      assert.ok('originalSize' in result);
      assert.ok('processedSize' in result);
      assert.ok('compressionRatio' in result);
      assert.strictEqual(result.originalSize.width, 100);
      assert.strictEqual(result.originalSize.height, 100);
      assert.strictEqual(result.processedSize.width, 50);
      assert.strictEqual(result.processedSize.height, 50);
    });

    it('calculates compression ratio correctly', async () => {
      const testPng = await getTestPng();
      const result = await processImage(testPng, 'image/png', {maxWidth: 50});

      // Resized image should be smaller
      assert.ok(result.compressionRatio < 1.0);
      assert.ok(result.data.length < testPng.length);
    });
  });
});
