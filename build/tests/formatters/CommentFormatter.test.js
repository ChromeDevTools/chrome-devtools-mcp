/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, describe, it } from 'node:test';
import sinon from 'sinon';
import { CommentFormatter, } from '../../src/formatters/CommentFormatter.js';
describe('CommentFormatter', () => {
    afterEach(() => {
        sinon.restore();
    });
    function formatterTest(label, setup) {
        it(label + ' toString', async (t) => {
            const formatter = await setup(t);
            t.assert.snapshot(formatter.toString());
        });
        it(label + ' toJSON', async (t) => {
            const formatter = await setup(t);
            t.assert.snapshot(JSON.stringify(formatter.toJSON(), null, 2));
        });
    }
    formatterTest('formats empty comments list', () => {
        return new CommentFormatter([]);
    });
    formatterTest('formats comments with targets and editor locations', () => {
        const thread = {
            id: 'comment-1',
            text: 'Fix the color contrast here',
            elementUid: 'element-uid-42',
            reqid: 7,
        };
        return new CommentFormatter([thread]);
    });
    it('formats single thread using static formatThread', t => {
        const thread = {
            id: 'comment-3',
            text: 'Check padding',
            elementUid: 'node-99',
        };
        t.assert.snapshot(CommentFormatter.formatThread(thread));
    });
    formatterTest('resolves targets using from() method', async () => {
        const rawThread = {
            id: 'comment-1',
            text: 'Fix the color contrast here',
            node: {
                backendNodeId: 42,
                targetId: 'target-1',
            },
            networkRequestId: 'req-99',
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
    formatterTest('omits unresolved targets when from() resolves undefined', async () => {
        const rawThread = {
            id: 'comment-2',
            text: 'Fix heading font size',
            node: {
                backendNodeId: 42,
                targetId: 'target-1',
            },
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
    });
});
//# sourceMappingURL=CommentFormatter.test.js.map