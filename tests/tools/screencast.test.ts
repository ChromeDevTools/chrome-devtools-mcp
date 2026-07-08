/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, it, afterEach} from 'node:test';

import sinon from 'sinon';

import type {ParsedArguments} from '../../src/bin/chrome-devtools-mcp-cli-options.js';
import {startScreencast, stopScreencast} from '../../src/tools/screencast.js';
import {withMcpContext} from '../utils.js';

function createMockRecorder() {
  return {
    stop: sinon.stub().resolves(),
  };
}

describe('screencast', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('screencast_start', () => {
    it('starts a screencast recording with filePath', async () => {
      await withMcpContext(async (response, context) => {
        const mockRecorder = createMockRecorder();
        const selectedPage = context.getSelectedPptrPage();
        const screencastStub = sinon
          .stub(selectedPage, 'screencast')
          .resolves(mockRecorder as never);

        await startScreencast().handler(
          {
            params: {filePath: path.join(os.tmpdir(), 'test-recording.mp4')},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        sinon.assert.calledOnce(screencastStub);
        const callArgs = screencastStub.firstCall.args[0];
        assert.ok(callArgs);
        assert.ok(callArgs.path?.endsWith('test-recording.mp4'));

        assert.ok(context.getScreenRecorder() !== null);
        assert.ok(
          response.responseLines
            .join('\n')
            .includes('Screencast recording started'),
        );
      });
    });

    it('records WebM for an uppercase extension (case-insensitive)', async () => {
      await withMcpContext(async (response, context) => {
        const mockRecorder = createMockRecorder();
        const selectedPage = context.getSelectedPptrPage();
        const screencastStub = sinon
          .stub(selectedPage, 'screencast')
          .resolves(mockRecorder as never);

        await startScreencast().handler(
          {
            params: {filePath: path.join(os.tmpdir(), 'test-recording.WEBM')},
            page: context.getSelectedMcpPage(),
          },
          response,
          context,
        );

        sinon.assert.calledOnce(screencastStub);
        const callArgs = screencastStub.firstCall.args[0];
        assert.ok(callArgs);
        assert.strictEqual(callArgs.format, 'webm');
        assert.ok(callArgs.path?.endsWith('.webm'));
      });
    });

    it('rejects an unsupported extension instead of silently using mp4', async () => {
      await withMcpContext(async (response, context) => {
        const selectedPage = context.getSelectedPptrPage();
        const screencastStub = sinon.stub(selectedPage, 'screencast');

        await assert.rejects(
          startScreencast().handler(
            {
              params: {filePath: path.join(os.tmpdir(), 'recording.avi')},
              page: context.getSelectedMcpPage(),
            },
            response,
            context,
          ),
          /Unsupported screencast file extension/,
        );

        sinon.assert.notCalled(screencastStub);
        assert.strictEqual(context.getScreenRecorder(), null);
      });
    });

    it('starts a screencast recording with temp file when no filePath', async () => {
      await withMcpContext(async (response, context) => {
        const mockRecorder = createMockRecorder();
        const selectedPage = context.getSelectedPptrPage();
        const screencastStub = sinon
          .stub(selectedPage, 'screencast')
          .resolves(mockRecorder as never);

        await startScreencast().handler(
          {params: {}, page: context.getSelectedMcpPage()},
          response,
          context,
        );

        sinon.assert.calledOnce(screencastStub);
        const callArgs = screencastStub.firstCall.args[0];
        assert.ok(callArgs);
        assert.ok(callArgs.path?.endsWith('.mp4'));
        assert.ok(context.getScreenRecorder() !== null);
      });
    });

    it('errors if a recording is already active', async () => {
      await withMcpContext(async (response, context) => {
        const mockRecorder = createMockRecorder();
        context.setScreenRecorder({
          recorder: mockRecorder as never,
          filePath: path.join(os.tmpdir(), 'existing.mp4'),
        });

        const selectedPage = context.getSelectedPptrPage();
        const screencastStub = sinon.stub(selectedPage, 'screencast');

        await startScreencast().handler(
          {params: {}, page: context.getSelectedMcpPage()},
          response,
          context,
        );

        sinon.assert.notCalled(screencastStub);
        assert.ok(
          response.responseLines
            .join('\n')
            .includes('a screencast recording is already in progress'),
        );
      });
    });

    it('provides a clear error when ffmpeg is not found', async () => {
      await withMcpContext(async (response, context) => {
        const selectedPage = context.getSelectedPptrPage();
        const error = new Error('spawn ffmpeg ENOENT');
        sinon.stub(selectedPage, 'screencast').rejects(error);

        await assert.rejects(
          startScreencast().handler(
            {
              params: {filePath: path.join(os.tmpdir(), 'test.mp4')},
              page: context.getSelectedMcpPage(),
            },
            response,
            context,
          ),
          /ffmpeg is required for screencast recording/,
        );

        assert.strictEqual(context.getScreenRecorder(), null);
      });
    });

    it('cleans up the generated temp directory if recording fails to start', async () => {
      await withMcpContext(async (response, context) => {
        const selectedPage = context.getSelectedPptrPage();
        const screencastStub = sinon
          .stub(selectedPage, 'screencast')
          .rejects(new Error('spawn ffmpeg ENOENT'));

        await assert.rejects(
          startScreencast().handler(
            {params: {}, page: context.getSelectedMcpPage()},
            response,
            context,
          ),
          /ffmpeg is required for screencast recording/,
        );

        // The temp directory generateTempFilePath() created must be removed.
        const tempPath = screencastStub.firstCall.args[0]?.path as string;
        assert.ok(tempPath);
        await assert.rejects(fs.access(path.dirname(tempPath)));
        assert.strictEqual(context.getScreenRecorder(), null);
      });
    });

    it('passes ffmpegPath from args to puppeteer', async () => {
      await withMcpContext(async (response, context) => {
        const mockRecorder = createMockRecorder();
        const selectedPage = context.getSelectedPptrPage();
        const screencastStub = sinon
          .stub(selectedPage, 'screencast')
          .resolves(mockRecorder as never);

        const experimentalFfmpegPath = '/custom/path/to/ffmpeg';
        await startScreencast({
          experimentalFfmpegPath,
        } as ParsedArguments).handler(
          {params: {}, page: context.getSelectedMcpPage()},
          response,
          context,
        );

        sinon.assert.calledOnce(screencastStub);
        const callArgs = screencastStub.firstCall.args[0];
        assert.strictEqual(callArgs?.ffmpegPath, experimentalFfmpegPath);
      });
    });
  });

  describe('screencast_stop', () => {
    it('returns an error message if no recording is active', async () => {
      await withMcpContext(async (response, context) => {
        assert.strictEqual(context.getScreenRecorder(), null);
        await stopScreencast.handler(
          {params: {}, page: context.getSelectedMcpPage()},
          response,
          context,
        );
        assert.ok(
          response.responseLines
            .join('\n')
            .includes('no active screencast recording to stop'),
        );
      });
    });

    it('stops an active recording and reports the file path', async () => {
      await withMcpContext(async (response, context) => {
        const mockRecorder = createMockRecorder();
        const filePath = path.join(os.tmpdir(), 'test-recording.mp4');
        context.setScreenRecorder({
          recorder: mockRecorder as never,
          filePath,
        });

        await stopScreencast.handler(
          {params: {}, page: context.getSelectedMcpPage()},
          response,
          context,
        );

        sinon.assert.calledOnce(mockRecorder.stop);
        assert.strictEqual(context.getScreenRecorder(), null);
        assert.ok(
          response.responseLines
            .join('\n')
            .includes(`stopped and saved to ${filePath}`),
        );
      });
    });

    it('clears the recorder even if stop() throws', async () => {
      await withMcpContext(async (response, context) => {
        const mockRecorder = createMockRecorder();
        mockRecorder.stop.rejects(new Error('ffmpeg process error'));
        context.setScreenRecorder({
          recorder: mockRecorder as never,
          filePath: path.join(os.tmpdir(), 'test.mp4'),
        });

        await assert.rejects(
          stopScreencast.handler(
            {params: {}, page: context.getSelectedMcpPage()},
            response,
            context,
          ),
          /ffmpeg process error/,
        );

        assert.strictEqual(context.getScreenRecorder(), null);
      });
    });
  });
});
