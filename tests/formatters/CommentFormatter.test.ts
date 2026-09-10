/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {
  CommentFormatter,
  type StructuredCommentThread,
} from '../../src/formatters/CommentFormatter.js';
import type {CD4ACommentThread} from '../../src/types.js';

describe('CommentFormatter', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('formats empty comments list', () => {
    const formatter = new CommentFormatter([]);
    assert.deepStrictEqual(formatter.toJSON(), []);
    assert.strictEqual(
      formatter.toString(),
      'No open DevTools comments found.',
    );
  });

  it('formats comments with targets and editor locations', () => {
    const thread: StructuredCommentThread = {
      id: 'comment-1',
      text: 'Fix the color contrast here',
      elementUid: 'element-uid-42',
      reqid: 7,
      editor: {
        filePath: 'src/style.css',
        lineNumber: 10,
      },
    };
    const formatter = new CommentFormatter([thread]);

    assert.deepStrictEqual(formatter.toJSON(), [thread]);
    const expected = [
      'Found 1 DevTools comment thread(s):',
      '\n### Thread: comment-1',
      '- Comment: Fix the color contrast here',
      '- Target element (snapshot UID): element-uid-42',
      '- Network request ID (reqid): 7',
      '- Editor location: src/style.css:10',
    ].join('\n');
    assert.strictEqual(formatter.toString(), expected);
  });

  it('formats editor location when filePath is missing', () => {
    const thread: StructuredCommentThread = {
      id: 'comment-2',
      text: 'Review this script line',
      editor: {
        lineNumber: 25,
      },
    };
    const formatter = new CommentFormatter([thread]);

    const expected = [
      'Found 1 DevTools comment thread(s):',
      '\n### Thread: comment-2',
      '- Comment: Review this script line',
      '- Editor location: line 25',
    ].join('\n');
    assert.strictEqual(formatter.toString(), expected);
  });

  it('formats single thread using static formatThread', () => {
    const thread: StructuredCommentThread = {
      id: 'comment-3',
      text: 'Check padding',
      elementUid: 'node-99',
    };
    const formatted = CommentFormatter.formatThread(thread);
    const expected = [
      '### Thread: comment-3',
      '- Comment: Check padding',
      '- Target element (snapshot UID): node-99',
    ].join('\n');
    assert.strictEqual(formatted, expected);
  });

  it('resolves targets using from() method', async () => {
    const rawThread: CD4ACommentThread = {
      id: 'comment-1',
      text: 'Fix the color contrast here',
      backendNodeId: 42,
      networkRequestId: 'req-99',
      editor: {
        filePath: 'src/style.css',
        lineNumber: 10,
      },
    };

    const resolveBackendNodeId = sinon.stub().resolves('element-uid-42');
    const resolveCdpRequestId = sinon.stub().returns(7);

    const formatter = await CommentFormatter.from([rawThread], {
      resolveBackendNodeId,
      resolveCdpRequestId,
    });

    sinon.assert.calledOnceWithExactly(resolveBackendNodeId, 42);
    sinon.assert.calledOnceWithExactly(resolveCdpRequestId, 'req-99');

    assert.deepStrictEqual(formatter.toJSON(), [
      {
        id: 'comment-1',
        text: 'Fix the color contrast here',
        elementUid: 'element-uid-42',
        reqid: 7,
        editor: {
          filePath: 'src/style.css',
          lineNumber: 10,
        },
      },
    ]);
  });

  it('omits unresolved targets when from() resolves undefined', async () => {
    const rawThread: CD4ACommentThread = {
      id: 'comment-2',
      text: 'Fix heading font size',
      backendNodeId: 42,
      networkRequestId: 'req-99',
    };

    const resolveBackendNodeId = sinon.stub().resolves(undefined);
    const resolveCdpRequestId = sinon.stub().returns(undefined);

    const formatter = await CommentFormatter.from([rawThread], {
      resolveBackendNodeId,
      resolveCdpRequestId,
    });

    sinon.assert.calledOnceWithExactly(resolveBackendNodeId, 42);
    sinon.assert.calledOnceWithExactly(resolveCdpRequestId, 'req-99');

    assert.deepStrictEqual(formatter.toJSON(), [
      {
        id: 'comment-2',
        text: 'Fix heading font size',
      },
    ]);
    const expected = [
      'Found 1 DevTools comment thread(s):',
      '\n### Thread: comment-2',
      '- Comment: Fix heading font size',
    ].join('\n');
    assert.strictEqual(formatter.toString(), expected);
  });
});
