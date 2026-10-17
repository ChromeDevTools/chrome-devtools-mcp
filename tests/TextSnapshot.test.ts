/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {TextSnapshot} from '../src/TextSnapshot.js';
import type {TextSnapshotNode} from '../src/types.js';

import {createMockAXNode, createMockMcpPage} from './mocks.js';
import {html, withMcpContext} from './utils.js';

describe('TextSnapshot', () => {
  afterEach(() => {
    sinon.restore();
    TextSnapshot.resetCounter();
  });

  it('does not assign uids to nodes without backendNodeId', async () => {
    const page = createMockMcpPage();
    page.uniqueBackendNodeIdToMcpId = new Map();
    page.extraHandles = [];
    const mockRoot = createMockAXNode('RootWebArea', {
      loaderId: '1',
      backendNodeId: 1,
      children: [
        createMockAXNode('paragraph', {
          loaderId: '1',
          backendNodeId: 2,
          children: [
            createMockAXNode('InlineTextBox', {
              name: 'alpha',
              loaderId: '1',
            }),
          ],
        }),
        createMockAXNode('paragraph', {
          loaderId: '1',
          backendNodeId: 3,
          children: [
            createMockAXNode('InlineTextBox', {
              name: 'beta',
              loaderId: '1',
            }),
          ],
        }),
      ],
    });
    page.pptrPage.accessibility.snapshot.resolves(mockRoot);

    const snapshot = await TextSnapshot.create(page, {verbose: true});
    const inlineNodes = [...snapshot.idToNode.values()].filter(
      node => node.role === 'InlineTextBox',
    );

    assert.strictEqual(inlineNodes.length, 0);

    const paragraph1 = snapshot.idToNode.get('1_1');
    assert.strictEqual(paragraph1?.role, 'paragraph');
    assert.strictEqual(paragraph1?.children[0]?.role, 'InlineTextBox');
    assert.strictEqual(paragraph1?.children[0]?.id, '');
    assert.strictEqual(paragraph1?.children[0]?.name, 'alpha');

    const paragraph2 = snapshot.idToNode.get('1_2');
    assert.strictEqual(paragraph2?.role, 'paragraph');
    assert.strictEqual(paragraph2?.children[0]?.role, 'InlineTextBox');
    assert.strictEqual(paragraph2?.children[0]?.id, '');
    assert.strictEqual(paragraph2?.children[0]?.name, 'beta');

    assert.strictEqual(
      page.uniqueBackendNodeIdToMcpId.has('1_undefined'),
      false,
    );
    assert.strictEqual(
      page.uniqueBackendNodeIdToMcpId.has('undefined_undefined'),
      false,
    );
  });

  it('creates a snapshot', async () => {
    await withMcpContext(async (_response, context) => {
      const page = context.getSelectedMcpPage();
      await page.pptrPage.setContent(html`<button>Click me</button>`);

      const snapshot = await TextSnapshot.create(page);

      assert.ok(snapshot);
      assert.strictEqual(snapshot.snapshotId, '1');
      assert.ok(snapshot.root);

      let foundButton = false;
      for (const node of snapshot.idToNode.values()) {
        if (node.role === 'button' && node.name === 'Click me') {
          foundButton = true;
          break;
        }
      }
      assert.ok(foundButton, 'Button should be in the snapshot');
    });
  });

  it('inserts extraHandles into the snapshot correctly', async () => {
    await withMcpContext(async (_response, context) => {
      const page = context.getSelectedMcpPage();
      await page.pptrPage.setContent(html`
        <div
          id="parent"
          role="main"
        >
          <div
            id="middle"
            role="none"
          >
            <button id="child">Click me</button>
          </div>
        </div>
      `);

      const middleHandle = await page.pptrPage.$('#middle');
      if (!middleHandle) {
        throw new Error('middle element not found');
      }

      const backendNodeId = await middleHandle.backendNodeId();
      if (!backendNodeId) {
        throw new Error('Failed to get backendNodeId');
      }

      // Verify it is not in the snapshot by default (due to role="none")
      const snapshotBefore = await TextSnapshot.create(page, {
        verbose: false,
        extraHandles: [],
      });

      let foundMiddleBefore = false;
      for (const node of snapshotBefore.idToNode.values()) {
        if (node.backendNodeId === backendNodeId) {
          foundMiddleBefore = true;
          break;
        }
      }
      assert.ok(
        !foundMiddleBefore,
        'Middle element should NOT be in the snapshot when not passed as extra handle',
      );

      // Now take snapshot with extra handle
      const snapshot = await TextSnapshot.create(page, {
        verbose: false,
        extraHandles: [middleHandle],
      });

      // Find the extra node in idToNode
      let extraNode: TextSnapshotNode | undefined;
      for (const node of snapshot.idToNode.values()) {
        if (node.backendNodeId === backendNodeId) {
          extraNode = node;
          break;
        }
      }

      assert.ok(extraNode, 'Extra node should be in the snapshot');
      assert.strictEqual(
        extraNode.role,
        'div',
        'Extra node should have role "div"',
      );

      // Check if the child was moved to extraNode
      const childHandle = await page.pptrPage.$('#child');
      if (!childHandle) {
        throw new Error('child element not found');
      }
      const childBackendNodeId = await childHandle.backendNodeId();

      let foundChild = false;
      for (const child of extraNode.children) {
        if (child.backendNodeId === childBackendNodeId) {
          foundChild = true;
          break;
        }
      }
      assert.ok(
        foundChild,
        'Child node should be moved to extra node children',
      );

      // Find parent node in snapshot
      const parentHandle = await page.pptrPage.$('#parent');
      if (!parentHandle) {
        throw new Error('parent element not found');
      }
      const parentBackendId = await parentHandle.backendNodeId();

      let parentNode: TextSnapshotNode | undefined;
      for (const node of snapshot.idToNode.values()) {
        if (node.backendNodeId === parentBackendId) {
          parentNode = node;
          break;
        }
      }

      assert.ok(parentNode, 'Parent node should be in snapshot');

      // Check that child is NOT a child of parent anymore
      let foundChildInParent = false;
      for (const child of parentNode.children) {
        if (child.backendNodeId === childBackendNodeId) {
          foundChildInParent = true;
          break;
        }
      }
      assert.ok(
        !foundChildInParent,
        'Child node should NOT be in parent children',
      );

      // Check that middle IS a child of parent
      let foundMiddleInParent = false;
      for (const child of parentNode.children) {
        if (child.backendNodeId === backendNodeId) {
          foundMiddleInParent = true;
          break;
        }
      }
      assert.ok(
        foundMiddleInParent,
        'Middle node should be in parent children',
      );
    });
  });
});
