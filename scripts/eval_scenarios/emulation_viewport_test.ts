/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import {KnownDevices} from 'puppeteer';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt: 'Emulate iPhone 14 viewport',
  maxTurns: 2,
  expectations: calls => {
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].name, 'emulate');
    assert.deepStrictEqual(
      {
        ...(calls[0].args.viewport as object),
        // models might not send defaults.
        isLandscape: KnownDevices['iPhone 14'].viewport.isLandscape ?? false,
      },
      {
        ...KnownDevices['iPhone 14'].viewport,
        height: 844, // Puppeteer is wrong about the expected height.
      },
    );
  },
};
