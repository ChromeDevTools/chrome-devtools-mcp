/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {beforeEach, describe, it} from 'node:test';

import {emulate} from '../../src/tools/emulation.js';
import {serverHooks} from '../server.js';
import {html, withMcpContext} from '../utils.js';

describe('emulation', () => {
  const server = serverHooks();

  describe('network', () => {
    it('emulates offline network conditions', async () => {
      await withMcpContext(async (response, context) => {
        await emulate.handler(
          {
            params: {
              networkConditions: 'Offline',
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getNetworkConditions(), 'Offline');
      });
    });
    it('emulates network throttling when the throttling option is valid', async () => {
      await withMcpContext(async (response, context) => {
        await emulate.handler(
          {
            params: {
              networkConditions: 'Slow 3G',
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getNetworkConditions(), 'Slow 3G');
      });
    });

    it('disables network emulation', async () => {
      await withMcpContext(async (response, context) => {
        await emulate.handler(
          {
            params: {
              networkConditions: 'No emulation',
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getNetworkConditions(), null);
      });
    });

    it('does not set throttling when the network throttling is not one of the predefined options', async () => {
      await withMcpContext(async (response, context) => {
        await emulate.handler(
          {
            params: {
              networkConditions: 'Slow 11G',
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getNetworkConditions(), null);
      });
    });

    it('report correctly for the currently selected page', async () => {
      await withMcpContext(async (response, context) => {
        await emulate.handler(
          {
            params: {
              networkConditions: 'Slow 3G',
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getNetworkConditions(), 'Slow 3G');

        const page = await context.newPage();
        context.selectPage(page);

        assert.strictEqual(context.getNetworkConditions(), null);
      });
    });
  });

  describe('cpu', () => {
    it('emulates cpu throttling when the rate is valid (1-20x)', async () => {
      await withMcpContext(async (response, context) => {
        await emulate.handler(
          {
            params: {
              cpuThrottlingRate: 4,
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getCpuThrottlingRate(), 4);
      });
    });

    it('disables cpu throttling', async () => {
      await withMcpContext(async (response, context) => {
        context.setCpuThrottlingRate(4); // Set it to something first.
        await emulate.handler(
          {
            params: {
              cpuThrottlingRate: 1,
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getCpuThrottlingRate(), 1);
      });
    });

    it('report correctly for the currently selected page', async () => {
      await withMcpContext(async (response, context) => {
        await emulate.handler(
          {
            params: {
              cpuThrottlingRate: 4,
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getCpuThrottlingRate(), 4);

        const page = await context.newPage();
        context.selectPage(page);

        assert.strictEqual(context.getCpuThrottlingRate(), 1);
      });
    });
  });

  describe('geolocation', () => {
    it('emulates geolocation with latitude and longitude', async () => {
      await withMcpContext(async (response, context) => {
        await emulate.handler(
          {
            params: {
              geolocation: {
                latitude: 48.137154,
                longitude: 11.576124,
              },
            },
          },
          response,
          context,
        );

        const geolocation = context.getGeolocation();
        assert.strictEqual(geolocation?.latitude, 48.137154);
        assert.strictEqual(geolocation?.longitude, 11.576124);
      });
    });

    it('clears geolocation override when geolocation is set to null', async () => {
      await withMcpContext(async (response, context) => {
        // First set a geolocation
        await emulate.handler(
          {
            params: {
              geolocation: {
                latitude: 48.137154,
                longitude: 11.576124,
              },
            },
          },
          response,
          context,
        );

        assert.notStrictEqual(context.getGeolocation(), null);

        // Then clear it by setting geolocation to null
        await emulate.handler(
          {
            params: {
              geolocation: null,
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getGeolocation(), null);
      });
    });

    it('reports correctly for the currently selected page', async () => {
      await withMcpContext(async (response, context) => {
        await emulate.handler(
          {
            params: {
              geolocation: {
                latitude: 48.137154,
                longitude: 11.576124,
              },
            },
          },
          response,
          context,
        );

        const geolocation = context.getGeolocation();
        assert.strictEqual(geolocation?.latitude, 48.137154);
        assert.strictEqual(geolocation?.longitude, 11.576124);

        const page = await context.newPage();
        context.selectPage(page);

        assert.strictEqual(context.getGeolocation(), null);
      });
    });
  });
  describe('viewport', () => {
    beforeEach(() => {
      server.addHtmlRoute('/viewport', html`Test page`);
    });

    it('emulates viewport', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.goto(server.baseUrl + '/viewport');
        await emulate.handler(
          {
            params: {
              viewport: {
                width: 400,
                height: 400,
                deviceScaleFactor: 2,
                isMobile: true,
                hasTouch: true,
                isLandscape: false,
              },
            },
          },
          response,
          context,
        );

        const viewportData = await page.evaluate(() => {
          return {
            width: window.innerWidth,
            height: window.innerHeight,
            deviceScaleFactor: window.devicePixelRatio,
            hasTouch: navigator.maxTouchPoints > 0,
          };
        });

        assert.deepStrictEqual(viewportData, {
          width: 400,
          height: 400,
          deviceScaleFactor: 2,
          hasTouch: true,
        });
      });
    });

    it('clears viewport override when viewport is set to null', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        // First set a viewport
        await emulate.handler(
          {
            params: {
              viewport: {
                width: 400,
                height: 400,
              },
            },
          },
          response,
          context,
        );

        const viewportData = await page.evaluate(() => {
          return {
            width: window.innerWidth,
            height: window.innerHeight,
          };
        });

        assert.deepStrictEqual(viewportData, {
          width: 400,
          height: 400,
        });

        // Then clear it by setting viewport to null
        await emulate.handler(
          {
            params: {
              viewport: null,
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getViewport(), null);

        // Somehow reset of the viewport seems to be async.
        await context.getSelectedPage().waitForFunction(() => {
          return window.innerWidth !== 400 && window.innerHeight !== 400;
        });
      });
    });

    it('reports correctly for the currently selected page', async () => {
      await withMcpContext(async (response, context) => {
        await emulate.handler(
          {
            params: {
              viewport: {
                width: 400,
                height: 400,
              },
            },
          },
          response,
          context,
        );

        assert.ok(context.getViewport());

        const page = await context.newPage();
        context.selectPage(page);

        assert.strictEqual(context.getViewport(), null);
        assert.ok(
          await context.getSelectedPage().evaluate(() => {
            return window.innerWidth !== 400 && window.innerHeight !== 400;
          }),
        );
      });
    });
  });

  describe('userAgent', () => {
    it('emulates userAgent', async () => {
      await withMcpContext(async (response, context) => {
        await emulate.handler(
          {
            params: {
              userAgent: 'MyUA',
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getUserAgent(), 'MyUA');
        const page = context.getSelectedPage();
        const ua = await page.evaluate(() => navigator.userAgent);
        assert.strictEqual(ua, 'MyUA');
      });
    });

    it('updates userAgent', async () => {
      await withMcpContext(async (response, context) => {
        await emulate.handler(
          {
            params: {
              userAgent: 'UA1',
            },
          },
          response,
          context,
        );
        assert.strictEqual(context.getUserAgent(), 'UA1');

        await emulate.handler(
          {
            params: {
              userAgent: 'UA2',
            },
          },
          response,
          context,
        );
        assert.strictEqual(context.getUserAgent(), 'UA2');
        const page = context.getSelectedPage();
        const ua = await page.evaluate(() => navigator.userAgent);
        assert.strictEqual(ua, 'UA2');
      });
    });

    it('clears userAgent override when userAgent is set to null', async () => {
      await withMcpContext(async (response, context) => {
        await emulate.handler(
          {
            params: {
              userAgent: 'MyUA',
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getUserAgent(), 'MyUA');

        await emulate.handler(
          {
            params: {
              userAgent: null,
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getUserAgent(), null);
        const page = context.getSelectedPage();
        const ua = await page.evaluate(() => navigator.userAgent);
        assert.notStrictEqual(ua, 'MyUA');
        assert.ok(ua.length > 0);
      });
    });

    it('reports correctly for the currently selected page', async () => {
      await withMcpContext(async (response, context) => {
        await emulate.handler(
          {
            params: {
              userAgent: 'MyUA',
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getUserAgent(), 'MyUA');

        const page = await context.newPage();
        context.selectPage(page);

        assert.strictEqual(context.getUserAgent(), null);
        assert.ok(
          await context.getSelectedPage().evaluate(() => {
            return navigator.userAgent !== 'MyUA';
          }),
        );
      });
    });
  });

  describe('colorScheme', () => {
    it('emulates color scheme', async () => {
      await withMcpContext(async (response, context) => {
        await emulate.handler(
          {
            params: {
              colorScheme: 'dark',
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getColorScheme(), 'dark');
        const page = context.getSelectedPage();
        const scheme = await page.evaluate(() =>
          window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light',
        );
        assert.strictEqual(scheme, 'dark');
      });
    });

    it('updates color scheme', async () => {
      await withMcpContext(async (response, context) => {
        await emulate.handler(
          {
            params: {
              colorScheme: 'dark',
            },
          },
          response,
          context,
        );
        assert.strictEqual(context.getColorScheme(), 'dark');

        await emulate.handler(
          {
            params: {
              colorScheme: 'light',
            },
          },
          response,
          context,
        );
        assert.strictEqual(context.getColorScheme(), 'light');
        const page = context.getSelectedPage();
        const scheme = await page.evaluate(() =>
          window.matchMedia('(prefers-color-scheme: light)').matches
            ? 'light'
            : 'dark',
        );
        assert.strictEqual(scheme, 'light');
      });
    });

    it('resets color scheme when set to auto', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();

        const initial = await page.evaluate(
          () => window.matchMedia('(prefers-color-scheme: dark)').matches,
        );

        await emulate.handler(
          {
            params: {
              colorScheme: 'dark',
            },
          },
          response,
          context,
        );
        assert.strictEqual(context.getColorScheme(), 'dark');
        // Check manually that it is dark

        assert.strictEqual(
          await page.evaluate(
            () => window.matchMedia('(prefers-color-scheme: dark)').matches,
          ),
          true,
        );

        await emulate.handler(
          {
            params: {
              colorScheme: 'auto',
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getColorScheme(), null);
        assert.strictEqual(
          await page.evaluate(
            () => window.matchMedia('(prefers-color-scheme: dark)').matches,
          ),
          initial,
        );
      });
    });
  });
});
