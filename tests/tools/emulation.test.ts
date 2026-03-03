/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {beforeEach, describe, it} from 'node:test';

import {emulate} from '../../src/tools/emulation.js';
import {
  geolocationTransform,
  viewportTransform,
} from '../../src/tools/ToolDefinition.js';
import {serverHooks} from '../server.js';
import {html, withMcpContext} from '../utils.js';

describe('emulation', () => {
  const server = serverHooks();

  describe('transforms', () => {
    describe('viewportTransform', () => {
      it('returns undefined for undefined input', () => {
        assert.strictEqual(viewportTransform(undefined), undefined);
      });

      it('parses basic dimensions', () => {
        assert.deepStrictEqual(viewportTransform('800x600'), {
          width: 800,
          height: 600,
          deviceScaleFactor: undefined,
          isMobile: false,
          isLandscape: false,
          hasTouch: false,
        });
      });

      it('parses dimensions with devicePixelRatio', () => {
        assert.deepStrictEqual(viewportTransform('1024x768x2'), {
          width: 1024,
          height: 768,
          deviceScaleFactor: 2,
          isMobile: false,
          isLandscape: false,
          hasTouch: false,
        });
      });

      it('parses mobile and touch tags', () => {
        assert.deepStrictEqual(viewportTransform('375x667x2,mobile,touch'), {
          width: 375,
          height: 667,
          deviceScaleFactor: 2,
          isMobile: true,
          hasTouch: true,
          isLandscape: false,
        });
      });

      it('parses landscape tag', () => {
        assert.deepStrictEqual(viewportTransform('1024x768x1,landscape'), {
          width: 1024,
          height: 768,
          deviceScaleFactor: 1,
          isMobile: false,
          hasTouch: false,
          isLandscape: true,
        });
      });
    });

    describe('geolocationTransform', () => {
      it('returns undefined for undefined input', () => {
        assert.strictEqual(geolocationTransform(undefined), undefined);
      });

      it('parses latitude and longitude', () => {
        assert.deepStrictEqual(geolocationTransform('48.137154x11.576124'), {
          latitude: 48.137154,
          longitude: 11.576124,
        });
      });
    });
  });

  describe('network', () => {
    it('emulates offline network conditions', async () => {
      await withMcpContext(async (response, context) => {
        await emulate.handler(
          {
            params: {
              networkConditions: 'Offline',
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        assert.strictEqual(
          context.getSelectedMcpPage().networkConditions,
          'Offline',
        );
      });
    });
    it('emulates network throttling when the throttling option is valid', async () => {
      await withMcpContext(async (response, context) => {
        await emulate.handler(
          {
            params: {
              networkConditions: 'Slow 3G',
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        assert.strictEqual(
          context.getSelectedMcpPage().networkConditions,
          'Slow 3G',
        );
      });
    });

    it('disables network emulation', async () => {
      await withMcpContext(async (response, context) => {
        await emulate.handler(
          {
            params: {},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        assert.strictEqual(
          context.getSelectedMcpPage().networkConditions,
          null,
        );
      });
    });

    it('does not set throttling when the network throttling is not one of the predefined options', async () => {
      await withMcpContext(async (response, context) => {
        await emulate.handler(
          {
            params: {
              networkConditions: 'Slow 11G',
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        assert.strictEqual(
          context.getSelectedMcpPage().networkConditions,
          null,
        );
      });
    });

    it('report correctly for the currently selected page', async () => {
      await withMcpContext(async (response, context) => {
        await emulate.handler(
          {
            params: {
              networkConditions: 'Slow 3G',
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        assert.strictEqual(
          context.getSelectedMcpPage().networkConditions,
          'Slow 3G',
        );

        const page = await context.newPage();
        context.selectPage(page);

        assert.strictEqual(
          context.getSelectedMcpPage().networkConditions,
          null,
        );
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
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        assert.strictEqual(context.getSelectedMcpPage().cpuThrottlingRate, 4);
      });
    });

    it('disables cpu throttling', async () => {
      await withMcpContext(async (response, context) => {
        await context.emulate({
          cpuThrottlingRate: 4,
        });
        await emulate.handler(
          {
            params: {
              cpuThrottlingRate: 1,
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        assert.strictEqual(context.getSelectedMcpPage().cpuThrottlingRate, 1);
      });
    });

    it('report correctly for the currently selected page', async () => {
      await withMcpContext(async (response, context) => {
        await emulate.handler(
          {
            params: {
              cpuThrottlingRate: 4,
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        assert.strictEqual(context.getSelectedMcpPage().cpuThrottlingRate, 4);

        const page = await context.newPage();
        context.selectPage(page);

        assert.strictEqual(context.getSelectedMcpPage().cpuThrottlingRate, 1);
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
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        const geolocation = context.getSelectedMcpPage().geolocation;
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
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        assert.notStrictEqual(context.getSelectedMcpPage().geolocation, null);

        // Then clear it by setting geolocation to null
        await emulate.handler(
          {
            params: {},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        assert.strictEqual(context.getSelectedMcpPage().geolocation, null);
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
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        const geolocation = context.getSelectedMcpPage().geolocation;
        assert.strictEqual(geolocation?.latitude, 48.137154);
        assert.strictEqual(geolocation?.longitude, 11.576124);

        const page = await context.newPage();
        context.selectPage(page);

        assert.strictEqual(context.getSelectedMcpPage().geolocation, null);
      });
    });
  });
  describe('viewport', () => {
    beforeEach(() => {
      server.addHtmlRoute('/viewport', html`Test page`);
    });

    it('emulates viewport', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPptrPage();
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
            page: context.getSelectedMcpPage(),
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
        const page = context.getSelectedPptrPage();
        // First set a viewport
        await emulate.handler(
          {
            params: {
              viewport: {
                width: 400,
                height: 400,
              },
            },
            page: context.getSelectedMcpPage(),
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
            params: {},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        assert.strictEqual(context.getSelectedMcpPage().viewport, null);

        // Somehow reset of the viewport seems to be async.
        await context.getSelectedPptrPage().waitForFunction(() => {
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
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        assert.ok(context.getSelectedMcpPage().viewport);

        const page = await context.newPage();
        context.selectPage(page);

        assert.strictEqual(context.getSelectedMcpPage().viewport, null);
        assert.ok(
          await context.getSelectedPptrPage().evaluate(() => {
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
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        assert.strictEqual(context.getSelectedMcpPage().userAgent, 'MyUA');
        const page = context.getSelectedPptrPage();
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
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        assert.strictEqual(context.getSelectedMcpPage().userAgent, 'UA1');

        await emulate.handler(
          {
            params: {
              userAgent: 'UA2',
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        assert.strictEqual(context.getSelectedMcpPage().userAgent, 'UA2');
        const page = context.getSelectedPptrPage();
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
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        assert.strictEqual(context.getSelectedMcpPage().userAgent, 'MyUA');

        await emulate.handler(
          {
            params: {},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        assert.strictEqual(context.getSelectedMcpPage().userAgent, null);
        const page = context.getSelectedPptrPage();
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
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        assert.strictEqual(context.getSelectedMcpPage().userAgent, 'MyUA');

        const page = await context.newPage();
        context.selectPage(page);

        assert.strictEqual(context.getSelectedMcpPage().userAgent, null);
        assert.ok(
          await context.getSelectedPptrPage().evaluate(() => {
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
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        assert.strictEqual(context.getSelectedMcpPage().colorScheme, 'dark');
        const page = context.getSelectedPptrPage();
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
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        assert.strictEqual(context.getSelectedMcpPage().colorScheme, 'dark');

        await emulate.handler(
          {
            params: {
              colorScheme: 'light',
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        assert.strictEqual(context.getSelectedMcpPage().colorScheme, 'light');
        const page = context.getSelectedPptrPage();
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
        const page = context.getSelectedPptrPage();

        const initial = await page.evaluate(
          () => window.matchMedia('(prefers-color-scheme: dark)').matches,
        );

        await emulate.handler(
          {
            params: {
              colorScheme: 'dark',
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );
        assert.strictEqual(context.getSelectedMcpPage().colorScheme, 'dark');
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
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        assert.strictEqual(context.getSelectedMcpPage().colorScheme, null);
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
