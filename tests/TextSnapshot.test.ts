/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import {
  Accessibility,
  type ElementHandle,
  type SerializedAXNode,
} from 'puppeteer-core';
import sinon from 'sinon';

import {TextSnapshot} from '../src/TextSnapshot.js';
import type {TextSnapshotNode} from '../src/types.js';

import {createMockMcpPage} from './mocks.js';
import {html, withMcpContext} from './utils.js';

interface ProtocolAXNode extends SerializedAXNode {
  loaderId?: string;
  backendNodeId?: number;
  children?: ProtocolAXNode[];
  elementHandle: () => Promise<ElementHandle<Element> | null>;
}

const createAXNode = (
  role: string,
  options: {
    name?: string;
    loaderId?: string;
    backendNodeId?: number;
    children?: ProtocolAXNode[];
  } = {},
): ProtocolAXNode => ({
  role,
  name: options.name,
  loaderId: options.loaderId,
  backendNodeId: options.backendNodeId,
  children: options.children,
  elementHandle: async () => null,
});

describe('TextSnapshot', () => {
  afterEach(() => {
    sinon.restore();
    TextSnapshot.resetCounter();
  });

  it('assigns unique uids to nodes without backendNodeId', async () => {
    const page = createMockMcpPage();
    page.uniqueBackendNodeIdToMcpId = new Map();
    page.extraHandles = [];
    const mockRoot = createAXNode('RootWebArea', {
      loaderId: '1',
      backendNodeId: 1,
      children: [
        createAXNode('paragraph', {
          loaderId: '1',
          backendNodeId: 2,
          children: [
            createAXNode('InlineTextBox', {
              name: 'alpha',
              loaderId: '1',
            }),
          ],
        }),
        createAXNode('paragraph', {
          loaderId: '1',
          backendNodeId: 3,
          children: [
            createAXNode('InlineTextBox', {
              name: 'beta',
              loaderId: '1',
            }),
          ],
        }),
      ],
    });
    const accessibility = sinon.createStubInstance(Accessibility);
    accessibility.snapshot.resolves(mockRoot);
    Object.defineProperty(page.pptrPage, 'accessibility', {
      value: accessibility,
      configurable: true,
    });

    const snapshot = await TextSnapshot.create(page, {verbose: true});
    const inlineNodes = [...snapshot.idToNode.values()].filter(
      node => node.role === 'InlineTextBox',
    );

    assert.strictEqual(inlineNodes.length, 2);
    assert.notStrictEqual(inlineNodes[0]?.id, inlineNodes[1]?.id);
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
