/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import type {CommentThreadPayload} from '../../src/tools/comments.js';
import {
  getDevtoolsComments,
  revealDevtoolsTarget,
  updateDevtoolsComment,
} from '../../src/tools/comments.js';
import {createHandlerMocks, createMockPuppeteerPage} from '../mocks.js';

function trackResponseLines(
  response: ReturnType<typeof createHandlerMocks>['response'],
): string[] {
  const lines: string[] = [];
  response.appendResponseLine.callsFake((line: string) => {
    lines.push(line);
  });
  return lines;
}

describe('comments tools', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('get_devtools_comments', () => {
    it('reports error when DevTools window is not open', async t => {
      const {page, context, response} = createHandlerMocks();
      const lines = trackResponseLines(response);
      page.getDevToolsPage.resolves(undefined);

      await getDevtoolsComments.handler({params: {}, page}, response, context);

      sinon.assert.calledOnce(page.getDevToolsPage);
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'DevTools window is not open for this page. Call open_devtools first to open DevTools.',
      );
      t.assert.snapshot(lines.join('\n'));
    });

    it('reports message when no comments are found', async t => {
      const {page, context, response} = createHandlerMocks();
      const lines = trackResponseLines(response);
      const devtoolsPage = createMockPuppeteerPage();
      page.getDevToolsPage.resolves(devtoolsPage);
      devtoolsPage.evaluate.resolves([]);

      await getDevtoolsComments.handler({params: {}, page}, response, context);

      sinon.assert.calledOnce(page.getDevToolsPage);
      sinon.assert.calledOnce(devtoolsPage.evaluate);
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'No open DevTools comments found.',
      );
      t.assert.snapshot(lines.join('\n'));
    });

    it('formats comment threads with text, targets, and editor location', async t => {
      const {page, context, response} = createHandlerMocks();
      const lines = trackResponseLines(response);
      const devtoolsPage = createMockPuppeteerPage();
      page.getDevToolsPage.resolves(devtoolsPage);
      page.resolveBackendNodeId.resolves('element-uid-42');
      page.resolveCdpRequestId.returns(7);

      const mockThread: CommentThreadPayload = {
        id: 'comment-1',
        text: 'Fix the color contrast here',
        backendNodeId: 42,
        networkRequestId: 'req-99',
        editor: {
          filePath: 'src/style.css',
          lineNumber: 10,
        },
      };

      devtoolsPage.evaluate.resolves([mockThread]);

      await getDevtoolsComments.handler({params: {}, page}, response, context);

      sinon.assert.calledOnce(page.getDevToolsPage);
      sinon.assert.calledOnce(devtoolsPage.evaluate);
      sinon.assert.calledOnceWithExactly(page.resolveBackendNodeId, 42);
      sinon.assert.calledOnceWithExactly(page.resolveCdpRequestId, 'req-99');
      t.assert.snapshot(lines.join('\n'));
    });

    it('falls back to backendNodeId and networkRequestId if resolution returns undefined', async t => {
      const {page, context, response} = createHandlerMocks();
      const lines = trackResponseLines(response);
      const devtoolsPage = createMockPuppeteerPage();
      page.getDevToolsPage.resolves(devtoolsPage);
      page.resolveBackendNodeId.resolves(undefined);
      page.resolveCdpRequestId.returns(undefined);

      const mockThread: CommentThreadPayload = {
        id: 'comment-2',
        text: 'Fix heading font size',
        backendNodeId: 42,
        networkRequestId: 'req-99',
      };

      devtoolsPage.evaluate.resolves([mockThread]);

      await getDevtoolsComments.handler({params: {}, page}, response, context);

      t.assert.snapshot(lines.join('\n'));
    });
  });

  describe('update_devtools_comment', () => {
    it('reports error when DevTools window is not open', async t => {
      const {page, context, response} = createHandlerMocks();
      const lines = trackResponseLines(response);
      page.getDevToolsPage.resolves(undefined);

      await updateDevtoolsComment.handler(
        {params: {threadId: 'comment-1'}, page},
        response,
        context,
      );

      sinon.assert.calledOnce(page.getDevToolsPage);
      t.assert.snapshot(lines.join('\n'));
    });

    it('resolves comment thread and appends reply text', async t => {
      const {page, context, response} = createHandlerMocks();
      const lines = trackResponseLines(response);
      const devtoolsPage = createMockPuppeteerPage();
      page.getDevToolsPage.resolves(devtoolsPage);
      devtoolsPage.evaluate.resolves(true);

      await updateDevtoolsComment.handler(
        {
          params: {
            threadId: 'comment-1',
            replyText: 'Updated background color in index.css',
          },
          page,
        },
        response,
        context,
      );

      sinon.assert.calledOnce(devtoolsPage.evaluate);
      t.assert.snapshot(lines.join('\n'));
    });

    it('reports error when thread is not found', async t => {
      const {page, context, response} = createHandlerMocks();
      const lines = trackResponseLines(response);
      const devtoolsPage = createMockPuppeteerPage();
      page.getDevToolsPage.resolves(devtoolsPage);
      devtoolsPage.evaluate.resolves(false);

      await updateDevtoolsComment.handler(
        {params: {threadId: 'comment-nonexistent'}, page},
        response,
        context,
      );

      sinon.assert.calledOnce(devtoolsPage.evaluate);
      t.assert.snapshot(lines.join('\n'));
    });
  });

  describe('reveal_devtools_target', () => {
    it('reports error when DevTools window is not open', async t => {
      const {page, context, response} = createHandlerMocks();
      const lines = trackResponseLines(response);
      page.getDevToolsPage.resolves(undefined);

      await revealDevtoolsTarget.handler(
        {params: {panelName: 'elements'}, page},
        response,
        context,
      );

      sinon.assert.calledOnce(page.getDevToolsPage);
      t.assert.snapshot(lines.join('\n'));
    });

    it('reveals element and navigates panel', async t => {
      const {page, context, response} = createHandlerMocks();
      const lines = trackResponseLines(response);
      const devtoolsPage = createMockPuppeteerPage();
      page.getDevToolsPage.resolves(devtoolsPage);
      devtoolsPage.evaluate.resolves(undefined);

      await revealDevtoolsTarget.handler(
        {
          params: {
            panelName: 'elements',
            backendNodeId: 101,
          },
          page,
        },
        response,
        context,
      );

      sinon.assert.calledOnce(devtoolsPage.evaluate);
      t.assert.snapshot(lines.join('\n'));
    });

    it('reveals element by snapshot uid', async t => {
      const {page, context, response} = createHandlerMocks();
      const lines = trackResponseLines(response);
      const devtoolsPage = createMockPuppeteerPage();
      page.getDevToolsPage.resolves(devtoolsPage);
      page.resolveUidToBackendNodeId.resolves(101);
      devtoolsPage.evaluate.resolves(undefined);

      await revealDevtoolsTarget.handler(
        {
          params: {
            panelName: 'elements',
            uid: 'uid-header',
          },
          page,
        },
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(
        page.resolveUidToBackendNodeId,
        'uid-header',
      );
      sinon.assert.calledOnce(devtoolsPage.evaluate);
      t.assert.snapshot(lines.join('\n'));
    });

    it('reveals network request by reqid', async t => {
      const {page, context, response} = createHandlerMocks();
      const lines = trackResponseLines(response);
      const devtoolsPage = createMockPuppeteerPage();
      page.getDevToolsPage.resolves(devtoolsPage);
      page.resolveReqidToCdpRequestId.returns('cdp-req-123');
      devtoolsPage.evaluate.resolves(undefined);

      await revealDevtoolsTarget.handler(
        {
          params: {
            panelName: 'network',
            reqid: 5,
          },
          page,
        },
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(page.resolveReqidToCdpRequestId, 5);
      sinon.assert.calledOnce(devtoolsPage.evaluate);
      t.assert.snapshot(lines.join('\n'));
    });

    it('warns when snapshot uid or reqid cannot be resolved', async t => {
      const {page, context, response} = createHandlerMocks();
      const lines = trackResponseLines(response);
      const devtoolsPage = createMockPuppeteerPage();
      page.getDevToolsPage.resolves(devtoolsPage);
      page.resolveUidToBackendNodeId.resolves(undefined);
      page.resolveReqidToCdpRequestId.returns(undefined);
      devtoolsPage.evaluate.resolves(undefined);

      await revealDevtoolsTarget.handler(
        {
          params: {
            panelName: 'elements',
            uid: 'unknown-uid',
            reqid: 999,
          },
          page,
        },
        response,
        context,
      );

      t.assert.snapshot(lines.join('\n'));
    });
  });
});
