/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {zod} from '../../src/third_party/index.js';
import {emulate} from '../../src/tools/emulation.js';
import {
  geolocationTransform,
  viewportTransform,
} from '../../src/tools/ToolDefinition.js';
import {createHandlerMocks} from '../mocks.js';

describe('emulation', () => {
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

      it('throws when width or height is not an integer', () => {
        assert.throws(
          () => viewportTransform('1280.5x720'),
          /Expected an integer/,
        );
        assert.throws(
          () => viewportTransform('1280x720.5'),
          /Expected an integer/,
        );
        assert.throws(
          () => viewportTransform('1280.0x720'),
          /Expected an integer/,
        );
        assert.throws(
          () => viewportTransform('1280x720.'),
          /Expected an integer/,
        );
      });

      it('throws when devicePixelRatio is not positive', () => {
        assert.throws(() => viewportTransform('1024x768x0'));
      });

      it('throws when height is missing', () => {
        assert.throws(() => viewportTransform('800'));
      });

      it('throws when viewport has unknown tags', () => {
        assert.throws(() => viewportTransform('1280x720,mobile,bogus'));
      });

      it('throws when viewport has empty tags', () => {
        assert.throws(() => viewportTransform('1280x720,'));
      });

      it('throws when viewport has extra dimension parts', () => {
        assert.throws(() => viewportTransform('1280x720x2x9'));
      });

      it('throws when dimension parts are empty or contain whitespace', () => {
        assert.throws(() => viewportTransform('800x'));
        assert.throws(() => viewportTransform('x600'));
        assert.throws(() => viewportTransform(' 1280 x 720'));
        assert.throws(() => viewportTransform('1280x720, mobile'));
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

      it('throws when geolocation has empty parts or trailing commas', () => {
        assert.throws(() => geolocationTransform('37.77,'));
        assert.throws(() => geolocationTransform(','));
      });

      it('throws when geolocation has extra parts', () => {
        assert.throws(() => geolocationTransform('37.77,-122.42,9'));
      });

      it('throws on hex coordinates or surrounding whitespace', () => {
        assert.throws(() => geolocationTransform('0x10,0x20'));
        assert.throws(() => geolocationTransform(' 37.77 , -122.42 '));
      });
    });
  });

  describe('network', () => {
    it('emulates offline network conditions', async () => {
      const {page, context, response, args} = createHandlerMocks();
      await emulate(args).handler(
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
      const {page, context, response, args} = createHandlerMocks();
      await emulate(args).handler(
        {params: {networkConditions: 'Slow 3G'}, page},
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.emulate, {
        networkConditions: 'Slow 3G',
      });
    });

    it('disables network emulation when networkConditions is omitted', async () => {
      const {page, context, response, args} = createHandlerMocks();
      await emulate(args).handler({params: {}, page}, response, context);
      sinon.assert.calledOnceWithExactly(page.emulate, {});
    });

    it('report correctly for the currently selected page', async () => {
      const {page, context, response, args} = createHandlerMocks();
      await emulate(args).handler(
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
      const {page, context, response, args} = createHandlerMocks();
      await emulate(args).handler(
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
      const {page, context, response, args} = createHandlerMocks();
      await emulate(args).handler(
        {params: {cpuThrottlingRate: 1}, page},
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.emulate, {cpuThrottlingRate: 1});
    });

    it('report correctly for the currently selected page', async () => {
      const {page, context, response, args} = createHandlerMocks();
      await emulate(args).handler(
        {params: {cpuThrottlingRate: 4}, page},
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.emulate, {cpuThrottlingRate: 4});
    });
  });

  describe('geolocation', () => {
    it('emulates geolocation with latitude and longitude', async () => {
      const {page, context, response, args} = createHandlerMocks();
      await emulate(args).handler(
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
      const {page, context, response, args} = createHandlerMocks();
      await emulate(args).handler(
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
      const {page, context, response, args} = createHandlerMocks();
      await emulate(args).handler(
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
      const {page, context, response, args} = createHandlerMocks();
      await emulate(args).handler(
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
      const {page, context, response, args} = createHandlerMocks();
      await emulate(args).handler(
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
      const {page, context, response, args} = createHandlerMocks();
      await emulate(args).handler(
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
      const {page, context, response, args} = createHandlerMocks();
      await emulate(args).handler(
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
      const {page, context, response, args} = createHandlerMocks();
      await emulate(args).handler(
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

      await emulate(args).handler(
        {
          params: {
            userAgent: 'UA2',
          },
          page,
        },
        response,
        context,
      );
      sinon.assert.calledTwice(page.emulate);
      sinon.assert.calledWithExactly(page.emulate.secondCall, {
        userAgent: 'UA2',
      });
    });

    it('clears userAgent override when userAgent is omitted', async () => {
      const {page, context, response, args} = createHandlerMocks();
      await emulate(args).handler(
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
      const {page, context, response, args} = createHandlerMocks();
      await emulate(args).handler(
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
    it('emulates extraHttpHeaders', async () => {
      const {page, context, response, args} = createHandlerMocks();
      await emulate(args).handler(
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
      const {page, context, response, args} = createHandlerMocks();
      await emulate(args).handler(
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
      const {page, context, response, args} = createHandlerMocks();
      await emulate(args).handler(
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

    it('parses valid extraHttpHeaders JSON and empty string in schema', () => {
      const {args} = createHandlerMocks();
      const schema = zod.object(emulate(args).schema);
      assert.deepStrictEqual(
        schema.safeParse({
          pageId: 1,
          extraHttpHeaders: '{"X-Custom": "value"}',
        }),
        {
          success: true,
          data: {
            pageId: 1,
            extraHttpHeaders: {'X-Custom': 'value'},
          },
        },
      );
      assert.deepStrictEqual(
        schema.safeParse({
          pageId: 1,
          extraHttpHeaders: '',
        }),
        {
          success: true,
          data: {
            pageId: 1,
            extraHttpHeaders: {},
          },
        },
      );
    });

    it('reports validation issues instead of throwing for invalid transform inputs', () => {
      const {args} = createHandlerMocks();
      const schema = zod.object(emulate(args).schema);

      const geoResult = schema.safeParse({pageId: 1, geolocation: '0x0'});
      assert.strictEqual(geoResult.success, false);
      assert.strictEqual(
        geoResult.error.issues[0].message,
        'Invalid geolocation "0x0". Expected \'<latitude>,<longitude>\'.',
      );

      const nonNumericGeoResult = schema.safeParse({
        pageId: 1,
        geolocation: 'abc,11.5',
      });
      assert.strictEqual(nonNumericGeoResult.success, false);
      assert.deepStrictEqual(nonNumericGeoResult.error.issues[0].path, [
        'geolocation',
        'latitude',
      ]);
      assert.strictEqual(
        nonNumericGeoResult.error.issues[0].message,
        'Expected a number',
      );

      const viewportResult = schema.safeParse({pageId: 1, viewport: '0x0'});
      assert.strictEqual(viewportResult.success, false);
      assert.deepStrictEqual(viewportResult.error.issues[0].path, [
        'viewport',
        'width',
      ]);
      assert.strictEqual(
        viewportResult.error.issues[0].message,
        'Too small: expected number to be >0',
      );

      const nonNumericViewportResult = schema.safeParse({
        pageId: 1,
        viewport: 'abcx720',
      });
      assert.strictEqual(nonNumericViewportResult.success, false);
      assert.deepStrictEqual(nonNumericViewportResult.error.issues[0].path, [
        'viewport',
        'width',
      ]);
      assert.strictEqual(
        nonNumericViewportResult.error.issues[0].message,
        'Expected an integer',
      );

      const fractionalViewportResult = schema.safeParse({
        pageId: 1,
        viewport: '1280.5x720',
      });
      assert.strictEqual(fractionalViewportResult.success, false);
      assert.deepStrictEqual(fractionalViewportResult.error.issues[0].path, [
        'viewport',
        'width',
      ]);
      assert.strictEqual(
        fractionalViewportResult.error.issues[0].message,
        'Expected an integer',
      );

      const invalidTagResult = schema.safeParse({
        pageId: 1,
        viewport: '1280x720,bogus',
      });
      assert.strictEqual(invalidTagResult.success, false);
      assert.deepStrictEqual(invalidTagResult.error.issues[0].path, [
        'viewport',
      ]);
      assert.strictEqual(
        invalidTagResult.error.issues[0].message,
        'Invalid viewport option "bogus". Expected "mobile", "touch", or "landscape" in \'<width>x<height>x<devicePixelRatio>[,mobile][,touch][,landscape]\'.',
      );

      const emptyTagResult = schema.safeParse({
        pageId: 1,
        viewport: '1280x720,',
      });
      assert.strictEqual(emptyTagResult.success, false);
      assert.deepStrictEqual(emptyTagResult.error.issues[0].path, ['viewport']);
      assert.strictEqual(
        emptyTagResult.error.issues[0].message,
        'Invalid viewport option "". Expected "mobile", "touch", or "landscape" in \'<width>x<height>x<devicePixelRatio>[,mobile][,touch][,landscape]\'.',
      );

      const invalidJsonResult = schema.safeParse({
        pageId: 1,
        extraHttpHeaders: 'notjson',
      });
      assert.strictEqual(invalidJsonResult.success, false);
      assert.match(
        invalidJsonResult.error.issues[0].message,
        /^Invalid JSON for headers:/,
      );

      const nonObjectHeadersResult = schema.safeParse({
        pageId: 1,
        extraHttpHeaders: '[]',
      });
      assert.strictEqual(nonObjectHeadersResult.success, false);
      assert.strictEqual(
        nonObjectHeadersResult.error.issues[0].message,
        'Invalid JSON for headers: Headers must be a JSON object',
      );
    });
  });

  describe('colorScheme', () => {
    it('emulates color scheme', async () => {
      const {page, context, response, args} = createHandlerMocks();
      await emulate(args).handler(
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
      const {page, context, response, args} = createHandlerMocks();
      await emulate(args).handler(
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

      await emulate(args).handler(
        {
          params: {
            colorScheme: 'light',
          },
          page,
        },
        response,
        context,
      );
      sinon.assert.calledTwice(page.emulate);
      sinon.assert.calledWithExactly(page.emulate.secondCall, {
        colorScheme: 'light',
      });
    });

    it('resets color scheme when set to auto', async () => {
      const {page, context, response, args} = createHandlerMocks();
      await emulate(args).handler(
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

  describe('media features', () => {
    it('emulates forced-colors, prefers-contrast and prefers-reduced-motion', async () => {
      const {page, context, response, args} = createHandlerMocks();
      await emulate(args).handler(
        {
          params: {
            forcedColors: 'active',
            prefersContrast: 'more',
            prefersReducedMotion: 'reduce',
          },
          page,
        },
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(page.emulate, {
        forcedColors: 'active',
        prefersContrast: 'more',
        prefersReducedMotion: 'reduce',
      });
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Emulation configured successfully',
      );
    });

    it('rejects unsupported values', () => {
      const {args} = createHandlerMocks();
      const schema = zod.object(emulate(args).schema);
      assert.strictEqual(
        schema.safeParse({forcedColors: 'inactive'}).success,
        false,
      );
      assert.strictEqual(
        schema.safeParse({prefersContrast: 'high'}).success,
        false,
      );
      assert.strictEqual(
        schema.safeParse({prefersReducedMotion: 'yes'}).success,
        false,
      );
    });
  });
});
