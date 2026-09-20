/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {TextSnapshot} from '../src/TextSnapshot.js';
import {CdpFrame, type SerializedAXNode} from '../src/third_party/index.js';
import type {TextSnapshotNode} from '../src/types.js';

import {createMockMcpPage} from './mocks.js';
import {serverHooks} from './server.js';
import {html, withMcpContext} from './utils.js';

describe('TextSnapshot', () => {
  const server = serverHooks();
  afterEach(() => {
    sinon.restore();
    TextSnapshot.resetCounter();
  });

  function snapshotNode(
    name: string,
    loaderId?: string,
    backendNodeId?: number,
  ): TextSnapshotNode {
    return {
      id: '',
      role: 'button',
      name,
      loaderId,
      backendNodeId,
      children: [],
      elementHandle: async () => null,
    };
  }

  function mockSnapshots() {
    const page = createMockMcpPage();
    page.uniqueBackendNodeIdToMcpId = new Map();
    page.extraHandles = [];
    const snapshot = sinon.stub();
    sinon.stub(page.pptrPage, 'accessibility').get(() => ({snapshot}));
    const root = snapshotNode('root', 'root-document', 1);
    root.role = 'RootWebArea';
    return {
      page,
      async capture(children: TextSnapshotNode[]) {
        snapshot.resolves({...root, children});
        return await TextSnapshot.create(page);
      },
    };
  }

  it('does not reuse IDs without a complete document and backend identity', async () => {
    const {capture} = mockSnapshots();
    const nodes = [
      snapshotNode('missing document', undefined, 2),
      snapshotNode('empty document', '', 3),
      snapshotNode('missing backend', 'document'),
      snapshotNode('invalid backend', 'document', 0),
      snapshotNode('stable', 'document', 4),
    ];
    const first = await capture(nodes);
    const second = await capture(nodes);
    assert.strictEqual(second.root.children.length, nodes.length);
    for (const [index, node] of second.root.children.entries()) {
      if (node.name === 'stable') {
        assert.strictEqual(node.id, first.root.children[index]?.id);
      } else {
        assert.notStrictEqual(node.id, first.root.children[index]?.id);
      }
    }
  });

  it('does not reuse a UID when a new renderer session repeats document metadata', async () => {
    const {capture, page} = mockSnapshots();
    const node = snapshotNode('first renderer', 'document', 2);
    const first = await capture([node]);
    const replacement = createMockMcpPage().pptrPage.mainFrame();
    assert.ok(replacement instanceof CdpFrame);
    sinon.replace(replacement.client, 'id', () => 'replacement-session');
    page.pptrPage.mainFrame.returns(replacement);
    page.pptrPage.frames.returns([replacement]);

    const second = await capture([
      snapshotNode('replacement renderer', 'document', 2),
    ]);
    assert.notStrictEqual(
      second.root.children[0]?.id,
      first.root.children[0]?.id,
    );
  });

  it('keeps colliding nodes distinct across reordering and disappearance', async () => {
    const {capture} = mockSnapshots();
    const firstNode = snapshotNode('first document', 'shared', 2);
    const secondNode = snapshotNode('second document', 'shared', 2);
    const original = await capture([firstNode]);
    const originalId = original.root.children[0]?.id;
    const previousIds = new Set([originalId]);

    for (const nodes of [
      [firstNode, secondNode],
      [secondNode, firstNode],
      [secondNode],
      [firstNode, secondNode],
    ]) {
      const snapshot = await capture(nodes);
      const ids = snapshot.root.children.map(node => node.id);
      assert.strictEqual(new Set(ids).size, nodes.length);
      for (const [index, node] of snapshot.root.children.entries()) {
        assert.ok(!previousIds.has(node.id), 'must not rebind an earlier UID');
        const source = nodes[index];
        assert.ok(source);
        const resolve = sinon.spy(source, 'elementHandle');
        await node.elementHandle();
        sinon.assert.calledOnceWithExactly(resolve);
        resolve.restore();
        assert.strictEqual(snapshot.idToNode.get(node.id), node);
        previousIds.add(node.id);
      }
    }
  });

  type ButtonNode = Pick<SerializedAXNode, 'role' | 'name'> & {
    backendNodeId?: number;
    children?: ButtonNode[];
  };

  function buttonBackends(
    node: ButtonNode,
    result = new Map<number, string>(),
  ): Map<number, string> {
    if (node.role === 'button' && node.backendNodeId) {
      result.set(node.backendNodeId, node.name ?? '');
    }
    for (const child of node.children ?? []) {
      buttonBackends(child, result);
    }
    return result;
  }

  it('rejects old UIDs when a replacement renderer reuses backend IDs', async () => {
    for (const name of ['before', 'after']) {
      server.addHtmlRoute(
        `/${name}`,
        Array.from(
          {length: 32},
          (_, index) => `<button>${name} ${index}</button>`,
        ).join(''),
      );
    }
    await withMcpContext(
      async (_response, context) => {
        const page = context.getSelectedMcpPage();
        await page.pptrPage.goto(server.getRoute('/before'));
        const snapshot = await TextSnapshot.create(page);
        page.textSnapshot = snapshot;
        await page.pptrPage.goto(
          server.getRoute('/after').replace('127.0.0.1', 'localhost'),
        );
        const replacement = await page.pptrPage.accessibility.snapshot();
        assert.ok(replacement);
        const replacementIds = buttonBackends(replacement);
        const stale = snapshot.idToNode
          .values()
          .find(
            node =>
              node.role === 'button' &&
              node.backendNodeId &&
              replacementIds.has(node.backendNodeId),
          );
        assert.ok(
          stale,
          'replacement renderer must reuse an old button backend ID',
        );
        await assert.rejects(
          page.getElementByUid(stale.id),
          /no longer exists/,
        );

        page.textSnapshot = await TextSnapshot.create(page);
        const current = page.textSnapshot.idToNode
          .values()
          .find(node => node.role === 'button');
        assert.ok(current);
        using handle = await page.getElementByUid(current.id);
        assert.match(
          await handle.evaluate(element => element.textContent ?? ''),
          /^after /,
        );
      },
      {args: ['--site-per-process']},
    );
  });

  it('keeps extra iframe nodes separate from colliding main-frame backend IDs', async () => {
    server.addHtmlRoute(
      '/frame',
      '<title>Frame document</title><main>' +
        Array.from(
          {length: 32},
          (_, index) =>
            `<div data-extra="${index}" role="none"><button>Frame ${index}</button></div>`,
        ).join('') +
        '</main>',
    );
    server.addHtmlRoute(
      '/frames',
      Array.from(
        {length: 64},
        (_, index) => `<button>Top ${index}</button>`,
      ).join('') +
        `<iframe src="${server.getRoute('/frame').replace('127.0.0.1', 'localhost')}"></iframe>`,
    );

    await withMcpContext(
      async (_response, context) => {
        const page = context.getSelectedMcpPage();
        await page.pptrPage.goto(server.getRoute('/frames'));
        const frame = page.pptrPage
          .frames()
          .find(candidate => candidate.url().endsWith('/frame'));
        assert.ok(frame instanceof CdpFrame);
        const mainFrame = page.pptrPage.mainFrame();
        assert.ok(mainFrame instanceof CdpFrame);
        assert.notStrictEqual(
          frame.client,
          mainFrame.client,
          'fixture must use a separate renderer',
        );
        const mainSnapshot = await mainFrame.accessibility.snapshot();
        assert.ok(mainSnapshot);
        const mainIds = buttonBackends(mainSnapshot);
        const handles = await frame.$$('[data-extra]');
        using stack = new DisposableStack();
        for (const handle of handles) {
          stack.use(handle);
        }
        const backendIds = await Promise.all(
          handles.map(handle => handle.backendNodeId()),
        );
        const index = backendIds.findIndex(id => mainIds.has(id));
        const extraHandle = handles[index];
        assert.ok(
          extraHandle,
          'iframe extra node must collide with a main-frame button',
        );
        const expectedText = await extraHandle.evaluate(
          element => element.textContent,
        );
        const snapshot = await TextSnapshot.create(page, {
          extraHandles: [extraHandle],
        });
        page.textSnapshot = snapshot;
        const extraNode = snapshot.idToNode
          .values()
          .find(node => node.role === 'div');
        assert.ok(
          extraNode,
          'extra node must not be omitted because another frame uses its backend ID',
        );
        assert.ok(extraNode.backendNodeId);
        assert.strictEqual(
          snapshot.resolveCdpElementId(extraNode.backendNodeId),
          undefined,
        );
        assert.strictEqual(
          snapshot.resolveCdpElementId(extraNode.backendNodeId, frame),
          extraNode.id,
        );
        for (let attempt = 0; attempt < 2; attempt++) {
          using resolved = await page.getElementByUid(extraNode.id);
          assert.strictEqual(resolved.frame, frame);
          assert.strictEqual(
            await resolved.evaluate(element => element.textContent),
            expectedText,
          );
        }
        const child = extraNode.children.find(node => node.role === 'button');
        assert.ok(child, 'descendant lookup must use the iframe CDP session');
        using childHandle = await page.getElementByUid(child.id);
        assert.strictEqual(childHandle.frame, frame);
      },
      {args: ['--site-per-process']},
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
