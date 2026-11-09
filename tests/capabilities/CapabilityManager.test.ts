/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {CapabilityManager} from '../../src/capabilities/CapabilityManager.js';
import {DOMAIN_PACKS} from '../../src/capabilities/DomainPacks.js';

describe('CapabilityManager', () => {
  it('defines all 10 domain packs including debugger and webauthn', () => {
    const packIds = DOMAIN_PACKS.map(p => p.id);
    assert.deepStrictEqual(packIds, [
      'core',
      'memory',
      'performance',
      'audits',
      'debugger',
      'webauthn',
      'screencast',
      'extensions',
      'pwa',
      'webmcp',
    ]);
  });

  it('defaults to legacy enabled behavior when metaFeatureSystem is false', () => {
    const manager = new CapabilityManager({metaFeatureSystem: false});
    assert.strictEqual(manager.getPackPolicy('performance'), 'enabled');
    assert.strictEqual(manager.isToolActive('performance_start_trace'), true);
    assert.strictEqual(manager.isToolActive('set_logpoints'), true);
    assert.strictEqual(manager.isToolActive('configure_webauthn'), true);
  });

  it('respects metaFeatureSystem to slim the core startup', () => {
    const manager = new CapabilityManager({metaFeatureSystem: true});
    assert.strictEqual(manager.getPackPolicy('core'), 'enabled');
    assert.strictEqual(manager.getPackPolicy('performance'), 'on-demand');
    assert.strictEqual(manager.getPackPolicy('debugger'), 'on-demand');
    assert.strictEqual(manager.getPackPolicy('webauthn'), 'on-demand');
    assert.strictEqual(manager.getPackPolicy('extensions'), 'locked');
    assert.strictEqual(manager.isToolActive('performance_start_trace'), false);
    assert.strictEqual(manager.isToolActive('set_logpoints'), false);
    assert.strictEqual(manager.isToolActive('configure_webauthn'), false);

    // Enable packs
    const resPerf = manager.enablePack('performance');
    assert.strictEqual(resPerf.success, true);
    assert.strictEqual(manager.isToolActive('performance_start_trace'), true);

    const resDebug = manager.enablePack('debugger');
    assert.strictEqual(resDebug.success, true);
    assert.strictEqual(manager.isToolActive('set_logpoints'), true);

    const resWebAuthn = manager.enablePack('webauthn');
    assert.strictEqual(resWebAuthn.success, true);
    assert.strictEqual(manager.isToolActive('configure_webauthn'), true);
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
