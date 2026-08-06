/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  viewportTransform,
  geolocationTransform,
} from '../../src/tools/ToolDefinition.js';

describe('viewportTransform', () => {
  it('returns undefined for empty input', () => {
    assert.strictEqual(viewportTransform(undefined), undefined);
  });

  it('parses simple widthxheight', () => {
    const v = viewportTransform('800x600');
    assert.strictEqual(v?.width, 800);
    assert.strictEqual(v?.height, 600);
    assert.strictEqual(v?.isMobile, false);
    assert.strictEqual(v?.hasTouch, false);
    assert.strictEqual(v?.isLandscape, false);
  });

  it('parses tags like mobile, touch and landscape', () => {
    const v = viewportTransform('375x812,mobile,touch,landscape');
    assert.strictEqual(v?.width, 375);
    assert.strictEqual(v?.height, 812);
    assert.strictEqual(v?.isMobile, true);
    assert.strictEqual(v?.hasTouch, true);
    assert.strictEqual(v?.isLandscape, true);
  });
});

describe('geolocationTransform', () => {
  it('returns undefined for empty input', () => {
    assert.strictEqual(geolocationTransform(undefined), undefined);
  });

  it('parses latitude and longitude', () => {
    const g = geolocationTransform('59.3293,18.0686');
    assert.ok(g);
    assert.strictEqual(Number(g.latitude.toFixed(4)), 59.3293);
    assert.strictEqual(Number(g.longitude.toFixed(4)), 18.0686);
  });
});
