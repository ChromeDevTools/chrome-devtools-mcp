/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {describe, it} from 'node:test';
import assert from 'node:assert';
import {CapabilityManager} from '../../src/capabilities/CapabilityManager.js';

describe('CapabilityManager', () => {
  it('defaults to legacy enabled behavior when metaFeatureSystem is false', () => {
    const manager = new CapabilityManager({metaFeatureSystem: false});
    assert.strictEqual(manager.getPackPolicy('performance'), 'enabled');
    assert.strictEqual(manager.isToolActive('performance_start_trace'), true);
  });

  it('respects metaFeatureSystem to slim the core startup', () => {
    const manager = new CapabilityManager({metaFeatureSystem: true});
    assert.strictEqual(manager.getPackPolicy('core'), 'enabled');
    assert.strictEqual(manager.getPackPolicy('performance'), 'on-demand');
    assert.strictEqual(manager.isToolActive('performance_start_trace'), false);

    // Enable pack
    const res = manager.enablePack('performance');
    assert.strictEqual(res.success, true);
    assert.strictEqual(manager.isToolActive('performance_start_trace'), true);
  });

  it('enforces locked policy and per-tool overrides', () => {
    const manager = new CapabilityManager({
      metaFeatureSystem: true,
      packPolicy: 'performance=locked',
      toolPolicy: 'take_heapsnapshot=enabled',
    });

    assert.strictEqual(manager.getPackPolicy('performance'), 'locked');
    assert.strictEqual(manager.isToolActive('performance_start_trace'), false);
    const res = manager.enablePack('performance');
    assert.strictEqual(res.success, false);

    assert.strictEqual(manager.getToolPolicy('take_heapsnapshot'), 'enabled');
    assert.strictEqual(manager.isToolActive('take_heapsnapshot'), true);
  });

  it('supports on-demand tool policy for core tools and reconfigure', () => {
    const manager = new CapabilityManager({
      metaFeatureSystem: true,
      toolPolicy: 'click=on-demand',
    });

    assert.strictEqual(manager.getToolPolicy('click'), 'on-demand');
    assert.strictEqual(manager.isToolActive('click'), false);
    assert.strictEqual(manager.isToolActive('navigate_page'), true);

    const res = manager.enablePack('core');
    assert.strictEqual(res.success, true);
    assert.strictEqual(manager.isToolActive('click'), true);

    manager.reconfigure({
      metaFeatureSystem: false,
      toolPolicy: 'navigate_page=locked',
    });
    assert.strictEqual(manager.isToolActive('navigate_page'), false);
    assert.strictEqual(manager.isToolActive('click'), true);
  });
});
