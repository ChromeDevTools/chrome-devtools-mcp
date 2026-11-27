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

import {
  createMockAXNode,
  createMockMcpPage,
  createMockElementHandle,
} from './mocks.js';
import {html, withMcpContext} from './utils.js';

describe('TextSnapshot', () => {
  afterEach(() => {
    TextSnapshot.resetCounter();
  });

  it('rejects when the accessibility tree does not arrive within the timeout', async () => {
    const clock = sinon.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    const page = createMockMcpPage();
    page.pptrPage.accessibility.snapshot.returns(new Promise(() => {}));

    const assertion = assert.rejects(
      TextSnapshot.create(page),
      /Timed out after 10000ms waiting for the accessibility tree/,
    );
    await clock.tickAsync(10_000);
    await assertion;
  });

  it('filters the full compact snapshot to the selected root and releases its handle', async () => {
    const page = createMockMcpPage();
    page.uniqueBackendNodeIdToMcpId = new Map();
    page.extraHandles = [];
    const {handle} = createMockElementHandle();
    handle.backendNodeId.resolves(1);
    page.pptrPage.$.resolves(handle);
    page.pptrPage.accessibility.snapshot.resolves(
      createMockAXNode('RootWebArea', {
        loaderId: '1',
        children: [
          createMockAXNode('navigation', {backendNodeId: 1, loaderId: '1'}),
        ],
      }),
    );

    const snapshot = await TextSnapshot.create(page, {selector: '#main-nav'});

    assert.strictEqual(snapshot.root.role, 'navigation');
    sinon.assert.calledOnceWithExactly(page.pptrPage.$, '#main-nav');
    sinon.assert.calledOnceWithExactly(page.pptrPage.accessibility.snapshot, {
      includeIframes: true,
      interestingOnly: true,
    });
    sinon.assert.calledOnceWithExactly(handle.dispose);
  });

  it('does not suggest verbose mode for a selected element outside the subtree', async () => {
    const page = createMockMcpPage();
    page.uniqueBackendNodeIdToMcpId = new Map();
    page.extraHandles = [];
    const {handle} = createMockElementHandle();
    handle.backendNodeId.resolves(1);
    page.pptrPage.$.resolves(handle);
    page.pptrPage.accessibility.snapshot.resolves(
      createMockAXNode('RootWebArea', {
        loaderId: '1',
        children: [
          createMockAXNode('navigation', {backendNodeId: 1, loaderId: '1'}),
        ],
      }),
    );

    const snapshot = await TextSnapshot.create(page, {
      selector: '#main-nav',
      verbose: true,
      devtoolsData: {cdpBackendNodeId: 2},
    });

    sinon.assert.calledOnceWithExactly(page.pptrPage.accessibility.snapshot, {
      includeIframes: true,
      interestingOnly: false,
    });
    assert.strictEqual(snapshot.verbose, true);
    assert.strictEqual(snapshot.hasSelectedElement, false);
    assert.strictEqual(snapshot.selectedElementUid, undefined);
  });

  it('rejects a missing selector without taking a full-page snapshot', async () => {
    const page = createMockMcpPage();
    page.pptrPage.$.resolves(null);
    await assert.rejects(
      TextSnapshot.create(page, {selector: '#missing'}),
      /No element matches selector "#missing"/,
    );
    sinon.assert.notCalled(page.pptrPage.accessibility.snapshot);
  });

  it('releases the root handle when the accessibility snapshot fails', async () => {
    const page = createMockMcpPage();
    const {handle} = createMockElementHandle();
    page.pptrPage.$.resolves(handle);
    const error = new Error('Target closed');
    page.pptrPage.accessibility.snapshot.rejects(error);
    await assert.rejects(
      TextSnapshot.create(page, {selector: '#main-nav'}),
      error,
    );
    sinon.assert.calledOnceWithExactly(handle.dispose);
  });

  it('rejects a missing full accessibility tree', async () => {
    const page = createMockMcpPage();
    const {handle} = createMockElementHandle();
    page.pptrPage.$.resolves(handle);
    page.pptrPage.accessibility.snapshot.resolves(null);
    await assert.rejects(
      TextSnapshot.create(page, {selector: '#container'}),
      /Failed to create accessibility snapshot/,
    );
    sinon.assert.calledOnceWithExactly(handle.dispose);
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
            createMockAXNode('StaticText', {
              name: 'alpha',
              loaderId: '1',
            }),
          ],
        }),
        createMockAXNode('paragraph', {
          loaderId: '1',
          backendNodeId: 3,
          children: [
            createMockAXNode('StaticText', {
              name: 'beta',
              loaderId: '1',
            }),
          ],
        }),
      ],
    });
    page.pptrPage.accessibility.snapshot.resolves(mockRoot);

    const snapshot = await TextSnapshot.create(page, {verbose: true});
    const textNodes = [...snapshot.idToNode.values()].filter(
      node => node.role === 'StaticText',
    );

    assert.strictEqual(textNodes.length, 0);

    const paragraph1 = snapshot.idToNode.get('1_1');
    assert.strictEqual(paragraph1?.role, 'paragraph');
    assert.strictEqual(paragraph1?.children[0]?.role, 'StaticText');
    assert.strictEqual(paragraph1?.children[0]?.id, '');
    assert.strictEqual(paragraph1?.children[0]?.name, 'alpha');

    const paragraph2 = snapshot.idToNode.get('1_2');
    assert.strictEqual(paragraph2?.role, 'paragraph');
    assert.strictEqual(paragraph2?.children[0]?.role, 'StaticText');
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

  it('drops InlineTextBox nodes from verbose snapshots', async () => {
    await withMcpContext(async (_response, context) => {
      const page = context.getSelectedMcpPage();
      await page.pptrPage.setContent(
        html`<p style="width: 40px">Some wrapped text content</p>`,
      );

      const snapshot = await TextSnapshot.create(page, {verbose: true});

      let staticTextNode: TextSnapshotNode | undefined;
      for (const node of snapshot.idToNode.values()) {
        assert.notStrictEqual(node.role, 'InlineTextBox');
        if (node.role === 'StaticText') {
          staticTextNode = node;
        }
      }
      assert.ok(staticTextNode, 'StaticText node should be in the snapshot');
      assert.strictEqual(staticTextNode.name, 'Some wrapped text content');
      assert.deepStrictEqual(staticTextNode.children, []);
    });
  });

  it('keeps extra node UIDs usable after disposing action handles', async () => {
    await withMcpContext(async (_response, context) => {
      const page = context.getSelectedMcpPage();
      await page.pptrPage.setContent(html`
        <div
          id="target"
          role="none"
          style="width: 100px; height: 100px"
          data-clicks="0"
          onclick="this.dataset.clicks++"
        ></div>
      `);
      using retainedHandle = await page.pptrPage.$('#target');
      assert.ok(retainedHandle);
      const backendNodeId = await retainedHandle.backendNodeId();
      page.textSnapshot = await TextSnapshot.create(page, {
        extraHandles: [retainedHandle],
      });
      const uid = page.textSnapshot.resolveCdpElementId(backendNodeId);
      assert.ok(uid);

      for (let i = 0; i < 2; i++) {
        using actionHandle = await page.getElementByUid(uid);
        await actionHandle.click();
      }

      page.textSnapshot = await TextSnapshot.create(page);
      assert.strictEqual(
        page.textSnapshot.resolveCdpElementId(backendNodeId),
        uid,
      );
      assert.strictEqual(
        await retainedHandle.evaluate(element =>
          element.getAttribute('data-clicks'),
        ),
        '2',
      );
    });
  });

  it('keeps retained extra handles outside the selected subtree out of the snapshot', async () => {
    await withMcpContext(async (_response, context) => {
      const page = context.getSelectedMcpPage();
      await page.pptrPage.setContent(html`
        <div
          id="outside"
          role="none"
          ><button>Outside</button></div
        >
        <div id="component">
          <div
            id="inside"
            role="none"
            ><button>Inside</button></div
          >
          <button>Sibling</button></div
        >
      `);
      const outside = await page.pptrPage.$('#outside');
      const inside = await page.pptrPage.$('#inside');
      assert.ok(outside);
      assert.ok(inside);
      page.extraHandles = [outside, inside];
      const outsideId = await outside.backendNodeId();
      const insideId = await inside.backendNodeId();

      const snapshot = await TextSnapshot.create(page, {
        selector: '#component',
      });

      const output = JSON.stringify(snapshot.root);
      assert.match(output, /Sibling/);
      assert.match(output, /Inside/);
      assert.doesNotMatch(output, /Outside/);
      assert.strictEqual(snapshot.resolveCdpElementId(outsideId), undefined);
      assert.ok(snapshot.resolveCdpElementId(insideId));
      assert.deepStrictEqual(page.extraHandles, [outside, inside]);
      assert.strictEqual(await outside.evaluate(el => el.id), 'outside');
      const full = await TextSnapshot.create(page);
      assert.ok(full.resolveCdpElementId(outsideId));
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
