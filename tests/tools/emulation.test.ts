/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import type {IncomingHttpHeaders} from 'node:http';
import {beforeEach, describe, it, mock} from 'node:test';

import sinon from 'sinon';

import {emulate} from '../../src/tools/emulation.js';
import {
  geolocationTransform,
  viewportTransform,
} from '../../src/tools/ToolDefinition.js';
import {serverHooks} from '../server.js';
import {createHandlerMocks} from '../mocks.js';
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

      it('throws on non-numeric dimensions', () => {
        assert.throws(() => viewportTransform('abc'));
      });

      it('throws when width is not positive', () => {
        assert.throws(() => viewportTransform('0x600'));
      });

      it('throws when height is not positive', () => {
        assert.throws(() => viewportTransform('800x0'));
      });

      it('throws when devicePixelRatio is not positive', () => {
        assert.throws(() => viewportTransform('1024x768x0'));
      });

      it('throws when height is missing', () => {
        assert.throws(() => viewportTransform('800'));
      });
    });

    describe('geolocationTransform', () => {
      it('returns undefined for undefined input', () => {
        assert.strictEqual(geolocationTransform(undefined), undefined);
      });

      it('parses latitude and longitude', () => {
        assert.deepStrictEqual(geolocationTransform('48.137154,11.576124'), {
          latitude: 48.137154,
          longitude: 11.576124,
        });
      });

      it('throws when latitude is out of range', () => {
        assert.throws(() => geolocationTransform('999,999'));
      });

      it('throws when longitude is out of range', () => {
        assert.throws(() => geolocationTransform('48.1,999'));
      });

      it('throws on non-numeric input', () => {
        assert.throws(() => geolocationTransform('abc,def'));
      });

      it('throws when longitude is missing', () => {
        assert.throws(() => geolocationTransform('48.1'));
      });
    });
  });

  describe('network', () => {
    it('emulates offline network conditions', async () => {
      const {page, context, response} = createHandlerMocks();
      await emulate.handler(
        {params: {networkConditions: 'Offline'}, page},
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.emulate, {
        networkConditions: 'Offline',
      });
    });

    it('emulates network throttling when the throttling option is valid', async () => {
      const {page, context, response} = createHandlerMocks();
      await emulate.handler(
        {params: {networkConditions: 'Slow 3G'}, page},
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.emulate, {
        networkConditions: 'Slow 3G',
      });
    });

    it('disables network emulation when networkConditions is omitted', async () => {
      const {page, context, response} = createHandlerMocks();
      await emulate.handler({params: {}, page}, response, context);
      sinon.assert.calledOnceWithExactly(page.emulate, {});
    });

    it('does not set throttling when the network throttling is not one of the predefined options', async () => {
      await withMcpContext(async (response, context) => {
        await emulate.handler(
          {
            params: {networkConditions: 'Slow 11G'},
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
      const {page, context, response} = createHandlerMocks();
      await emulate.handler(
        {params: {networkConditions: 'Slow 3G'}, page},
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.emulate, {
        networkConditions: 'Slow 3G',
      });
    });
  });

  describe('cpu', () => {
    it('emulates cpu throttling when the rate is valid (1-20x)', async () => {
      const {page, context, response} = createHandlerMocks();
      await emulate.handler(
        {params: {cpuThrottlingRate: 4}, page},
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.emulate, {cpuThrottlingRate: 4});
    });

    it('applies cpu throttling to secondary session', async () => {
      await withMcpContext(async (response, context) => {
        const mcpPage = context.getSelectedMcpPage();
        const universe = mcpPage.devtoolsUniverse;
        assert.ok(universe);

        const sendSpy = mock.method(universe.session, 'send');

        await emulate.handler(
          {
            params: {
              cpuThrottlingRate: 4,
            },
            page: mcpPage,
          },
          response,
          context,
        );

        assert.ok(sendSpy.mock.calls.length > 0);
        const cpuCall = sendSpy.mock.calls.find(
          call => call.arguments[0] === 'Emulation.setCPUThrottlingRate',
        );
        assert.ok(cpuCall);
        assert.deepStrictEqual(cpuCall.arguments[1], {rate: 4});

        sendSpy.mock.restore();
      });
    });

    it('disables cpu throttling when rate is 1', async () => {
      const {page, context, response} = createHandlerMocks();
      await emulate.handler(
        {params: {cpuThrottlingRate: 1}, page},
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.emulate, {cpuThrottlingRate: 1});
    });

    it('report correctly for the currently selected page', async () => {
      const {page, context, response} = createHandlerMocks();
      await emulate.handler(
        {params: {cpuThrottlingRate: 4}, page},
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.emulate, {cpuThrottlingRate: 4});
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
        const page = context.getSelectedMcpPage().pptrPage;
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
        const page = context.getSelectedMcpPage().pptrPage;
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
        await context.getSelectedMcpPage().pptrPage.waitForFunction(() => {
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
          await context.getSelectedMcpPage().pptrPage.evaluate(() => {
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
        const page = context.getSelectedMcpPage().pptrPage;
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
        const page = context.getSelectedMcpPage().pptrPage;
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
        const page = context.getSelectedMcpPage().pptrPage;
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
          await context.getSelectedMcpPage().pptrPage.evaluate(() => {
            return navigator.userAgent !== 'MyUA';
          }),
        );
      });
    });
  });

  describe('extraHttpHeaders', () => {
    it('sets extra headers on requests', async () => {
      let receivedHeaders: IncomingHttpHeaders = {};
      server.addRoute('/headers-test', async (req, res) => {
        receivedHeaders = req.headers;
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end('<main>Headers Test</main>');
      });

      await withMcpContext(async (response, context) => {
        const page = context.getSelectedMcpPage().pptrPage;
        await emulate.handler(
          {
            params: {
              extraHttpHeaders: {'X-Custom-Header': 'test-value'},
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        await page.goto(server.getRoute('/headers-test'));
        assert.strictEqual(receivedHeaders['x-custom-header'], 'test-value');
      });
    });

    it('clears extra headers when null is passed', async () => {
      let receivedHeaders: IncomingHttpHeaders = {};
      server.addRoute('/headers-clear', async (req, res) => {
        receivedHeaders = req.headers;
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end('<main>Headers Clear</main>');
      });

      await withMcpContext(async (response, context) => {
        const page = context.getSelectedMcpPage().pptrPage;
        // Set headers first
        await emulate.handler(
          {
            params: {
              extraHttpHeaders: {'X-To-Clear': 'value'},
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        // Clear headers
        await emulate.handler(
          {
            params: {
              extraHttpHeaders: {},
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        await page.goto(server.getRoute('/headers-clear'));
        assert.strictEqual(receivedHeaders['x-to-clear'], undefined);
        assert.strictEqual(
          context.getSelectedMcpPage().emulationSettings.extraHttpHeaders,
          undefined,
        );
      });
    });

    it('headers persist across navigations', async () => {
      const receivedHeaders: IncomingHttpHeaders[] = [];
      server.addRoute('/persist-one', async (req, res) => {
        receivedHeaders.push({...req.headers});
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end('<main>Page One</main>');
      });
      server.addRoute('/persist-two', async (req, res) => {
        receivedHeaders.push({...req.headers});
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end('<main>Page Two</main>');
      });

      await withMcpContext(async (response, context) => {
        const page = context.getSelectedMcpPage().pptrPage;
        await emulate.handler(
          {
            params: {
              extraHttpHeaders: {'X-Persist': 'yes'},
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        await page.goto(server.getRoute('/persist-one'));
        await page.goto(server.getRoute('/persist-two'));

        assert.strictEqual(receivedHeaders[0]?.['x-persist'], 'yes');
        assert.strictEqual(receivedHeaders[1]?.['x-persist'], 'yes');
      });
    });

    it('does not affect other emulation settings', async () => {
      await withMcpContext(async (response, context) => {
        // Set userAgent first
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

        // Set extraHTTPHeaders separately
        await emulate.handler(
          {
            params: {
              extraHttpHeaders: {'X-Test': 'value'},
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        const settings = context.getSelectedMcpPage().emulationSettings;
        assert.deepStrictEqual(settings.extraHttpHeaders, {
          'X-Test': 'value',
        });
      });
    });

    it('reports correctly for the currently selected page', async () => {
      await withMcpContext(async (response, context) => {
        await emulate.handler(
          {
            params: {
              extraHttpHeaders: {'X-Page': 'one'},
            },
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        assert.deepStrictEqual(
          context.getSelectedMcpPage().emulationSettings.extraHttpHeaders,
          {'X-Page': 'one'},
        );

        const page = await context.newPage();
        context.selectPage(page);

        assert.strictEqual(
          context.getSelectedMcpPage().emulationSettings.extraHttpHeaders,
          undefined,
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
        const page = context.getSelectedMcpPage().pptrPage;
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
        const page = context.getSelectedMcpPage().pptrPage;
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
        const page = context.getSelectedMcpPage().pptrPage;

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
