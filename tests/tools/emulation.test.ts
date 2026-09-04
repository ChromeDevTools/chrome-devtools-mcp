/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {emulate} from '../../src/tools/emulation.js';
import {
  geolocationTransform,
  viewportTransform,
} from '../../src/tools/ToolDefinition.js';
import {createHandlerMocks} from '../mocks.js';

describe('emulation', () => {
  afterEach(() => {
    sinon.restore();
  });

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
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Emulation configured successfully',
      );
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
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Emulation configured successfully',
      );
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
      const {page, context, response} = createHandlerMocks();
      await emulate.handler(
        {
          params: {
            geolocation: {
              latitude: 48.137154,
              longitude: 11.576124,
            },
          },
          page,
        },
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.emulate, {
        geolocation: {
          latitude: 48.137154,
          longitude: 11.576124,
        },
      });
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Emulation configured successfully',
      );
    });

    it('clears geolocation override when geolocation is omitted', async () => {
      const {page, context, response} = createHandlerMocks();
      await emulate.handler(
        {
          params: {},
          page,
        },
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.emulate, {});
    });

    it('reports correctly for the currently selected page', async () => {
      const {page, context, response} = createHandlerMocks();
      await emulate.handler(
        {
          params: {
            geolocation: {
              latitude: 48.137154,
              longitude: 11.576124,
            },
          },
          page,
        },
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.emulate, {
        geolocation: {
          latitude: 48.137154,
          longitude: 11.576124,
        },
      });
    });
  });

  describe('viewport', () => {
    it('emulates viewport', async () => {
      const {page, context, response} = createHandlerMocks();
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
          page,
        },
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.emulate, {
        viewport: {
          width: 400,
          height: 400,
          deviceScaleFactor: 2,
          isMobile: true,
          hasTouch: true,
          isLandscape: false,
        },
      });
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Emulation configured successfully',
      );
    });

    it('clears viewport override when viewport is omitted', async () => {
      const {page, context, response} = createHandlerMocks();
      await emulate.handler(
        {
          params: {},
          page,
        },
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.emulate, {});
    });

    it('reports correctly for the currently selected page', async () => {
      const {page, context, response} = createHandlerMocks();
      await emulate.handler(
        {
          params: {
            viewport: {
              width: 400,
              height: 400,
            },
          },
          page,
        },
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.emulate, {
        viewport: {
          width: 400,
          height: 400,
        },
      });
    });
  });

  describe('userAgent', () => {
    it('emulates userAgent', async () => {
      const {page, context, response} = createHandlerMocks();
      await emulate.handler(
        {
          params: {
            userAgent: 'MyUA',
          },
          page,
        },
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.emulate, {
        userAgent: 'MyUA',
      });
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Emulation configured successfully',
      );
    });

    it('updates userAgent', async () => {
      const {page, context, response} = createHandlerMocks();
      await emulate.handler(
        {
          params: {
            userAgent: 'UA1',
          },
          page,
        },
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.emulate, {
        userAgent: 'UA1',
      });

      await emulate.handler(
        {
          params: {
            userAgent: 'UA2',
          },
          page,
        },
        response,
        context,
      );
      sinon.assert.calledWithExactly(page.emulate.secondCall, {
        userAgent: 'UA2',
      });
    });

    it('clears userAgent override when userAgent is omitted', async () => {
      const {page, context, response} = createHandlerMocks();
      await emulate.handler(
        {
          params: {},
          page,
        },
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.emulate, {});
    });

    it('reports correctly for the currently selected page', async () => {
      const {page, context, response} = createHandlerMocks();
      await emulate.handler(
        {
          params: {
            userAgent: 'MyUA',
          },
          page,
        },
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.emulate, {
        userAgent: 'MyUA',
      });
    });
  });

  describe('extraHttpHeaders', () => {
    it('sets extra headers on requests', async () => {
      const {page, context, response} = createHandlerMocks();
      await emulate.handler(
        {
          params: {
            extraHttpHeaders: {'X-Custom-Header': 'test-value'},
          },
          page,
        },
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.emulate, {
        extraHttpHeaders: {'X-Custom-Header': 'test-value'},
      });
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Emulation configured successfully',
      );
    });

    it('clears extra headers when empty object is passed', async () => {
      const {page, context, response} = createHandlerMocks();
      await emulate.handler(
        {
          params: {
            extraHttpHeaders: {},
          },
          page,
        },
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.emulate, {
        extraHttpHeaders: {},
      });
    });

    it('reports correctly for the currently selected page', async () => {
      const {page, context, response} = createHandlerMocks();
      await emulate.handler(
        {
          params: {
            extraHttpHeaders: {'X-Page': 'one'},
          },
          page,
        },
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.emulate, {
        extraHttpHeaders: {'X-Page': 'one'},
      });
    });
  });

  describe('colorScheme', () => {
    it('emulates color scheme', async () => {
      const {page, context, response} = createHandlerMocks();
      await emulate.handler(
        {
          params: {
            colorScheme: 'dark',
          },
          page,
        },
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.emulate, {
        colorScheme: 'dark',
      });
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Emulation configured successfully',
      );
    });

    it('updates color scheme', async () => {
      const {page, context, response} = createHandlerMocks();
      await emulate.handler(
        {
          params: {
            colorScheme: 'dark',
          },
          page,
        },
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.emulate, {
        colorScheme: 'dark',
      });

      await emulate.handler(
        {
          params: {
            colorScheme: 'light',
          },
          page,
        },
        response,
        context,
      );
      sinon.assert.calledWithExactly(page.emulate.secondCall, {
        colorScheme: 'light',
      });
    });

    it('resets color scheme when set to auto', async () => {
      const {page, context, response} = createHandlerMocks();
      await emulate.handler(
        {
          params: {
            colorScheme: 'auto',
          },
          page,
        },
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.emulate, {
        colorScheme: 'auto',
      });
    });
  });
});
