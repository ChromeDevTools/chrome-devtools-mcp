/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import {describe, it, afterEach, beforeEach} from 'node:test';

import {
  handleResponse,
  startDaemon,
  stopDaemon,
} from '../../src/daemon/client.js';
import {isDaemonRunning} from '../../src/daemon/utils.js';

describe('daemon client', () => {
  describe('start/stop', () => {
    let sessionId: string;

    beforeEach(async () => {
      sessionId = crypto.randomUUID();
      await stopDaemon(sessionId);
    });

    afterEach(async () => {
      await stopDaemon(sessionId);
    });

    it('should start and stop daemon', async () => {
      assert.ok(
        !isDaemonRunning(sessionId),
        'Daemon should not be running initially',
      );

      await startDaemon([], sessionId);
      assert.ok(
        isDaemonRunning(sessionId),
        'Daemon should be running after start',
      );

      await stopDaemon(sessionId);
      assert.ok(
        !isDaemonRunning(sessionId),
        'Daemon should not be running after stop',
      );
    });

    it('should handle starting daemon when already running', async () => {
      await startDaemon([], sessionId);
      assert.ok(isDaemonRunning(sessionId), 'Daemon should be running');

      // Starting again should be a no-op
      await startDaemon([], sessionId);
      assert.ok(isDaemonRunning(sessionId), 'Daemon should still be running');
    });

    it('should handle stopping daemon when not running', async () => {
      assert.ok(
        !isDaemonRunning(sessionId),
        'Daemon should not be running initially',
      );

      // Stopping when not running should be a no-op
      await stopDaemon(sessionId);
      assert.ok(
        !isDaemonRunning(sessionId),
        'Daemon should still not be running',
      );
    });
  });

  describe('parsing', () => {
    it('handles MCP response with text format', async () => {
      const textResponse = {content: [{type: 'text' as const, text: 'test'}]};
      assert.strictEqual(await handleResponse(textResponse, 'md'), 'test');
    });

    it('handles JSON response', async () => {
      const jsonResponse = {
        content: [],
        structuredContent: {
          test: 'data',
          number: 123,
        },
      };
      assert.strictEqual(
        await handleResponse(jsonResponse, 'json'),
        JSON.stringify(jsonResponse.structuredContent),
      );
    });

    it('handles error response when isError is true', async () => {
      const errorResponse = {
        isError: true,
        content: [{type: 'text' as const, text: 'Something went wrong'}],
      };
      assert.strictEqual(
        await handleResponse(errorResponse, 'md'),
        JSON.stringify(errorResponse.content),
      );
    });

    it('handles text response when json format is requested but no structured content', async () => {
      const textResponse = {
        content: [{type: 'text' as const, text: 'Fall through text'}],
      };
      assert.deepStrictEqual(
        await handleResponse(textResponse, 'json'),
        JSON.stringify(['Fall through text']),
      );
    });

    it('supports images', async () => {
      const unsupportedContentResponse = {
        content: [
          {
            type: 'image' as const,
            data: 'base64data',
            mimeType: 'image/png',
          },
        ],
        structuredContent: {},
      };
      const response = await handleResponse(unsupportedContentResponse, 'md');
      assert.ok(response.includes('.png'));
    });

    it('uses the webp extension for WebP images', async () => {
      const webpContentResponse = {
        content: [
          {
            type: 'image' as const,
            data: 'base64data',
            mimeType: 'image/webp',
          },
        ],
        structuredContent: {},
      };
      const response = await handleResponse(webpContentResponse, 'md');
      assert.ok(response.includes('.webp'));
    });
  });
});
