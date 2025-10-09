/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  emulateCpu,
  emulateDeviceProfile,
  emulateNetwork,
} from '../../src/tools/emulation.js';
import {withBrowser} from '../utils.js';

describe('emulation', () => {
  describe('network', () => {
    it('emulates network throttling when the throttling option is valid ', async () => {
      await withBrowser(async (response, context) => {
        await emulateNetwork.handler(
          {
            params: {
              throttlingOption: 'Slow 3G',
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getNetworkConditions(), 'Slow 3G');
      });
    });

    it('disables network emulation', async () => {
      await withBrowser(async (response, context) => {
        await emulateNetwork.handler(
          {
            params: {
              throttlingOption: 'No emulation',
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getNetworkConditions(), null);
      });
    });

    it('does not set throttling when the network throttling is not one of the predefined options', async () => {
      await withBrowser(async (response, context) => {
        await emulateNetwork.handler(
          {
            params: {
              throttlingOption: 'Slow 11G',
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getNetworkConditions(), null);
      });
    });

    it('report correctly for the currently selected page', async () => {
      await withBrowser(async (response, context) => {
        await context.newPage();
        await emulateNetwork.handler(
          {
            params: {
              throttlingOption: 'Slow 3G',
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getNetworkConditions(), 'Slow 3G');

        context.setSelectedPageIdx(0);

        assert.strictEqual(context.getNetworkConditions(), null);
      });
    });
  });

  describe('cpu', () => {
    it('emulates cpu throttling when the rate is valid (1-20x)', async () => {
      await withBrowser(async (response, context) => {
        await emulateCpu.handler(
          {
            params: {
              throttlingRate: 4,
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getCpuThrottlingRate(), 4);
      });
    });

    it('disables cpu throttling', async () => {
      await withBrowser(async (response, context) => {
        context.setCpuThrottlingRate(4); // Set it to something first.
        await emulateCpu.handler(
          {
            params: {
              throttlingRate: 1,
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getCpuThrottlingRate(), 1);
      });
    });

    it('report correctly for the currently selected page', async () => {
      await withBrowser(async (response, context) => {
        await context.newPage();
        await emulateCpu.handler(
          {
            params: {
              throttlingRate: 4,
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getCpuThrottlingRate(), 4);

        context.setSelectedPageIdx(0);

        assert.strictEqual(context.getCpuThrottlingRate(), 1);
      });
    });
  });

  describe('device profile', () => {
    it('applies iPhone 12 Pro preset', async () => {
      await withBrowser(async (response, context) => {
        await emulateDeviceProfile.handler(
          {
            params: {
              profile: 'iPhone-12-Pro',
            },
          },
          response,
          context,
        );

        const page = context.getSelectedPage();
        const result = await page.evaluate(() => {
          return {
            screenWidth: window.screen.width,
            screenHeight: window.screen.height,
            devicePixelRatio: window.devicePixelRatio,
            userAgent: navigator.userAgent,
            language: navigator.language,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            maxTouchPoints: navigator.maxTouchPoints,
          };
        });

        const viewport = page.viewport();

        assert.strictEqual(result.screenWidth, 390);
        assert.strictEqual(result.screenHeight, 844);
        assert.strictEqual(result.devicePixelRatio, 3);
        assert.ok(result.userAgent.includes('iPhone'));
        assert.strictEqual(result.language, 'en-US');
        assert.strictEqual(result.timeZone, 'America/Los_Angeles');
        assert.strictEqual(result.maxTouchPoints, 5);
        assert.deepStrictEqual(viewport, {
          width: 390,
          height: 844,
          deviceScaleFactor: 3,
          isMobile: true,
          hasTouch: true,
          isLandscape: false,
        });
        assert.deepStrictEqual(response.responseLines, [
          'Applied device profile "iPhone-12-Pro" to the selected page.',
        ]);
      });
    });

    it('applies Pixel 7 preset', async () => {
      await withBrowser(async (response, context) => {
        await emulateDeviceProfile.handler(
          {
            params: {
              profile: 'Pixel-7',
            },
          },
          response,
          context,
        );

        const page = context.getSelectedPage();
        const result = await page.evaluate(() => {
          return {
            screenWidth: window.screen.width,
            screenHeight: window.screen.height,
            devicePixelRatio: window.devicePixelRatio,
            userAgent: navigator.userAgent,
            maxTouchPoints: navigator.maxTouchPoints,
          };
        });

        assert.strictEqual(result.screenWidth, 412);
        assert.strictEqual(result.screenHeight, 915);
        assert.strictEqual(result.devicePixelRatio, 2.625);
        assert.ok(result.userAgent.includes('Android'));
        assert.strictEqual(result.maxTouchPoints, 5);
        assert.deepStrictEqual(response.responseLines, [
          'Applied device profile "Pixel-7" to the selected page.',
        ]);
      });
    });
  });
});
