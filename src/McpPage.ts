/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {logger} from './logger.js';
import {TextSnapshot} from './TextSnapshot.js';
import type {
  Dialog,
  ElementHandle,
  Page,
  Viewport,
  WebMCPTool,
} from './third_party/index.js';
import type {ToolGroup, ToolDefinition} from './tools/inPage.js';
import {takeSnapshot} from './tools/snapshot.js';
import type {
  ContextPage,
  DevToolsData,
  Response,
} from './tools/ToolDefinition.js';
import type {
  EmulationSettings,
  GeolocationOptions,
  TextSnapshotNode,
} from './types.js';
import {
  getNetworkMultiplierFromString,
  WaitForHelper,
} from './WaitForHelper.js';

/**
 * Per-page state wrapper. Consolidates dialog, snapshot, emulation,
 * and metadata that were previously scattered across Maps in McpContext.
 *
 * Internal class consumed only by McpContext. Fields are public for direct
 * read/write access. The dialog field is private because it requires an
 * event listener lifecycle managed by the constructor/dispose pair.
 */
export class McpPage implements ContextPage {
  readonly pptrPage: Page;
  readonly id: number;

  // Snapshot
  textSnapshot: TextSnapshot | null = null;
  uniqueBackendNodeIdToMcpId = new Map<string, string>();
  extraHandles: ElementHandle[] = [];

  // Emulation
  emulationSettings: EmulationSettings = {};

  // Metadata
  isolatedContextName?: string;
  devToolsPage?: Page;

  // Dialog
  #dialog?: Dialog;
  #dialogHandler: (dialog: Dialog) => void;

  inPageTools: ToolGroup<ToolDefinition> | undefined;

  constructor(page: Page, id: number) {
    this.pptrPage = page;
    this.id = id;
    this.#dialogHandler = (dialog: Dialog): void => {
      this.#dialog = dialog;
    };
    page.on('dialog', this.#dialogHandler);
  }

  get dialog(): Dialog | undefined {
    return this.#dialog;
  }

  getDialog(): Dialog | undefined {
    return this.dialog;
  }

  clearDialog(): void {
    this.#dialog = undefined;
  }

  throwIfDialogOpen(): void {
    if (this.#dialog) {
      throw new Error(
        `A dialog is open (${this.#dialog.type()}: ${this.#dialog.message()}).`,
      );
    }
  }

  getInPageTools(): ToolGroup<ToolDefinition> | undefined {
    return this.inPageTools;
  }

  getWebMcpTools(): WebMCPTool[] {
    return this.pptrPage.webmcp.tools();
  }

  get networkConditions(): string | null {
    return this.emulationSettings.networkConditions ?? null;
  }

  get cpuThrottlingRate(): number {
    return this.emulationSettings.cpuThrottlingRate ?? 1;
  }

  get geolocation(): GeolocationOptions | null {
    return this.emulationSettings.geolocation ?? null;
  }

  get viewport(): Viewport | null {
    return this.emulationSettings.viewport ?? null;
  }

  get userAgent(): string | null {
    return this.emulationSettings.userAgent ?? null;
  }

  get colorScheme(): 'dark' | 'light' | null {
    return this.emulationSettings.colorScheme ?? null;
  }

  // Public for testability: tests spy on this method to verify throttle multipliers.
  createWaitForHelper(
    cpuMultiplier: number,
    networkMultiplier: number,
  ): WaitForHelper {
    return new WaitForHelper(this.pptrPage, cpuMultiplier, networkMultiplier);
  }

  waitForEventsAfterAction(
    action: () => Promise<unknown>,
    options?: {timeout?: number; handleDialog?: 'accept' | 'dismiss' | string},
  ): Promise<void> {
    const helper = this.createWaitForHelper(
      this.cpuThrottlingRate,
      getNetworkMultiplierFromString(this.networkConditions),
    );
    return helper.waitForEventsAfterAction(action, options);
  }

  dispose(): void {
    this.pptrPage.off('dialog', this.#dialogHandler);
  }

  async executeInPageTool(
    toolName: string,
    params: Record<string, unknown>,
    response: Response,
  ): Promise<void> {
    // Creates array of ElementHandles from the UIDs in the params.
    // We do not replace the uids with the ElementsHandles yet, because
    // the `evaluate` function only turns them into DOM elements if they
    // are passed as non-nested arguments.
    const handles: ElementHandle[] = [];
    for (const value of Object.values(params)) {
      if (
        value instanceof Object &&
        'uid' in value &&
        typeof value.uid === 'string' &&
        Object.keys(value).length === 1
      ) {
        handles.push(await this.getElementByUid(value.uid));
      }
    }

    const result = await this.pptrPage.evaluate(
      async (name, args, ...elements) => {
        // Replace the UIDs with DOM elements.
        for (const [key, value] of Object.entries(args)) {
          if (
            value instanceof Object &&
            'uid' in value &&
            typeof value.uid === 'string' &&
            Object.keys(value).length === 1
          ) {
            args[key] = elements.shift();
          }
        }

        if (!window.__dtmcp?.executeTool) {
          throw new Error('No tools found on the page');
        }
        const toolResult = await window.__dtmcp.executeTool(name, args);

        const stashDOMElement = (el: Element) => {
          if (!window.__dtmcp) {
            window.__dtmcp = {};
          }
          if (window.__dtmcp.stashedElements === undefined) {
            window.__dtmcp.stashedElements = [];
          }
          window.__dtmcp.stashedElements.push(el);
          return {
            stashedId: `stashed-${window.__dtmcp.stashedElements.length - 1}`,
          };
        };

        const ancestors: unknown[] = [];
        // Recursively walks the tool result:
        // - Replaces DOM elements with an ID and stashes the DOM element on the window object
        // - Replaces non-plain objects with a string representation of the object
        // - Replaces circular references with the string '<Circular reference>'
        // - Replaces functions with the string '<Function object>'
        const processToolResult = (
          data: unknown,
          parentEl?: unknown,
        ): unknown => {
          // 1. Handle DOM Elements
          if (data instanceof Element) {
            return stashDOMElement(data);
          }

          // 2. Handle Arrays
          if (Array.isArray(data)) {
            return data.map((item: unknown) =>
              processToolResult(item, parentEl),
            );
          }

          // 3. Handle Objects
          if (data !== null && typeof data === 'object') {
            while (ancestors.length > 0 && ancestors.at(-1) !== parentEl) {
              ancestors.pop();
            }
            if (ancestors.includes(data)) {
              return '<Circular reference>';
            }
            ancestors.push(data);

            // If not a plain object, return a string representation of the object
            if (Object.getPrototypeOf(data) !== Object.prototype) {
              return `<${data.constructor.name} instance>`;
            }

            const processedObj: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(data)) {
              processedObj[key] = processToolResult(value, data);
            }
            return processedObj;
          }

          // 4. Handle Functions
          if (typeof data === 'function') {
            return '<Function object>';
          }

          // 5. Return primitives (strings, numbers, booleans) as-is
          return data;
        };

        return {
          result: processToolResult(toolResult),
          stashed: window.__dtmcp?.stashedElements?.length ?? 0,
        };
      },
      toolName,
      params,
      ...handles,
    );

    const elementHandles: ElementHandle[] = [];
    for (let i = 0; i < (result.stashed ?? 0); i++) {
      const elementHandle = await this.pptrPage.evaluateHandle(index => {
        const el = window.__dtmcp?.stashedElements?.[index];
        if (!el) {
          throw new Error(`Stashed element at index ${index} not found`);
        }
        return el;
      }, i);
      elementHandles.push(elementHandle);
    }

    if (elementHandles.length) {
      const oldHandles = [...this.extraHandles];
      this.textSnapshot = await TextSnapshot.create(this, {
        extraHandles: elementHandles,
      });
      response.includeSnapshot();

      for (const handle of oldHandles) {
        await handle
          .dispose()
          .catch(e => logger('Failed to dispose old handle', e));
      }
    }

    const cdpElementIds = await Promise.all(
      elementHandles.map(async (elementHandle, index) => {
        const backendNodeId = await elementHandle.backendNodeId();
        if (!backendNodeId) {
          logger(
            `No backendNodeId for stashed DOM element with index ${index}`,
          );
          return `stashed-${index}`;
        }
        const cdpElementId = this.resolveCdpElementId(backendNodeId);
        if (!cdpElementId) {
          logger(
            `Could not get cdpElementId for backend node ${backendNodeId}`,
          );
          return `stashed-${index}`;
        }
        return cdpElementId;
      }),
    );

    const recursivelyReplaceStashedElements = (node: unknown): unknown => {
      if (Array.isArray(node)) {
        return node.map(x => recursivelyReplaceStashedElements(x));
      }
      if (node !== null && typeof node === 'object') {
        if (
          'stashedId' in node &&
          typeof node.stashedId === 'string' &&
          node.stashedId.startsWith('stashed-') &&
          Object.keys(node).length === 1
        ) {
          const index = parseInt(node.stashedId.split('-')[1]);
          return {uid: cdpElementIds[index]};
        }
        const resultObj: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(node)) {
          resultObj[key] = recursivelyReplaceStashedElements(value);
        }
        return resultObj;
      }
      return node;
    };

    const resultWithUids = recursivelyReplaceStashedElements(result.result);
    response.appendResponseLine(JSON.stringify(resultWithUids, null, 2));
  }

  async getElementByUid(uid: string): Promise<ElementHandle<Element>> {
    if (!this.textSnapshot) {
      throw new Error(
        `No snapshot found for page ${this.id ?? '?'}. Use ${takeSnapshot.name} to capture one.`,
      );
    }
    const node = this.textSnapshot.idToNode.get(uid);
    if (!node) {
      throw new Error(`Element uid "${uid}" not found on page ${this.id}.`);
    }
    return this.#resolveElementHandle(node, uid);
  }

  async #resolveElementHandle(
    node: TextSnapshotNode,
    uid: string,
  ): Promise<ElementHandle<Element>> {
    const message = `Element with uid ${uid} no longer exists on the page.`;
    try {
      const handle = await node.elementHandle();
      if (!handle) {
        throw new Error(message);
      }
      return handle;
    } catch (error) {
      throw new Error(message, {
        cause: error,
      });
    }
  }

  getAXNodeByUid(uid: string) {
    return this.textSnapshot?.idToNode.get(uid);
  }

  resolveCdpElementId(cdpBackendNodeId: number): string | undefined {
    if (!cdpBackendNodeId) {
      logger('no cdpBackendNodeId');
      return;
    }
    const snapshot = this.textSnapshot;
    if (!snapshot) {
      logger('no text snapshot');
      return;
    }
    // TODO: index by backendNodeId instead.
    const queue = [snapshot.root];
    while (queue.length) {
      const current = queue.pop()!;
      if (current.backendNodeId === cdpBackendNodeId) {
        return current.id;
      }
      for (const child of current.children) {
        queue.push(child);
      }
    }
    return;
  }

  async getDevToolsData(): Promise<DevToolsData> {
    try {
      logger('Getting DevTools UI data');
      const devtoolsPage = this.devToolsPage;
      if (!devtoolsPage) {
        logger('No DevTools page detected');
        return {};
      }
      const {cdpRequestId, cdpBackendNodeId} = await devtoolsPage.evaluate(
        async () => {
          // @ts-expect-error no types
          const UI = await import('/bundled/ui/legacy/legacy.js');
          // @ts-expect-error no types
          const SDK = await import('/bundled/core/sdk/sdk.js');
          const request = UI.Context.Context.instance().flavor(
            SDK.NetworkRequest.NetworkRequest,
          );
          const node = UI.Context.Context.instance().flavor(
            SDK.DOMModel.DOMNode,
          );
          return {
            cdpRequestId: request?.requestId(),
            cdpBackendNodeId: node?.backendNodeId(),
          };
        },
      );
      return {cdpBackendNodeId, cdpRequestId};
    } catch (err) {
      logger('error getting devtools data', err);
    }
    return {};
  }
}
