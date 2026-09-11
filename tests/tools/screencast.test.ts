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
  context.getScreenRecorder.returns(null);
  return {page, context, response, mockRecorder};
}

describe('screencast', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('screencast_start', () => {
    it('starts a screencast recording with filePath', async () => {
      const {page, context, response, mockRecorder} = createScreencastMocks();

      const filePath: `${string}.mp4` = `${path.join(
        os.tmpdir(),
        'test-recording',
      )}.mp4`;
      context.ensureExtension.resolves(filePath);

      await startScreencast().handler(
        {
          params: {filePath},
          page,
        },
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(
        context.ensureExtension,
        filePath,
        '.mp4',
      );
      sinon.assert.calledOnceWithExactly(page.pptrPage.screencast, {
        path: filePath,
        format: 'mp4',
        ffmpegPath: undefined,
        fps: undefined,
      });
      sinon.assert.calledOnceWithExactly(context.setScreenRecorder, {
        recorder: mockRecorder,
        filePath,
      });
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        `Screencast recording started. The recording will be saved to ${filePath}. Use screencast_stop to stop recording.`,
      );
    });

    it('records WebM for an uppercase extension (case-insensitive)', async () => {
      const {page, context, response, mockRecorder} = createScreencastMocks();

      const requestedPath = `${path.join(os.tmpdir(), 'test-recording')}.WEBM`;
      const expectedPath: `${string}.webm` = `${path.join(
        os.tmpdir(),
        'test-recording',
      )}.webm`;
      context.ensureExtension.resolves(expectedPath);

      await startScreencast().handler(
        {
          params: {filePath: requestedPath},
          page,
        },
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(
        context.ensureExtension,
        requestedPath,
        '.webm',
      );
      sinon.assert.calledOnceWithExactly(page.pptrPage.screencast, {
        path: expectedPath,
        format: 'webm',
        ffmpegPath: undefined,
        fps: undefined,
      });
      sinon.assert.calledOnceWithExactly(context.setScreenRecorder, {
        recorder: mockRecorder,
        filePath: expectedPath,
      });
    });

    it('rejects an unsupported extension instead of silently using mp4', async () => {
      const {page, context, response} = createScreencastMocks();
      const filePath = `${path.join(os.tmpdir(), 'recording')}.avi`;

      await assert.rejects(
        startScreencast().handler(
          {
            params: {filePath},
            page,
          },
          response,
          context,
        ),
        /Unsupported screencast file extension/,
      );

      sinon.assert.notCalled(context.ensureExtension);
      sinon.assert.notCalled(page.pptrPage.screencast);
      sinon.assert.notCalled(context.setScreenRecorder);
    });

    it('starts a screencast recording with temp file when no filePath', async () => {
      const {page, context, response, mockRecorder} = createScreencastMocks();
      const expectedPath: `${string}.mp4` = `${path.join(
        os.tmpdir(),
        'temp-screencast',
      )}.mp4`;
      context.ensureExtension.resolves(expectedPath);

      await startScreencast().handler({params: {}, page}, response, context);

      sinon.assert.calledOnce(context.ensureExtension);
      assert.ok(context.ensureExtension.firstCall.args[0].endsWith('.mp4'));
      assert.strictEqual(context.ensureExtension.firstCall.args[1], '.mp4');
      sinon.assert.calledOnceWithExactly(page.pptrPage.screencast, {
        path: expectedPath,
        format: 'mp4',
        ffmpegPath: undefined,
        fps: undefined,
      });
      sinon.assert.calledOnceWithExactly(context.setScreenRecorder, {
        recorder: mockRecorder,
        filePath: expectedPath,
      });
    });

    it('errors if a recording is already active', async () => {
      const {page, context, response, mockRecorder} = createScreencastMocks();
      context.getScreenRecorder.returns({
        recorder: mockRecorder,
        filePath: `${path.join(os.tmpdir(), 'existing')}.mp4`,
      });

      await startScreencast().handler({params: {}, page}, response, context);

      sinon.assert.notCalled(context.ensureExtension);
      sinon.assert.notCalled(page.pptrPage.screencast);
      sinon.assert.notCalled(context.setScreenRecorder);
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Error: a screencast recording is already in progress. Use screencast_stop to stop it before starting a new one.',
      );
    });

    it('provides a clear error when ffmpeg is not found', async () => {
      const {page, context, response} = createScreencastMocks();
      const filePath: `${string}.mp4` = `${path.join(os.tmpdir(), 'test')}.mp4`;
      context.ensureExtension.resolves(filePath);
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

      sinon.assert.calledOnceWithExactly(
        context.ensureExtension,
        filePath,
        '.mp4',
      );
      sinon.assert.notCalled(context.setScreenRecorder);
    });

    it('cleans up the generated temp directory if recording fails to start', async () => {
      const {page, context, response} = createScreencastMocks();
      context.ensureExtension.callsFake(async filePath => `${filePath}.mp4`);
      page.pptrPage.screencast.rejects(new Error('spawn ffmpeg ENOENT'));

      await assert.rejects(
        startScreencast().handler({params: {}, page}, response, context),
        /ffmpeg is required for screencast recording/,
      );

      const tempPath = page.pptrPage.screencast.firstCall.args[0]?.path;
      assert.ok(tempPath);
      await assert.rejects(fs.access(path.dirname(tempPath)));
      sinon.assert.notCalled(context.setScreenRecorder);
    });

    it('passes ffmpegPath from args to puppeteer', async () => {
      const {page, context, response, mockRecorder} = createScreencastMocks();
      const filePath: `${string}.mp4` = `${path.join(os.tmpdir(), 'test')}.mp4`;
      context.ensureExtension.resolves(filePath);

      const experimentalFfmpegPath = '/custom/path/to/ffmpeg';
      const args = parseArguments('test', [
        'node',
        'test',
        '--experimental-screencast',
        `--experimental-ffmpeg-path=${experimentalFfmpegPath}`,
      ]);
      await startScreencast(args).handler(
        {params: {filePath}, page},
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(
        context.ensureExtension,
        filePath,
        '.mp4',
      );
      sinon.assert.calledOnceWithExactly(page.pptrPage.screencast, {
        path: filePath,
        format: 'mp4',
        ffmpegPath: experimentalFfmpegPath,
        fps: undefined,
      });
      sinon.assert.calledOnceWithExactly(context.setScreenRecorder, {
        recorder: mockRecorder,
        filePath,
      });
    });

    it('passes screencast fps from args to puppeteer', async () => {
      const {page, context, response, mockRecorder} = createScreencastMocks();
      const filePath: `${string}.mp4` = `${path.join(os.tmpdir(), 'test')}.mp4`;
      context.ensureExtension.resolves(filePath);

      const args = parseArguments('test', [
        'node',
        'test',
        '--experimental-screencast',
        '--experimental-screencast-fps=10',
      ]);
      await startScreencast(args).handler(
        {params: {filePath}, page},
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(
        context.ensureExtension,
        filePath,
        '.mp4',
      );
      sinon.assert.calledOnceWithExactly(page.pptrPage.screencast, {
        path: filePath,
        format: 'mp4',
        ffmpegPath: undefined,
        fps: 10,
      });
      sinon.assert.calledOnceWithExactly(context.setScreenRecorder, {
        recorder: mockRecorder,
        filePath,
      });
    });
  });

  describe('screencast_stop', () => {
    it('returns an error message if no recording is active', async () => {
      const {page, context, response} = createScreencastMocks();
      await stopScreencast.handler({params: {}, page}, response, context);
      sinon.assert.notCalled(context.setScreenRecorder);
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Error: no active screencast recording to stop.',
      );
    });

    it('stops an active recording and reports the file path', async () => {
      const {page, context, response, mockRecorder} = createScreencastMocks();
      const filePath = `${path.join(os.tmpdir(), 'test-recording')}.mp4`;
      context.getScreenRecorder.returns({
        recorder: mockRecorder,
        filePath,
      });

      await stopScreencast.handler({params: {}, page}, response, context);

      sinon.assert.calledOnce(mockRecorder.stop);
      sinon.assert.calledOnceWithExactly(context.setScreenRecorder, null);
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        `The screencast recording has been stopped and saved to ${filePath}.`,
      );
    });

    it('clears the recorder even if stop() throws', async () => {
      const {page, context, response, mockRecorder} = createScreencastMocks();
      mockRecorder.stop.rejects(new Error('ffmpeg process error'));
      const filePath = `${path.join(os.tmpdir(), 'test')}.mp4`;
      context.getScreenRecorder.returns({
        recorder: mockRecorder,
        filePath,
      });

      await assert.rejects(
        stopScreencast.handler({params: {}, page}, response, context),
        /ffmpeg process error/,
      );

      sinon.assert.calledOnce(mockRecorder.stop);
      sinon.assert.calledOnceWithExactly(context.setScreenRecorder, null);
    });
  });
});
