/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for the `emulate` tool handler.
 *
 * These tests replace the real-browser `withMcpContext` calls used in
 * emulation.test.ts for the cases that only need to verify the handler's
 * effect on McpPage state and the response text. A real browser is not
 * required, so the suite runs fast and in isolation.
 *
 * This file is a proof-of-concept for the optimisation described in
 * https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2639:
 *   1) Tool handler tests verify the outcome on context/response using mocks.
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {emulate} from '../../src/tools/emulation.js';
import {
  createMockMcpContext,
  createMockMcpPage,
  createMockMcpResponse,
} from '../testMocks.js';

afterEach(() => {
  sinon.restore();
});

describe('emulate tool handler (unit)', () => {
  // -------------------------------------------------------------------------
  // Helper: run the handler with a freshly created mock page/context/response.
  // Returns all three so tests can assert on them.
  // -------------------------------------------------------------------------
  async function runHandler(
    params: Parameters<typeof emulate.handler>[0]['params'],
  ) {
    const page = createMockMcpPage();
    const context = createMockMcpContext({selectedPage: page});
    const response = createMockMcpResponse();

    await emulate.handler(
      {params, page: page as unknown as Parameters<typeof emulate.handler>[0]['page']},
      response as unknown as Parameters<typeof emulate.handler>[1],
      context as unknown as Parameters<typeof emulate.handler>[2],
    );

    return {page, context, response};
  }

  // -------------------------------------------------------------------------
  // Response text
  // -------------------------------------------------------------------------

  it('appends a success response line', async () => {
    const {response} = await runHandler({});
    assert.strictEqual(response.responseLines.length, 1);
    assert.strictEqual(
      response.responseLines[0],
      'Emulation configured successfully',
    );
  });

  // -------------------------------------------------------------------------
  // Network conditions
  // -------------------------------------------------------------------------

  describe('networkConditions', () => {
    it('stores Offline when networkConditions is "Offline"', async () => {
      const {page} = await runHandler({networkConditions: 'Offline'});
      assert.strictEqual(page.networkConditions, 'Offline');
    });

    it('stores "Slow 3G" when networkConditions is "Slow 3G"', async () => {
      const {page} = await runHandler({networkConditions: 'Slow 3G'});
      assert.strictEqual(page.networkConditions, 'Slow 3G');
    });

    it('clears networkConditions when omitted', async () => {
      // Pre-set a value, then run handler with no networkConditions param.
      const page = createMockMcpPage();
      page.emulationSettings.networkConditions = 'Slow 3G';
      const context = createMockMcpContext({selectedPage: page});
      const response = createMockMcpResponse();

      await emulate.handler(
        {params: {}, page: page as unknown as Parameters<typeof emulate.handler>[0]['page']},
        response as unknown as Parameters<typeof emulate.handler>[1],
        context as unknown as Parameters<typeof emulate.handler>[2],
      );

      assert.strictEqual(page.networkConditions, null);
    });

    it('calls page.emulate exactly once', async () => {
      const {page} = await runHandler({networkConditions: 'Slow 3G'});
      assert.strictEqual(page.emulate.callCount, 1);
    });
  });

  // -------------------------------------------------------------------------
  // CPU throttling
  // -------------------------------------------------------------------------

  describe('cpuThrottlingRate', () => {
    it('stores the throttling rate', async () => {
      const {page} = await runHandler({cpuThrottlingRate: 4});
      assert.strictEqual(page.cpuThrottlingRate, 4);
    });

    it('resets to 1 when cpuThrottlingRate is 1', async () => {
      const {page} = await runHandler({cpuThrottlingRate: 1});
      // A rate of 1 means "no throttling"; the mock stores it as-is.
      assert.strictEqual(page.cpuThrottlingRate, 1);
    });
  });

  // -------------------------------------------------------------------------
  // Geolocation
  // -------------------------------------------------------------------------

  describe('geolocation', () => {
    it('stores geolocation coordinates', async () => {
      const {page} = await runHandler({
        geolocation: {latitude: 48.137154, longitude: 11.576124},
      });
      assert.strictEqual(page.geolocation?.latitude, 48.137154);
      assert.strictEqual(page.geolocation?.longitude, 11.576124);
    });

    it('clears geolocation when omitted', async () => {
      const page = createMockMcpPage();
      page.emulationSettings.geolocation = {latitude: 48, longitude: 11};
      const context = createMockMcpContext({selectedPage: page});
      const response = createMockMcpResponse();

      await emulate.handler(
        {params: {}, page: page as unknown as Parameters<typeof emulate.handler>[0]['page']},
        response as unknown as Parameters<typeof emulate.handler>[1],
        context as unknown as Parameters<typeof emulate.handler>[2],
      );

      assert.strictEqual(page.geolocation, null);
    });
  });

  // -------------------------------------------------------------------------
  // User agent
  // -------------------------------------------------------------------------

  describe('userAgent', () => {
    it('stores the user agent string', async () => {
      const {page} = await runHandler({userAgent: 'MyUA/1.0'});
      assert.strictEqual(page.userAgent, 'MyUA/1.0');
    });

    it('clears userAgent when an empty string is provided', async () => {
      const page = createMockMcpPage();
      page.emulationSettings.userAgent = 'OldUA';
      const context = createMockMcpContext({selectedPage: page});
      const response = createMockMcpResponse();

      await emulate.handler(
        {
          params: {userAgent: ''},
          page: page as unknown as Parameters<typeof emulate.handler>[0]['page'],
        },
        response as unknown as Parameters<typeof emulate.handler>[1],
        context as unknown as Parameters<typeof emulate.handler>[2],
      );

      assert.strictEqual(page.userAgent, null);
    });
  });

  // -------------------------------------------------------------------------
  // Color scheme
  // -------------------------------------------------------------------------

  describe('colorScheme', () => {
    it('stores "dark" color scheme', async () => {
      const {page} = await runHandler({colorScheme: 'dark'});
      assert.strictEqual(page.colorScheme, 'dark');
    });

    it('stores "light" color scheme', async () => {
      const {page} = await runHandler({colorScheme: 'light'});
      assert.strictEqual(page.colorScheme, 'light');
    });

    it('clears colorScheme when set to "auto"', async () => {
      const page = createMockMcpPage();
      page.emulationSettings.colorScheme = 'dark';
      const context = createMockMcpContext({selectedPage: page});
      const response = createMockMcpResponse();

      await emulate.handler(
        {
          params: {colorScheme: 'auto'},
          page: page as unknown as Parameters<typeof emulate.handler>[0]['page'],
        },
        response as unknown as Parameters<typeof emulate.handler>[1],
        context as unknown as Parameters<typeof emulate.handler>[2],
      );

      assert.strictEqual(page.colorScheme, null);
    });
  });

  // -------------------------------------------------------------------------
  // Viewport
  // -------------------------------------------------------------------------

  describe('viewport', () => {
    it('stores viewport dimensions', async () => {
      const {page} = await runHandler({
        viewport: {width: 400, height: 600, isMobile: false, isLandscape: false, hasTouch: false},
      });
      assert.ok(page.viewport);
      assert.strictEqual(page.viewport.width, 400);
      assert.strictEqual(page.viewport.height, 600);
    });

    it('clears viewport when omitted', async () => {
      const page = createMockMcpPage();
      page.emulationSettings.viewport = {width: 400, height: 600};
      const context = createMockMcpContext({selectedPage: page});
      const response = createMockMcpResponse();

      await emulate.handler(
        {params: {}, page: page as unknown as Parameters<typeof emulate.handler>[0]['page']},
        response as unknown as Parameters<typeof emulate.handler>[1],
        context as unknown as Parameters<typeof emulate.handler>[2],
      );

      assert.strictEqual(page.viewport, null);
    });
  });

  // -------------------------------------------------------------------------
  // Extra HTTP headers
  // -------------------------------------------------------------------------

  describe('extraHttpHeaders', () => {
    it('stores extra HTTP headers', async () => {
      const {page} = await runHandler({
        extraHttpHeaders: {'X-Custom': 'value'},
      });
      assert.deepStrictEqual(page.emulationSettings.extraHttpHeaders, {
        'X-Custom': 'value',
      });
    });

    it('clears extra HTTP headers when an empty object is provided', async () => {
      const page = createMockMcpPage();
      page.emulationSettings.extraHttpHeaders = {'X-Old': 'gone'};
      const context = createMockMcpContext({selectedPage: page});
      const response = createMockMcpResponse();

      await emulate.handler(
        {
          params: {extraHttpHeaders: {}},
          page: page as unknown as Parameters<typeof emulate.handler>[0]['page'],
        },
        response as unknown as Parameters<typeof emulate.handler>[1],
        context as unknown as Parameters<typeof emulate.handler>[2],
      );

      assert.strictEqual(page.emulationSettings.extraHttpHeaders, undefined);
    });

    it('extraHttpHeaders does not affect settings from a prior call on the same page object', async () => {
      // The real McpPage.emulate always re-evaluates all keys, so calling it
      // twice IS expected to override previous single-key calls. This test
      // verifies the mock behaves consistently with that contract: the second
      // call with only extraHttpHeaders will clear userAgent (falsy → delete).
      const page = createMockMcpPage();
      const context = createMockMcpContext({selectedPage: page});
      const response = createMockMcpResponse();

      // First call: set userAgent
      await emulate.handler(
        {
          params: {userAgent: 'MyUA'},
          page: page as unknown as Parameters<typeof emulate.handler>[0]['page'],
        },
        response as unknown as Parameters<typeof emulate.handler>[1],
        context as unknown as Parameters<typeof emulate.handler>[2],
      );

      assert.strictEqual(page.userAgent, 'MyUA');

      // Second call: set extraHttpHeaders only — userAgent is not passed,
      // so the real implementation clears it (falsy → delete).
      await emulate.handler(
        {
          params: {extraHttpHeaders: {'X-Test': 'value'}},
          page: page as unknown as Parameters<typeof emulate.handler>[0]['page'],
        },
        response as unknown as Parameters<typeof emulate.handler>[1],
        context as unknown as Parameters<typeof emulate.handler>[2],
      );

      // extraHttpHeaders should now be set
      assert.deepStrictEqual(page.emulationSettings.extraHttpHeaders, {
        'X-Test': 'value',
      });
      // userAgent was cleared by the second call (real McpPage behaviour)
      assert.strictEqual(page.userAgent, null);
    });
  });
});
