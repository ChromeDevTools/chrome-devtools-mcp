/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {McpPage} from './McpPage.js';
import {CdpFrame} from './third_party/index.js';
import type {
  Protocol,
  SerializedAXNode,
  ElementHandle,
  Frame,
} from './third_party/index.js';
import type {DevToolsData} from './tools/ToolDefinition.js';
import type {TextSnapshotNode} from './types.js';
import {logger} from './utils/logger.js';

function stableNodeKey(
  node: SerializedAXNode & {loaderId?: string; backendNodeId?: number},
  sessionId: string,
): string | undefined {
  if (
    !sessionId ||
    !node.loaderId ||
    !node.backendNodeId ||
    node.backendNodeId < 0
  ) {
    return;
  }
  return `${sessionId}_${node.loaderId}_${node.backendNodeId}`;
}

export class TextSnapshot {
  static nextSnapshotId = 1;

  static resetCounter() {
    TextSnapshot.nextSnapshotId = 1;
  }

  root: TextSnapshotNode;
  idToNode: Map<string, TextSnapshotNode>;
  snapshotId: string;
  selectedElementUid?: string;
  hasSelectedElement: boolean;
  verbose: boolean;
  #nodesByFrame: Map<Frame, Map<number, TextSnapshotNode>>;

  constructor(data: {
    root: TextSnapshotNode;
    idToNode: Map<string, TextSnapshotNode>;
    snapshotId: string;
    selectedElementUid?: string;
    hasSelectedElement: boolean;
    verbose: boolean;
    nodesByFrame: Map<Frame, Map<number, TextSnapshotNode>>;
  }) {
    this.root = data.root;
    this.idToNode = data.idToNode;
    this.snapshotId = data.snapshotId;
    this.selectedElementUid = data.selectedElementUid;
    this.hasSelectedElement = data.hasSelectedElement;
    this.verbose = data.verbose;
    this.#nodesByFrame = data.nodesByFrame;
  }

  static async create(
    page: McpPage,
    options: {
      verbose?: boolean;
      devtoolsData?: DevToolsData;
      extraHandles?: ElementHandle[];
    } = {},
  ): Promise<TextSnapshot> {
    const verbose = options.verbose ?? false;
    const mainFrame = page.pptrPage.mainFrame();
    const frameStates = new Map<
      Frame,
      {client: CdpFrame['client']; loaderId: string}
    >();
    for (const frame of page.pptrPage.frames()) {
      if (frame instanceof CdpFrame) {
        frameStates.set(frame, {
          client: frame.client,
          loaderId: frame._loaderId,
        });
      }
    }
    const currentClient = (frame: Frame): CdpFrame['client'] => {
      const state = frameStates.get(frame);
      if (
        !state ||
        !(frame instanceof CdpFrame) ||
        frame.detached ||
        frame.client !== state.client ||
        frame._loaderId !== state.loaderId
      ) {
        throw new Error('Snapshot document changed. Take a new snapshot.');
      }
      return state.client;
    };
    const rootNode = await page.pptrPage.accessibility.snapshot({
      includeIframes: true,
      interestingOnly: !verbose,
    });
    if (!rootNode) {
      throw new Error('Failed to create accessibility snapshot');
    }

    const {uniqueBackendNodeIdToMcpId} = page;
    const snapshotId = TextSnapshot.nextSnapshotId++;
    // Iterate through the whole accessibility node tree and assign node ids that
    // will be used for the tree serialization and mapping ids back to nodes.
    let idCounter = 0;
    const idToNode = new Map<string, TextSnapshotNode>();
    const seenUniqueIds = new Set<string>();
    const nodeFrames = new Map<SerializedAXNode, Frame>();
    const documentIds = new Map<Frame, string | undefined>();
    const nodesByFrame = new Map<Frame, Map<number, TextSnapshotNode>>();
    const keyCounts = new Map<string, number>();
    const pending = [{node: rootNode, frame: mainFrame}];
    for (const entry of pending) {
      const node: SerializedAXNode & {loaderId?: string} = entry.node;
      let frame = entry.frame;
      if (node !== rootNode && node.role === 'RootWebArea') {
        using handle = await node.elementHandle();
        if (!handle) {
          throw new Error(
            'Snapshot document disappeared. Take a new snapshot.',
          );
        }
        frame = handle.frame;
      }
      const key = stableNodeKey(node, currentClient(frame).id());
      if (key !== undefined) {
        keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
      }
      if (node.role === 'RootWebArea') {
        documentIds.set(frame, node.loaderId);
      }
      nodeFrames.set(node, frame);
      for (const child of node.children ?? []) {
        pending.push({node: child, frame});
      }
    }

    // A repeated backend identity cannot identify either occurrence across captures.
    for (const [key, count] of keyCounts) {
      if (count > 1) {
        uniqueBackendNodeIdToMcpId.delete(key);
      }
    }

    const assignIds = (node: SerializedAXNode): TextSnapshotNode => {
      const frame = nodeFrames.get(node);
      if (!frame) {
        throw new Error('Snapshot node has no frame');
      }
      const key = stableNodeKey(node, currentClient(frame).id());
      const stableKey =
        key !== undefined && keyCounts.get(key) === 1 ? key : undefined;
      const id =
        (stableKey !== undefined
          ? uniqueBackendNodeIdToMcpId.get(stableKey)
          : undefined) ?? `${snapshotId}_${idCounter++}`;
      if (stableKey !== undefined) {
        uniqueBackendNodeIdToMcpId.set(stableKey, id);
        seenUniqueIds.add(stableKey);
      }

      const nodeWithId: TextSnapshotNode = {
        ...node,
        id,
        children: node.children
          ? node.children.map(child => assignIds(child))
          : [],
        elementHandle: async () => {
          currentClient(frame);
          const handle = await node.elementHandle();
          try {
            currentClient(frame);
            return handle;
          } catch (error) {
            await handle?.dispose();
            throw error;
          }
        },
      };
      if (nodeWithId.backendNodeId) {
        let nodes = nodesByFrame.get(frame);
        if (!nodes) {
          nodes = new Map();
          nodesByFrame.set(frame, nodes);
        }
        nodes.set(nodeWithId.backendNodeId, nodeWithId);
      }

      // The AXNode for an option doesn't contain its `value`.
      // Therefore, set text content of the option as value.
      if (node.role === 'option') {
        const optionText = node.name;
        if (optionText) {
          nodeWithId.value = optionText.toString();
        }
      }

      idToNode.set(nodeWithId.id, nodeWithId);
      return nodeWithId;
    };

    const rootNodeWithId = assignIds(rootNode);

    await TextSnapshot.insertExtraNodes(
      page,
      idToNode,
      seenUniqueIds,
      snapshotId,
      idCounter,
      nodesByFrame,
      documentIds,
      currentClient,
      options.extraHandles ?? [],
    );

    const snapshot = new TextSnapshot({
      root: rootNodeWithId,
      snapshotId: String(snapshotId),
      idToNode,
      hasSelectedElement: false,
      verbose,
      nodesByFrame,
    });

    const data = options.devtoolsData ?? (await page.getDevToolsData());
    if (data?.cdpBackendNodeId) {
      snapshot.hasSelectedElement = true;
      snapshot.selectedElementUid = snapshot.resolveCdpElementId(
        data.cdpBackendNodeId,
      );
    }

    // Clean up unique IDs that we did not see anymore.
    for (const key of uniqueBackendNodeIdToMcpId.keys()) {
      if (!seenUniqueIds.has(key)) {
        uniqueBackendNodeIdToMcpId.delete(key);
      }
    }

    return snapshot;
  }

  resolveCdpElementId(
    cdpBackendNodeId: number,
    frame?: Frame,
  ): string | undefined {
    if (!cdpBackendNodeId) {
      logger?.('no cdpBackendNodeId');
      return;
    }
    if (frame) {
      return this.#nodesByFrame.get(frame)?.get(cdpBackendNodeId)?.id;
    }
    let match: string | undefined;
    const queue = [this.root];
    while (queue.length) {
      const current = queue.pop()!;
      if (current.backendNodeId === cdpBackendNodeId) {
        if (match !== undefined) {
          return;
        }
        match = current.id;
      }
      for (const child of current.children) {
        queue.push(child);
      }
    }
    return match;
  }

  // ExtraHandles represent DOM nodes which might not be part of the accessibility tree, e.g. DOM nodes
  // returned by third-party developer tools. We insert them into the tree by finding the closest ancestor
  // in the tree and inserting the node as a child. The ancestor's child nodes are re-parented if necessary.
  private static async insertExtraNodes(
    page: McpPage,
    idToNode: Map<string, TextSnapshotNode>,
    seenUniqueIds: Set<string>,
    snapshotId: number,
    idCounter: number,
    nodesByFrame: Map<Frame, Map<number, TextSnapshotNode>>,
    documentIds: Map<Frame, string | undefined>,
    currentClient: (frame: Frame) => CdpFrame['client'],
    extraHandles: ElementHandle[],
  ): Promise<void> {
    const {uniqueBackendNodeIdToMcpId} = page;

    const createExtraNode = async (
      handle: ElementHandle,
    ): Promise<TextSnapshotNode | null> => {
      const frame = handle.frame;
      const client = currentClient(frame);
      const backendNodeId = await handle.backendNodeId();
      let nodes = nodesByFrame.get(frame);
      if (!backendNodeId || nodes?.has(backendNodeId)) {
        return null;
      }
      const documentId = documentIds.get(frame);
      const uniqueBackendId = documentId
        ? `custom_${client.id()}_${documentId}_${backendNodeId}`
        : undefined;

      const id =
        (uniqueBackendId !== undefined
          ? uniqueBackendNodeIdToMcpId.get(uniqueBackendId)
          : undefined) ?? `${snapshotId}_${idCounter++}`;
      if (uniqueBackendId !== undefined) {
        uniqueBackendNodeIdToMcpId.set(uniqueBackendId, id);
        seenUniqueIds.add(uniqueBackendId);
      }

      using tagHandle = await handle.getProperty('localName');
      const tagValue = await tagHandle.jsonValue();
      const extraNode: TextSnapshotNode = {
        role: tagValue,
        id,
        backendNodeId,
        children: [],
        elementHandle: async () => {
          currentClient(frame);
          return await handle.evaluateHandle(element => element);
        },
      };
      if (!nodes) {
        nodes = new Map();
        nodesByFrame.set(frame, nodes);
      }
      nodes.set(backendNodeId, extraNode);
      return extraNode;
    };

    const findAncestorNode = async (
      handle: ElementHandle,
    ): Promise<TextSnapshotNode | null> => {
      let ancestorHandle = await handle.evaluateHandle(el => el.parentElement);
      using stack = new DisposableStack();

      while (ancestorHandle) {
        stack.use(ancestorHandle);

        const ancestorElement = ancestorHandle.asElement();
        if (!ancestorElement) {
          return null;
        }

        const ancestorBackendId = await ancestorElement.backendNodeId();
        if (ancestorBackendId) {
          const ancestorNode = nodesByFrame
            .get(handle.frame)
            ?.get(ancestorBackendId);
          if (ancestorNode) {
            return ancestorNode;
          }
        }

        const nextHandle = await ancestorElement.evaluateHandle(
          el => el.parentElement,
        );
        ancestorHandle = nextHandle;
      }
      return null;
    };

    const findDescendantNodes = async (
      frame: Frame,
      backendNodeId?: number,
    ): Promise<Set<number>> => {
      const descendantIds = new Set<number>();
      if (!backendNodeId) {
        return descendantIds;
      }
      try {
        const client = currentClient(frame);
        const {node}: {node: Protocol.DOM.Node} = await client.send(
          'DOM.describeNode',
          {
            backendNodeId,
            depth: -1,
            pierce: true,
          },
        );
        const collect = (node: Protocol.DOM.Node) => {
          if (node.backendNodeId && node.backendNodeId !== backendNodeId) {
            descendantIds.add(node.backendNodeId);
          }
          if (node.children) {
            for (const child of node.children) {
              collect(child);
            }
          }
        };
        collect(node);
      } catch (e) {
        logger?.(
          `Failed to collect descendants for backend node ${backendNodeId}`,
          e,
        );
      }
      return descendantIds;
    };

    const moveChildNodes = (
      attachTarget: TextSnapshotNode,
      extraNode: TextSnapshotNode,
      descendantIds: Set<number>,
    ): number => {
      let firstMovedIndex = -1;
      if (descendantIds.size > 0 && attachTarget.children) {
        const remainingChildren: TextSnapshotNode[] = [];
        for (const child of attachTarget.children) {
          if (child.backendNodeId && descendantIds.has(child.backendNodeId)) {
            if (firstMovedIndex === -1) {
              firstMovedIndex = remainingChildren.length;
            }
            extraNode.children.push(child);
          } else {
            remainingChildren.push(child);
          }
        }
        attachTarget.children = remainingChildren;
      }
      return firstMovedIndex !== -1
        ? firstMovedIndex
        : attachTarget.children
          ? attachTarget.children.length
          : 0;
    };

    if (extraHandles.length) {
      page.extraHandles = extraHandles;
    }
    const reorgInfo: Array<{
      extraNode: TextSnapshotNode;
      attachTarget: TextSnapshotNode;
      descendantIds: Set<number>;
    }> = [];

    for (const handle of page.extraHandles) {
      const extraNode = await createExtraNode(handle);
      if (!extraNode) {
        continue;
      }
      idToNode.set(extraNode.id, extraNode);
      const attachTarget =
        (await findAncestorNode(handle)) ??
        nodesByFrame
          .get(handle.frame)
          ?.values()
          .find(node => node.role === 'RootWebArea');
      if (!attachTarget) {
        throw new Error(
          'Extra node has no snapshot document. Take a new snapshot.',
        );
      }
      const descendantIds = await findDescendantNodes(
        handle.frame,
        extraNode.backendNodeId,
      );
      reorgInfo.push({extraNode, attachTarget, descendantIds});
    }

    for (const {extraNode, attachTarget, descendantIds} of reorgInfo) {
      const index = moveChildNodes(attachTarget, extraNode, descendantIds);
      attachTarget.children.splice(index, 0, extraNode);
    }
  }
}
