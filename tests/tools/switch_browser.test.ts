/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {describe, it} from 'node:test';

import logger from 'debug';
import {executablePath} from 'puppeteer';
import puppeteer, {Locator} from 'puppeteer';

import {getBrowser, setBrowser} from '../../src/browser.js';
import {getContext, setContextInstance} from '../../src/context.js';
import {McpContext} from '../../src/McpContext.js';
import {McpResponse} from '../../src/McpResponse.js';
import {switchBrowser} from '../../src/tools/switch_browser.js';

describe('switch_browser', () => {
  it('throws error for unsupported protocol', async () => {
    const browser = await puppeteer.launch({
      executablePath: executablePath(),
      headless: true,
    });

    try {
      await browser.newPage();
      const context = await McpContext.from(
        browser,
        logger('test'),
        {
          experimentalDevToolsDebugging: false,
        },
        Locator,
      );
      const response = new McpResponse();

      setBrowser(browser);
      setContextInstance(context);

      try {
        await switchBrowser.handler(
          {params: {url: 'ftp://example.com:9222'}},
          response,
          context,
        );
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('Unsupported protocol'));
        assert.ok(error.message.includes('ftp:'));
      }

      // Browser was closed by disconnectBrowser
      context.dispose();
    } finally {
      if (browser.connected) {
        await browser.close();
      }
    }
  });

  it('disconnects current browser and connects to new WebSocket endpoint', async () => {
    const firstBrowser = await puppeteer.launch({
      executablePath: executablePath(),
      headless: true,
    });
    const secondBrowser = await puppeteer.launch({
      executablePath: executablePath(),
      headless: true,
      args: ['--remote-debugging-port=0'],
    });

    try {
      await firstBrowser.newPage();
      const initialContext = await McpContext.from(
        firstBrowser,
        logger('test'),
        {
          experimentalDevToolsDebugging: false,
        },
        Locator,
      );
      const response = new McpResponse();

      setBrowser(firstBrowser);
      setContextInstance(initialContext);

      const wsEndpoint = secondBrowser.wsEndpoint();
      assert.ok(wsEndpoint, 'Second browser should have WebSocket endpoint');

      // Verify initial state
      assert.strictEqual(getBrowser(), firstBrowser);
      assert.ok(firstBrowser.connected, 'Initial browser should be connected');

      // Execute switch_browser
      await switchBrowser.handler(
        {params: {url: wsEndpoint}},
        response,
        initialContext,
      );

      // Verify the first browser was disconnected
      assert.ok(
        !firstBrowser.connected,
        'Initial browser should be disconnected',
      );

      // Verify a new context was created
      const newContext = getContext();
      assert.ok(newContext, 'New context should exist');
      assert.notStrictEqual(
        newContext,
        initialContext,
        'Should have created a new context',
      );

      // Verify the new context is connected to the second browser
      const newBrowser = getBrowser();
      assert.ok(newBrowser, 'New browser should exist');
      assert.notStrictEqual(
        newBrowser,
        firstBrowser,
        'Should be connected to different browser',
      );
      assert.ok(newBrowser.connected, 'New browser should be connected');

      // Verify response messages
      assert.ok(
        response.responseLines.some(line =>
          line.includes('Connecting to browser via WebSocket'),
        ),
      );
      assert.ok(
        response.responseLines.some(line =>
          line.includes('Successfully connected to browser'),
        ),
      );
      assert.ok(response.includePages);

      // First browser was closed by disconnectBrowser, don't try to close its pages
      newContext?.dispose();
    } finally {
      if (secondBrowser.connected) {
        await secondBrowser.close();
      }
    }
  });

  it('converts HTTP URL to WebSocket and connects', async () => {
    const firstBrowser = await puppeteer.launch({
      executablePath: executablePath(),
      headless: true,
    });
    const secondBrowser = await puppeteer.launch({
      executablePath: executablePath(),
      headless: true,
      args: ['--remote-debugging-port=9224'],
    });

    try {
      await firstBrowser.newPage();
      const initialContext = await McpContext.from(
        firstBrowser,
        logger('test'),
        {
          experimentalDevToolsDebugging: false,
        },
        Locator,
      );
      const response = new McpResponse();

      setBrowser(firstBrowser);
      setContextInstance(initialContext);

      const httpUrl = 'http://127.0.0.1:9224';

      // Execute switch_browser with HTTP URL
      await switchBrowser.handler(
        {params: {url: httpUrl}},
        response,
        initialContext,
      );

      // Verify first browser was disconnected
      assert.ok(
        !firstBrowser.connected,
        'Initial browser should be disconnected',
      );

      // Verify new connection
      const newBrowser = getBrowser();
      assert.ok(newBrowser, 'New browser should exist');
      assert.ok(newBrowser.connected, 'New browser should be connected');

      // Verify response messages for HTTP conversion
      assert.ok(
        response.responseLines.some(line =>
          line.includes('Fetching WebSocket endpoint from browser'),
        ),
      );
      assert.ok(
        response.responseLines.some(line =>
          line.includes('Resolved WebSocket endpoint'),
        ),
      );
      assert.ok(
        response.responseLines.some(line =>
          line.includes('Successfully connected to browser'),
        ),
      );

      // First browser was closed by disconnectBrowser, don't try to close its pages
      const newContext = getContext();
      newContext?.dispose();
    } finally {
      if (secondBrowser.connected) {
        await secondBrowser.close();
      }
    }
  });

  it('respects timeout parameter and fails if connection takes too long', async () => {
    const browser = await puppeteer.launch({
      executablePath: executablePath(),
      headless: true,
    });

    try {
      await browser.newPage();
      const context = await McpContext.from(
        browser,
        logger('test'),
        {
          experimentalDevToolsDebugging: false,
        },
        Locator,
      );
      const response = new McpResponse();

      setBrowser(browser);
      setContextInstance(context);

      // Use a WebSocket endpoint that won't respond
      const fakeWsEndpoint = 'ws://127.0.0.1:59999/devtools/browser/fake';
      const shortTimeout = 1000; // 1 second

      try {
        await switchBrowser.handler(
          {params: {url: fakeWsEndpoint, timeout: shortTimeout}},
          response,
          context,
        );
        assert.fail('Should have thrown timeout or connection error');
      } catch (error) {
        assert.ok(
          error instanceof Error,
          `Expected Error but got: ${typeof error} - ${String(error)}`,
        );
        // Either timeout error or Puppeteer connection error is acceptable
        const hasTimeoutMessage = error.message.includes(
          'Failed to connect to browser within',
        );
        const hasConnectionError =
          error.message.includes('Puppeteer connection failed') ||
          error.message.includes('Could not connect');
        assert.ok(
          hasTimeoutMessage || hasConnectionError,
          `Error should mention timeout or connection failure, got: ${error.message}`,
        );
      }

      // Browser was closed by disconnectBrowser
      context.dispose();
    } finally {
      if (browser.connected) {
        await browser.close();
      }
    }
  });

  it('throws error when HTTP browser info endpoint fails', async () => {
    const browser = await puppeteer.launch({
      executablePath: executablePath(),
      headless: true,
    });

    try {
      await browser.newPage();
      const context = await McpContext.from(
        browser,
        logger('test'),
        {
          experimentalDevToolsDebugging: false,
        },
        Locator,
      );
      const response = new McpResponse();

      setBrowser(browser);
      setContextInstance(context);

      // Use HTTP URL with no browser running
      const httpUrl = 'http://127.0.0.1:59998';

      try {
        await switchBrowser.handler(
          {params: {url: httpUrl}},
          response,
          context,
        );
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(
          error.message.includes('Could not connect to browser at'),
          `Error should mention connection failure, got: ${error.message}`,
        );
      }

      // Browser was closed by disconnectBrowser
      context.dispose();
    } finally {
      if (browser.connected) {
        await browser.close();
      }
    }
  });

  it('throws error for invalid URL', async () => {
    const browser = await puppeteer.launch({
      executablePath: executablePath(),
      headless: true,
    });

    try {
      await browser.newPage();
      const context = await McpContext.from(
        browser,
        logger('test'),
        {
          experimentalDevToolsDebugging: false,
        },
        Locator,
      );
      const response = new McpResponse();

      setBrowser(browser);
      setContextInstance(context);

      try {
        await switchBrowser.handler(
          {params: {url: 'not-a-valid-url'}},
          response,
          context,
        );
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof Error);
        // URL constructor will throw for invalid URLs
        assert.ok(error.message);
      }

      // Browser was closed by disconnectBrowser
      context.dispose();
    } finally {
      if (browser.connected) {
        await browser.close();
      }
    }
  });
});
