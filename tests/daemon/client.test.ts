/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it, afterEach} from 'node:test';

import {
  handleResponse,
  startDaemon,
  stopDaemon,
} from '../../src/daemon/client.js';
import {isDaemonRunning} from '../../src/daemon/utils.js';

describe('daemon client', () => {
  describe('start/stop', () => {
    afterEach(async () => {
      if (isDaemonRunning()) {
        await stopDaemon();
        // Wait a bit for the daemon to fully terminate and clean up its files.
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    });

    it('should start and stop daemon', async () => {
      assert.ok(!isDaemonRunning(), 'Daemon should not be running initially');

      await startDaemon();
      assert.ok(isDaemonRunning(), 'Daemon should be running after start');

      await stopDaemon();
      await new Promise(resolve => setTimeout(resolve, 1000));
      assert.ok(!isDaemonRunning(), 'Daemon should not be running after stop');
    });

    it('should handle starting daemon when already running', async () => {
      await startDaemon();
      assert.ok(isDaemonRunning(), 'Daemon should be running');

      // Starting again should be a no-op
      await startDaemon();
      assert.ok(isDaemonRunning(), 'Daemon should still be running');
    });

    it('should handle stopping daemon when not running', async () => {
      assert.ok(!isDaemonRunning(), 'Daemon should not be running initially');

      // Stopping when not running should be a no-op
      await stopDaemon();
      assert.ok(!isDaemonRunning(), 'Daemon should still not be running');
    });
  });

  describe('parsing', () => {
    it('handles MCP response with text format', () => {
      const textResponse = {content: [{type: 'text' as const, text: 'test'}]};
      assert.strictEqual(handleResponse(textResponse, 'text'), 'test');
    });

    it('handles JSON response', () => {
      const jsonResponse = {
        content: [],
        structuredContent: {
          test: 'data',
          number: 123,
        },
      };
      assert.strictEqual(
        handleResponse(jsonResponse, 'json'),
        JSON.stringify(jsonResponse.structuredContent),
      );
    });

    it('handles error response when isError is true', () => {
      const errorResponse = {
        isError: true,
        content: [{type: 'text' as const, text: 'Something went wrong'}],
      };
      assert.strictEqual(
        handleResponse(errorResponse, 'text'),
        JSON.stringify(errorResponse.content),
      );
    });

    it('handles text response when json format is requested but no structured content', () => {
      const textResponse = {
        content: [{type: 'text' as const, text: 'Fall through text'}],
      };
      assert.deepStrictEqual(
        handleResponse(textResponse, 'json'),
        JSON.stringify(['Fall through text']),
      );
    });

    it('throws error for unsupported content type', () => {
      const unsupportedContentResponse = {
        content: [
          {
            type: 'resource' as const,
            resource: {
              uri: 'data:image/png;base64,base64data',
              blob: 'base64data',
              mimeType: 'image/png',
            },
          },
        ],
        structuredContent: {},
      };
      assert.throws(
        () => handleResponse(unsupportedContentResponse, 'text'),
        new Error('Not supported response content type'),
      );
    });
  });
});
