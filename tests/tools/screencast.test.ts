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
import {ScreenRecorder} from '../../src/third_party/index.js';
import {startScreencast, stopScreencast} from '../../src/tools/screencast.js';
import {createHandlerMocks} from '../mocks.js';

function createMockScreenRecorder(): sinon.SinonStubbedInstance<ScreenRecorder> {
  return sinon.createStubInstance(ScreenRecorder);
}

function createScreencastMocks() {
  const {page, context, response} = createHandlerMocks();
  const mockRecorder = createMockScreenRecorder();
  page.pptrPage.screencast.resolves(mockRecorder);
  return {page, context, response, mockRecorder};
}

describe('screencast', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('screencast_start', () => {
    it('starts a screencast recording with filePath', async () => {
      const {page, context, response, mockRecorder} = createScreencastMocks();

      const filePath = path.join(
        os.tmpdir(),
        'test-recording.mp4',
      ) as `${string}.mp4`;
      context.ensureExtension.resolves(filePath as never);

      await startScreencast().handler(
        {
          params: {filePath},
          page,
        },
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(page.pptrPage.screencast, {
        path: filePath,
        format: 'mp4',
        ffmpegPath: undefined,
        fps: undefined,
      });
      assert.strictEqual(context.getScreenRecorder()?.recorder, mockRecorder);
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        `Screencast recording started. The recording will be saved to ${filePath}. Use screencast_stop to stop recording.`,
      );
    });

    it('records WebM for an uppercase extension (case-insensitive)', async () => {
      const {page, context, response} = createScreencastMocks();

      const requestedPath = path.join(os.tmpdir(), 'test-recording.WEBM');
      const expectedPath = path.join(
        os.tmpdir(),
        'test-recording.webm',
      ) as `${string}.webm`;
      context.ensureExtension.resolves(expectedPath as never);

      await startScreencast().handler(
        {
          params: {filePath: requestedPath},
          page,
        },
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(page.pptrPage.screencast, {
        path: expectedPath,
        format: 'webm',
        ffmpegPath: undefined,
        fps: undefined,
      });
    });

    it('rejects an unsupported extension instead of silently using mp4', async () => {
      const {page, context, response} = createScreencastMocks();

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

      sinon.assert.notCalled(page.pptrPage.screencast);
      assert.strictEqual(context.getScreenRecorder(), null);
    });

    it('starts a screencast recording with temp file when no filePath', async () => {
      const {page, context, response, mockRecorder} = createScreencastMocks();
      const expectedPath = path.join(
        os.tmpdir(),
        'temp-screencast.mp4',
      ) as `${string}.mp4`;
      context.ensureExtension.resolves(expectedPath as never);

      await startScreencast().handler({params: {}, page}, response, context);

      sinon.assert.calledOnce(page.pptrPage.screencast);
      const callArgs = page.pptrPage.screencast.firstCall.args[0];
      assert.ok(callArgs);
      assert.ok(callArgs.path?.endsWith('.mp4'));
      assert.strictEqual(callArgs.format, 'mp4');
      assert.strictEqual(context.getScreenRecorder()?.recorder, mockRecorder);
    });

    it('errors if a recording is already active', async () => {
      const {page, context, response, mockRecorder} = createScreencastMocks();
      context.setScreenRecorder({
        recorder: mockRecorder,
        filePath: path.join(os.tmpdir(), 'existing.mp4'),
      });

      await startScreencast().handler({params: {}, page}, response, context);

      sinon.assert.notCalled(page.pptrPage.screencast);
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Error: a screencast recording is already in progress. Use screencast_stop to stop it before starting a new one.',
      );
    });

    it('provides a clear error when ffmpeg is not found', async () => {
      const {page, context, response} = createScreencastMocks();
      const filePath = path.join(os.tmpdir(), 'test.mp4') as `${string}.mp4`;
      context.ensureExtension.resolves(filePath as never);
      page.pptrPage.screencast.rejects(new Error('spawn ffmpeg ENOENT'));

      await assert.rejects(
        startScreencast().handler(
          {
            params: {filePath},
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
      const {page, context, response} = createScreencastMocks();
      context.ensureExtension.callsFake(async filePath => filePath as never);
      page.pptrPage.screencast.rejects(new Error('spawn ffmpeg ENOENT'));

      await assert.rejects(
        startScreencast().handler({params: {}, page}, response, context),
        /ffmpeg is required for screencast recording/,
      );

      const tempPath = page.pptrPage.screencast.firstCall.args[0]?.path;
      assert.ok(tempPath);
      await assert.rejects(fs.access(path.dirname(tempPath)));
      assert.strictEqual(context.getScreenRecorder(), null);
    });

    it('passes ffmpegPath from args to puppeteer', async () => {
      const {page, context, response} = createScreencastMocks();
      const filePath = path.join(os.tmpdir(), 'test.mp4') as `${string}.mp4`;
      context.ensureExtension.resolves(filePath as never);

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

      sinon.assert.calledOnceWithExactly(page.pptrPage.screencast, {
        path: filePath,
        format: 'mp4',
        ffmpegPath: experimentalFfmpegPath,
        fps: undefined,
      });
    });

    it('passes screencast fps from args to puppeteer', async () => {
      const {page, context, response} = createScreencastMocks();
      const filePath = path.join(os.tmpdir(), 'test.mp4') as `${string}.mp4`;
      context.ensureExtension.resolves(filePath as never);

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

      sinon.assert.calledOnceWithExactly(page.pptrPage.screencast, {
        path: filePath,
        format: 'mp4',
        ffmpegPath: undefined,
        fps: 10,
      });
    });
  });

  describe('screencast_stop', () => {
    it('returns an error message if no recording is active', async () => {
      const {page, context, response} = createScreencastMocks();
      assert.strictEqual(context.getScreenRecorder(), null);
      await stopScreencast.handler({params: {}, page}, response, context);
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Error: no active screencast recording to stop.',
      );
    });

    it('stops an active recording and reports the file path', async () => {
      const {page, context, response, mockRecorder} = createScreencastMocks();
      const filePath = path.join(os.tmpdir(), 'test-recording.mp4');
      context.setScreenRecorder({
        recorder: mockRecorder,
        filePath,
      });

      await stopScreencast.handler({params: {}, page}, response, context);

      sinon.assert.calledOnce(mockRecorder.stop);
      assert.strictEqual(context.getScreenRecorder(), null);
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        `The screencast recording has been stopped and saved to ${filePath}.`,
      );
    });

    it('clears the recorder even if stop() throws', async () => {
      const {page, context, response, mockRecorder} = createScreencastMocks();
      mockRecorder.stop.rejects(new Error('ffmpeg process error'));
      context.setScreenRecorder({
        recorder: mockRecorder,
        filePath: path.join(os.tmpdir(), 'test.mp4'),
      });

      await assert.rejects(
        stopScreencast.handler({params: {}, page}, response, context),
        /ffmpeg process error/,
      );

      sinon.assert.calledOnce(mockRecorder.stop);
      assert.strictEqual(context.getScreenRecorder(), null);
    });
  });
});
