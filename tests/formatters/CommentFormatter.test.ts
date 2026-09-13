/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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

  function formatterTest(
    label: string,
    setup: (t: it.TestContext) => CommentFormatter | Promise<CommentFormatter>,
  ) {
    it(label + ' toString', async t => {
      const formatter = await setup(t);
      t.assert.snapshot(formatter.toString());
    });
    it(label + ' toJSON', async t => {
      const formatter = await setup(t);
      t.assert.snapshot(JSON.stringify(formatter.toJSON(), null, 2));
    });
  }

  formatterTest('formats empty comments list', () => {
    return new CommentFormatter([]);
  });

  formatterTest('formats comments with targets and editor locations', () => {
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
    return new CommentFormatter([thread]);
  });

  formatterTest('formats editor location when filePath is missing', () => {
    const thread: StructuredCommentThread = {
      id: 'comment-2',
      text: 'Review this script line',
      editor: {
        lineNumber: 25,
      },
    };
    return new CommentFormatter([thread]);
  });

  it('formats single thread using static formatThread', t => {
    const thread: StructuredCommentThread = {
      id: 'comment-3',
      text: 'Check padding',
      elementUid: 'node-99',
    };
    t.assert.snapshot(CommentFormatter.formatThread(thread));
  });

  formatterTest('resolves targets using from() method', async () => {
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

    return formatter;
  });

  formatterTest(
    'omits unresolved targets when from() resolves undefined',
    async () => {
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

      return formatter;
    },
  );
});
