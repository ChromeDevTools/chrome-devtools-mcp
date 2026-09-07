/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {parseArguments} from '../../src/config/mcp-options.js';
import {startScreencast, stopScreencast} from '../../src/tools/screencast.js';
import {createHandlerMocks, createMockScreenRecorder} from '../mocks.js';

describe('screencast', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('screencast_start', () => {
    it('starts a screencast recording with filePath', async () => {
      const {page, context, response} = createHandlerMocks();
      const mockRecorder = createMockScreenRecorder();
      const screencastStub = page.pptrPage.screencast;
      screencastStub.resolves(mockRecorder);

      const filePath = path.join(
        os.tmpdir(),
        'test-recording.mp4',
      ) as `${string}.mp4`;
      await startScreencast().handler(
        {
          params: {filePath},
          page,
        },
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(screencastStub, {
        path: filePath,
        format: 'mp4',
        ffmpegPath: undefined,
        fps: undefined,
      });
      assert.strictEqual(
        context.getScreenRecorder()?.recorder,
        mockRecorder,
      );
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        `Screencast recording started. The recording will be saved to ${filePath}. Use screencast_stop to stop recording.`,
      );
    });

    it('records WebM for an uppercase extension (case-insensitive)', async () => {
      const {page, context, response} = createHandlerMocks();
      const mockRecorder = createMockScreenRecorder();
      const screencastStub = page.pptrPage.screencast;
      screencastStub.resolves(mockRecorder);

      const requestedPath = path.join(os.tmpdir(), 'test-recording.WEBM');
      const expectedPath = path.join(
        os.tmpdir(),
        'test-recording.webm',
      ) as `${string}.webm`;
      await startScreencast().handler(
        {
          params: {filePath: requestedPath},
          page,
        },
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(screencastStub, {
        path: expectedPath,
        format: 'webm',
        ffmpegPath: undefined,
        fps: undefined,
      });
    });

    it('rejects an unsupported extension instead of silently using mp4', async () => {
      const {page, context, response} = createHandlerMocks();
      const screencastStub = page.pptrPage.screencast;

      await assert.rejects(
        startScreencast().handler(
          {
            params: {filePath: path.join(os.tmpdir(), 'recording.avi')},
            page,
          },
          response,
          context,
        ),
        /Unsupported screencast file extension/,
      );

      sinon.assert.notCalled(screencastStub);
      assert.strictEqual(context.getScreenRecorder(), null);
    });

    it('starts a screencast recording with temp file when no filePath', async () => {
      const {page, context, response} = createHandlerMocks();
      const mockRecorder = createMockScreenRecorder();
      const screencastStub = page.pptrPage.screencast;
      screencastStub.resolves(mockRecorder);

      await startScreencast().handler(
        {params: {}, page},
        response,
        context,
      );

      sinon.assert.calledOnce(screencastStub);
      const callArgs = screencastStub.firstCall.args[0];
      assert.ok(callArgs);
      assert.ok(callArgs.path?.endsWith('.mp4'));
      assert.strictEqual(callArgs.format, 'mp4');
      assert.strictEqual(context.getScreenRecorder()?.recorder, mockRecorder);
    });

    it('errors if a recording is already active', async () => {
      const {page, context, response} = createHandlerMocks();
      const mockRecorder = createMockScreenRecorder();
      context.setScreenRecorder({
        recorder: mockRecorder,
        filePath: path.join(os.tmpdir(), 'existing.mp4'),
      });

      const screencastStub = page.pptrPage.screencast;

      await startScreencast().handler(
        {params: {}, page},
        response,
        context,
      );

      sinon.assert.notCalled(screencastStub);
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Error: a screencast recording is already in progress. Use screencast_stop to stop it before starting a new one.',
      );
    });

    it('provides a clear error when ffmpeg is not found', async () => {
      const {page, context, response} = createHandlerMocks();
      const error = new Error('spawn ffmpeg ENOENT');
      page.pptrPage.screencast.rejects(error);

      await assert.rejects(
        startScreencast().handler(
          {
            params: {filePath: path.join(os.tmpdir(), 'test.mp4')},
            page,
          },
          response,
          context,
        ),
        /ffmpeg is required for screencast recording/,
      );

      assert.strictEqual(context.getScreenRecorder(), null);
    });

    it('cleans up the generated temp directory if recording fails to start', async () => {
      const {page, context, response} = createHandlerMocks();
      const screencastStub = page.pptrPage.screencast;
      screencastStub.rejects(new Error('spawn ffmpeg ENOENT'));

      await assert.rejects(
        startScreencast().handler(
          {params: {}, page},
          response,
          context,
        ),
        /ffmpeg is required for screencast recording/,
      );

      const tempPath = screencastStub.firstCall.args[0]?.path;
      assert.ok(tempPath);
      await assert.rejects(fs.access(path.dirname(tempPath)));
      assert.strictEqual(context.getScreenRecorder(), null);
    });

    it('passes ffmpegPath from args to puppeteer', async () => {
      const {page, context, response} = createHandlerMocks();
      const mockRecorder = createMockScreenRecorder();
      const screencastStub = page.pptrPage.screencast;
      screencastStub.resolves(mockRecorder);

      const experimentalFfmpegPath = '/custom/path/to/ffmpeg';
      const args = parseArguments('test', [
        'node',
        'test',
        '--experimental-screencast',
        `--experimental-ffmpeg-path=${experimentalFfmpegPath}`,
      ]);
      await startScreencast(args).handler(
        {params: {}, page},
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(screencastStub, {
        path: screencastStub.firstCall.args[0]?.path,
        format: 'mp4',
        ffmpegPath: experimentalFfmpegPath,
        fps: undefined,
      });
    });

    it('passes screencast fps from args to puppeteer', async () => {
      const {page, context, response} = createHandlerMocks();
      const mockRecorder = createMockScreenRecorder();
      const screencastStub = page.pptrPage.screencast;
      screencastStub.resolves(mockRecorder);

      const args = parseArguments('test', [
        'node',
        'test',
        '--experimental-screencast',
        '--experimental-screencast-fps=10',
      ]);
      await startScreencast(args).handler(
        {params: {}, page},
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(screencastStub, {
        path: screencastStub.firstCall.args[0]?.path,
        format: 'mp4',
        ffmpegPath: undefined,
        fps: 10,
      });
    });
  });

  describe('screencast_stop', () => {
    it('returns an error message if no recording is active', async () => {
      const {page, context, response} = createHandlerMocks();
      assert.strictEqual(context.getScreenRecorder(), null);
      await stopScreencast.handler(
        {params: {}, page},
        response,
        context,
      );
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Error: no active screencast recording to stop.',
      );
    });

    it('stops an active recording and reports the file path', async () => {
      const {page, context, response} = createHandlerMocks();
      const mockRecorder = createMockScreenRecorder();
      const filePath = path.join(os.tmpdir(), 'test-recording.mp4');
      context.setScreenRecorder({
        recorder: mockRecorder,
        filePath,
      });

      await stopScreencast.handler(
        {params: {}, page},
        response,
        context,
      );

      sinon.assert.calledOnce(mockRecorder.stop);
      assert.strictEqual(context.getScreenRecorder(), null);
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        `The screencast recording has been stopped and saved to ${filePath}.`,
      );
    });

    it('clears the recorder even if stop() throws', async () => {
      const {page, context, response} = createHandlerMocks();
      const mockRecorder = createMockScreenRecorder();
      mockRecorder.stop.rejects(new Error('ffmpeg process error'));
      context.setScreenRecorder({
        recorder: mockRecorder,
        filePath: path.join(os.tmpdir(), 'test.mp4'),
      });

      await assert.rejects(
        stopScreencast.handler(
          {params: {}, page},
          response,
          context,
        ),
        /ffmpeg process error/,
      );

      sinon.assert.calledOnce(mockRecorder.stop);
      assert.strictEqual(context.getScreenRecorder(), null);
    });
  });
});
