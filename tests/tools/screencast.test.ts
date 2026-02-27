/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it, afterEach} from 'node:test';

import sinon from 'sinon';

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
        const selectedPage = context.getSelectedPage();
        const screencastStub = sinon
          .stub(selectedPage, 'screencast')
          .resolves(mockRecorder as never);

        await startScreencast.handler(
          {
            params: {path: '/tmp/test-recording.mp4'},
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

    it('starts a screencast recording with temp file when no filePath', async () => {
      await withMcpContext(async (response, context) => {
        const mockRecorder = createMockRecorder();
        const selectedPage = context.getSelectedPage();
        const screencastStub = sinon
          .stub(selectedPage, 'screencast')
          .resolves(mockRecorder as never);

        await startScreencast.handler(
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
          filePath: '/tmp/existing.mp4',
        });

        const selectedPage = context.getSelectedPage();
        const screencastStub = sinon.stub(selectedPage, 'screencast');

        await startScreencast.handler(
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
        const selectedPage = context.getSelectedPage();
        const error = new Error('spawn ffmpeg ENOENT');
        sinon.stub(selectedPage, 'screencast').rejects(error);

        await assert.rejects(
          startScreencast.handler(
            {
              params: {path: '/tmp/test.mp4'},
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
  });

  describe('screencast_stop', () => {
    it('does nothing if no recording is active', async () => {
      await withMcpContext(async (response, context) => {
        assert.strictEqual(context.getScreenRecorder(), null);
        await stopScreencast.handler(
          {params: {}, page: context.getSelectedMcpPage()},
          response,
          context,
        );
        assert.strictEqual(response.responseLines.length, 0);
      });
    });

    it('stops an active recording and reports the file path', async () => {
      await withMcpContext(async (response, context) => {
        const mockRecorder = createMockRecorder();
        const filePath = '/tmp/test-recording.mp4';
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
            .includes('stopped and saved to /tmp/test-recording.mp4'),
        );
      });
    });

    it('clears the recorder even if stop() throws', async () => {
      await withMcpContext(async (response, context) => {
        const mockRecorder = createMockRecorder();
        mockRecorder.stop.rejects(new Error('ffmpeg process error'));
        context.setScreenRecorder({
          recorder: mockRecorder as never,
          filePath: '/tmp/test.mp4',
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
