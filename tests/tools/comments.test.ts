/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {DevToolsCommentBridge} from '../../src/devtools/DevToolsCommentBridge.js';
import type {CommentThreadPayload} from '../../src/tools/comments.js';
import {
  getDevtoolsComments,
  openDevtools,
  resolveDevtoolsComment,
  revealInDevtools,
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
  describe('get_devtools_comments', () => {
    it('reports error when DevTools window is not open', async t => {
      const {page, context, response, args} = createHandlerMocks();
      const lines = trackResponseLines(response);
      page.getDevToolsPage.resolves(undefined);

      await getDevtoolsComments(args).handler(
        {params: {}, page},
        response,
        context,
      );

      sinon.assert.calledOnce(page.getDevToolsPage);
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'DevTools window is not open for this page. Call open_devtools first to open DevTools.',
      );
      sinon.assert.notCalled(response.setDevToolsComments);
      t.assert.snapshot(lines.join('\n'));
    });

    it('fetches comments and sets them on response', async () => {
      const {page, context, response, args} = createHandlerMocks();
      const devtoolsPage = createMockPuppeteerPage();
      const bridge = sinon.createStubInstance(DevToolsCommentBridge);
      page.getDevToolsPage.resolves(devtoolsPage);
      page.ensureDevToolsCommentBridge.resolves(bridge);

      const mockThread: CommentThreadPayload = {
        id: 'comment-1',
        text: 'Fix the color contrast here',
        node: {
          backendNodeId: 42,
          targetId: 'target-1',
        },
        networkRequestId: 'req-99',
      };

      bridge.getComments.resolves([mockThread]);

      await getDevtoolsComments(args).handler(
        {params: {}, page},
        response,
        context,
      );

      sinon.assert.calledOnce(page.getDevToolsPage);
      sinon.assert.calledOnceWithExactly(
        page.ensureDevToolsCommentBridge,
        devtoolsPage,
      );
      sinon.assert.calledOnceWithExactly(bridge.getComments, devtoolsPage);
      sinon.assert.notCalled(bridge.waitForCommentEvent);
      sinon.assert.notCalled(response.appendResponseLine);
      sinon.assert.calledOnceWithExactly(response.setDevToolsComments, [
        mockThread,
      ]);
    });

    it('runs the handler unlocked while waiting', () => {
      const {args} = createHandlerMocks();
      assert.strictEqual(getDevtoolsComments(args).concurrency, 'none');
    });

    it('waits for a comment event and fetches again', async () => {
      const {page, context, response, args} = createHandlerMocks();
      const devtoolsPage = createMockPuppeteerPage();
      const bridge = sinon.createStubInstance(DevToolsCommentBridge);
      page.getDevToolsPage.resolves(devtoolsPage);
      page.ensureDevToolsCommentBridge.resolves(bridge);
      const mockThread: CommentThreadPayload = {
        id: 'comment-2',
        text: 'Align the header',
      };
      bridge.getComments.onFirstCall().resolves([]);
      bridge.getComments.onSecondCall().resolves([mockThread]);
      bridge.waitForCommentEvent.resolves(true);

      await getDevtoolsComments(args).handler(
        {params: {timeout: 5_000}, page},
        response,
        context,
      );

      sinon.assert.calledTwice(bridge.getComments);
      sinon.assert.calledOnceWithExactly(
        bridge.waitForCommentEvent,
        sinon.match((value: number) => value > 0 && value <= 5_000),
      );
      sinon.assert.notCalled(response.appendResponseLine);
      sinon.assert.calledOnceWithExactly(response.setDevToolsComments, [
        mockThread,
      ]);
    });

    it('keeps waiting when an event yields no new threads', async () => {
      const clock = sinon.useFakeTimers();
      const {page, context, response, args} = createHandlerMocks();
      const devtoolsPage = createMockPuppeteerPage();
      const bridge = sinon.createStubInstance(DevToolsCommentBridge);
      page.getDevToolsPage.resolves(devtoolsPage);
      page.ensureDevToolsCommentBridge.resolves(bridge);
      bridge.getComments.resolves([]);
      bridge.waitForCommentEvent.onFirstCall().callsFake(async () => {
        clock.tick(2_000);
        return true;
      });
      bridge.waitForCommentEvent.onSecondCall().callsFake(async () => {
        clock.tick(3_000);
        return false;
      });

      await getDevtoolsComments(args).handler(
        {params: {timeout: 5_000}, page},
        response,
        context,
      );

      sinon.assert.calledTwice(bridge.getComments);
      sinon.assert.calledTwice(bridge.waitForCommentEvent);
      sinon.assert.calledWithExactly(
        bridge.waitForCommentEvent.secondCall,
        3_000,
      );
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Waited 5000ms for new DevTools comments. Call get_devtools_comments again to keep waiting.',
      );
      sinon.assert.notCalled(response.setDevToolsComments);
    });

    it('does not set comments after the wait times out', async () => {
      const clock = sinon.useFakeTimers();
      const {page, context, response, args} = createHandlerMocks();
      const devtoolsPage = createMockPuppeteerPage();
      const bridge = sinon.createStubInstance(DevToolsCommentBridge);
      page.getDevToolsPage.resolves(devtoolsPage);
      page.ensureDevToolsCommentBridge.resolves(bridge);
      bridge.getComments.resolves([]);
      bridge.waitForCommentEvent.callsFake(async () => {
        clock.tick(10_000);
        return false;
      });

      await getDevtoolsComments(args).handler(
        {params: {}, page},
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(bridge.getComments, devtoolsPage);
      sinon.assert.calledOnceWithExactly(bridge.waitForCommentEvent, 10_000);
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Waited 10000ms for new DevTools comments. Call get_devtools_comments again to keep waiting.',
      );
      sinon.assert.notCalled(response.setDevToolsComments);
    });

    it('reports the elapsed time when the wait ends early', async () => {
      const clock = sinon.useFakeTimers();
      const {page, context, response, args} = createHandlerMocks();
      const devtoolsPage = createMockPuppeteerPage();
      const bridge = sinon.createStubInstance(DevToolsCommentBridge);
      page.getDevToolsPage.resolves(devtoolsPage);
      page.ensureDevToolsCommentBridge.resolves(bridge);
      bridge.getComments.resolves([]);
      // The bridge was disposed before the deadline.
      bridge.waitForCommentEvent.callsFake(async () => {
        clock.tick(1_500);
        return false;
      });

      await getDevtoolsComments(args).handler(
        {params: {}, page},
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Waited 1500ms for new DevTools comments. Call get_devtools_comments again to keep waiting.',
      );
      sinon.assert.notCalled(response.setDevToolsComments);
    });

    it('does not wait when timeout is 0', async () => {
      const {page, context, response, args} = createHandlerMocks();
      const devtoolsPage = createMockPuppeteerPage();
      const bridge = sinon.createStubInstance(DevToolsCommentBridge);
      page.getDevToolsPage.resolves(devtoolsPage);
      page.ensureDevToolsCommentBridge.resolves(bridge);
      bridge.getComments.resolves([]);

      await getDevtoolsComments(args).handler(
        {params: {timeout: 0}, page},
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(bridge.getComments, devtoolsPage);
      sinon.assert.notCalled(bridge.waitForCommentEvent);
      sinon.assert.notCalled(response.appendResponseLine);
      sinon.assert.calledOnceWithExactly(response.setDevToolsComments, []);
    });

    it('reports when DevTools comments are unavailable', async t => {
      const {page, context, response, args} = createHandlerMocks();
      const lines = trackResponseLines(response);
      const devtoolsPage = createMockPuppeteerPage();
      page.getDevToolsPage.resolves(devtoolsPage);
      page.ensureDevToolsCommentBridge.resolves(undefined);

      await getDevtoolsComments(args).handler(
        {params: {}, page},
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(
        page.ensureDevToolsCommentBridge,
        devtoolsPage,
      );
      sinon.assert.calledOnce(response.appendResponseLine);
      t.assert.snapshot(lines.join('\n'));
      sinon.assert.notCalled(response.setDevToolsComments);
    });
  });

  describe('resolve_devtools_comment', () => {
    it('reports error when DevTools window is not open', async t => {
      const {page, context, response, args} = createHandlerMocks();
      const lines = trackResponseLines(response);
      page.getDevToolsPage.resolves(undefined);

      await resolveDevtoolsComment(args).handler(
        {params: {threadId: 'comment-1'}, page},
        response,
        context,
      );

      sinon.assert.calledOnce(page.getDevToolsPage);
      t.assert.snapshot(lines.join('\n'));
    });

    it('resolves comment thread and appends reply text', async t => {
      const {page, context, response, args} = createHandlerMocks();
      const lines = trackResponseLines(response);
      const devtoolsPage = createMockPuppeteerPage();
      page.getDevToolsPage.resolves(devtoolsPage);
      page.ensureDevToolsCommentBridge.resolves(
        sinon.createStubInstance(DevToolsCommentBridge),
      );
      devtoolsPage.evaluate.resolves(true);

      await resolveDevtoolsComment(args).handler(
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
      const {page, context, response, args} = createHandlerMocks();
      const lines = trackResponseLines(response);
      const devtoolsPage = createMockPuppeteerPage();
      page.getDevToolsPage.resolves(devtoolsPage);
      page.ensureDevToolsCommentBridge.resolves(
        sinon.createStubInstance(DevToolsCommentBridge),
      );
      devtoolsPage.evaluate.resolves(false);

      await resolveDevtoolsComment(args).handler(
        {params: {threadId: 'comment-nonexistent'}, page},
        response,
        context,
      );

      sinon.assert.calledOnce(devtoolsPage.evaluate);
      t.assert.snapshot(lines.join('\n'));
    });

    it('reports when DevTools comments are unavailable', async t => {
      const {page, context, response, args} = createHandlerMocks();
      const lines = trackResponseLines(response);
      const devtoolsPage = createMockPuppeteerPage();
      page.getDevToolsPage.resolves(devtoolsPage);
      page.ensureDevToolsCommentBridge.resolves(undefined);

      await resolveDevtoolsComment(args).handler(
        {params: {threadId: 'comment-1'}, page},
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(
        page.ensureDevToolsCommentBridge,
        devtoolsPage,
      );
      sinon.assert.calledOnce(response.appendResponseLine);
      t.assert.snapshot(lines.join('\n'));
      sinon.assert.notCalled(devtoolsPage.evaluate);
    });
  });

  describe('reveal_in_devtools', () => {
    it('reports error when DevTools window is not open', async t => {
      const {page, context, response, args} = createHandlerMocks();
      const lines = trackResponseLines(response);
      page.getDevToolsPage.resolves(undefined);

      await revealInDevtools(args).handler(
        {params: {panelName: 'elements'}, page},
        response,
        context,
      );

      sinon.assert.calledOnce(page.getDevToolsPage);
      t.assert.snapshot(lines.join('\n'));
    });

    it('reveals element by snapshot uid', async t => {
      const {page, context, response, args} = createHandlerMocks();
      const lines = trackResponseLines(response);
      const devtoolsPage = createMockPuppeteerPage();
      page.getDevToolsPage.resolves(devtoolsPage);
      page.ensureDevToolsCommentBridge.resolves(
        sinon.createStubInstance(DevToolsCommentBridge),
      );
      page.resolveUidToBackendNodeId.resolves({
        backendNodeId: 101,
        targetId: 'target-1',
      });
      devtoolsPage.evaluate.resolves(undefined);

      await revealInDevtools(args).handler(
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
      const {page, context, response, args} = createHandlerMocks();
      const lines = trackResponseLines(response);
      const devtoolsPage = createMockPuppeteerPage();
      page.getDevToolsPage.resolves(devtoolsPage);
      page.ensureDevToolsCommentBridge.resolves(
        sinon.createStubInstance(DevToolsCommentBridge),
      );
      page.resolveReqidToCdpRequestId.returns('cdp-req-123');
      devtoolsPage.evaluate.resolves(undefined);

      await revealInDevtools(args).handler(
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
      const {page, context, response, args} = createHandlerMocks();
      const lines = trackResponseLines(response);
      const devtoolsPage = createMockPuppeteerPage();
      page.getDevToolsPage.resolves(devtoolsPage);
      page.ensureDevToolsCommentBridge.resolves(
        sinon.createStubInstance(DevToolsCommentBridge),
      );
      page.resolveUidToBackendNodeId.resolves(undefined);
      page.resolveReqidToCdpRequestId.returns(undefined);
      devtoolsPage.evaluate.resolves(undefined);

      await revealInDevtools(args).handler(
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

    it('reveals element when panelName is omitted', async () => {
      const {page, context, response, args} = createHandlerMocks();
      const devtoolsPage = createMockPuppeteerPage();
      page.getDevToolsPage.resolves(devtoolsPage);
      page.ensureDevToolsCommentBridge.resolves(
        sinon.createStubInstance(DevToolsCommentBridge),
      );
      page.resolveUidToBackendNodeId.resolves({
        backendNodeId: 101,
        targetId: 'target-1',
      });
      devtoolsPage.evaluate.resolves(undefined);

      await revealInDevtools(args).handler(
        {
          params: {
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
      sinon.assert.calledWithExactly(
        response.appendResponseLine,
        'Revealed target (revealing element uid-header [backend node 101]) in DevTools.',
      );
    });

    it('reports when DevTools comments are unavailable', async t => {
      const {page, context, response, args} = createHandlerMocks();
      const lines = trackResponseLines(response);
      const devtoolsPage = createMockPuppeteerPage();
      page.getDevToolsPage.resolves(devtoolsPage);
      page.ensureDevToolsCommentBridge.resolves(undefined);

      await revealInDevtools(args).handler(
        {params: {panelName: 'elements', uid: 'uid-header'}, page},
        response,
        context,
      );

      sinon.assert.calledOnceWithExactly(
        page.ensureDevToolsCommentBridge,
        devtoolsPage,
      );
      sinon.assert.calledOnce(response.appendResponseLine);
      t.assert.snapshot(lines.join('\n'));
      sinon.assert.notCalled(page.resolveUidToBackendNodeId);
      sinon.assert.notCalled(devtoolsPage.evaluate);
    });
  });

  describe('open_devtools', () => {
    it('opens DevTools window successfully', async () => {
      const {page, context, response, args} = createHandlerMocks();
      const devtoolsPage = createMockPuppeteerPage();
      page.openDevTools.resolves(devtoolsPage);

      await openDevtools(args).handler({params: {}, page}, response, context);

      sinon.assert.calledOnce(page.openDevTools);
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'DevTools window opened successfully.',
      );
      sinon.assert.calledOnceWithExactly(response.setIncludePages, true);
    });

    it('reports failure when openDevTools throws', async () => {
      const {page, context, response, args} = createHandlerMocks();
      page.openDevTools.rejects(new Error('Connection closed'));

      await openDevtools(args).handler({params: {}, page}, response, context);

      sinon.assert.calledOnce(page.openDevTools);
      sinon.assert.calledOnceWithExactly(
        response.appendResponseLine,
        'Failed to open DevTools: Connection closed',
      );
      sinon.assert.calledOnceWithExactly(response.setIncludePages, true);
    });
  });
});
