/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export function replaceHtmlElementsWithUids(schema: JSONSchema7Definition) {
  if (typeof schema === 'boolean') {
    return;
  }

  let isHtmlElement = false;
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'x-mcp-type' && value === 'HTMLElement') {
      isHtmlElement = true;
      break;
    }
  }

  if (isHtmlElement) {
    schema.properties = {uid: {type: 'string'}};
    schema.required = ['uid'];
  }

  if (schema.properties) {
    for (const key of Object.keys(schema.properties)) {
      replaceHtmlElementsWithUids(schema.properties[key]);
    }
  }

  if (schema.items) {
    if (Array.isArray(schema.items)) {
      for (const item of schema.items) {
        replaceHtmlElementsWithUids(item);
      }
    } else {
      replaceHtmlElementsWithUids(schema.items);
    }
  }

  if (schema.anyOf) {
    for (const s of schema.anyOf) {
      replaceHtmlElementsWithUids(s);
    }
  }
  if (schema.allOf) {
    for (const s of schema.allOf) {
      replaceHtmlElementsWithUids(s);
    }
  }
  if (schema.oneOf) {
    for (const s of schema.oneOf) {
      replaceHtmlElementsWithUids(s);
    }
  }
}

import {
  createTargetUniverse,
  type TargetUniverse,
} from './devtools/DevtoolsUtils.js';
import {
  ConsoleCollector,
  NetworkCollector,
  type ListenerMap,
  type UncaughtError,
} from './PageCollector.js';
import {TextSnapshot} from './TextSnapshot.js';
import type {Locator} from './third_party/index.js';
import {
  PredefinedNetworkConditions,
  type Dialog,
  type ElementHandle,
  type Viewport,
  type WebMCPTool,
  type Protocol,
  type Page,
  type ConsoleMessage,
  type HTTPRequest,
  type DevTools,
  type JSONSchema7Definition,
} from './third_party/index.js';
import {takeSnapshot} from './tools/snapshot.js';
import type {ToolGroups} from './tools/thirdPartyDeveloper.js';
const DEFAULT_TIMEOUT = 5_000;
const NAVIGATION_TIMEOUT = 10_000;
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
import {logger} from './utils/logger.js';
import {
  getNetworkMultiplierFromString,
  WaitForHelper,
  type WaitForEventsResult,
  type DialogAction,
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
  #devtoolsUniverse?: TargetUniverse;

  // Dialog
  #dialog?: Dialog;
  #dialogHandler: (dialog: Dialog) => void;

  thirdPartyDeveloperTools: ToolGroups = [];

  networkCollector: NetworkCollector;
  consoleCollector: ConsoleCollector;

  #hasNetworkBlockOrAllowlist: boolean;
  #locatorClass: typeof Locator;

  constructor(
    page: Page,
    id: number,
    options: {
      hasNetworkBlockOrAllowlist: boolean;
      locatorClass: typeof Locator;
      isolatedContextName?: string;
    },
  ) {
    this.#hasNetworkBlockOrAllowlist = options.hasNetworkBlockOrAllowlist;
    this.#locatorClass = options.locatorClass;
    this.pptrPage = page;
    this.id = id;
    this.isolatedContextName = options.isolatedContextName;
    this.#dialogHandler = (dialog: Dialog): void => {
      this.#dialog = dialog;
    };
    page.on('dialog', this.#dialogHandler);

    this.networkCollector = new NetworkCollector(page);
    this.consoleCollector = new ConsoleCollector(page, collect => {
      return {
        console: event => {
          collect(event);
        },
        uncaughtError: event => {
          collect(event);
        },
        devtoolsAggregatedIssue: event => {
          collect(event);
        },
      } as ListenerMap;
    });
  }

  async init(): Promise<void> {
    await Promise.allSettled([
      this.#initDevToolsUniverseNoThrow(),
      this.#initFocusEmulationNoThrow(),
    ]);
  }

  async #initFocusEmulationNoThrow(): Promise<void> {
    // We emulate a focused page for all pages to support multi-agent workflows.
    void this.pptrPage.emulateFocusedPage(true).catch(error => {
      logger?.('Error turning on focused page emulation', error);
    });
  }

  async #initDevToolsUniverseNoThrow(): Promise<void> {
    if (this.#devtoolsUniverse) {
      return undefined;
    }
    try {
      const session = await this.pptrPage.createCDPSession();
      this.#devtoolsUniverse = await createTargetUniverse(session);
    } catch (e) {
      logger?.('Failed to initialize DevTools universe', e);
    }
  }

  get devtoolsUniverse(): TargetUniverse | undefined {
    return this.#devtoolsUniverse;
  }

  getDialog(): Dialog | undefined {
    return this.#dialog;
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

  getThirdPartyDeveloperTools(): ToolGroups {
    return this.thirdPartyDeveloperTools;
  }

  async getToolGroups(): Promise<ToolGroups> {
    // Check if there is a `devtoolstooldiscovery` event listener
    const windowHandle = await this.pptrPage.evaluateHandle(() => window);
    // @ts-expect-error internal API
    const client = this.pptrPage._client();
    const {listeners}: {listeners: Protocol.DOMDebugger.EventListener[]} =
      await client.send('DOMDebugger.getEventListeners', {
        objectId: windowHandle.remoteObject().objectId,
      });
    if (listeners.find(l => l.type === 'devtoolstooldiscovery') === undefined) {
      return [];
    }

    const toolGroups = await this.pptrPage.evaluate(() => {
      if (window.__dtmcp) {
        window.__dtmcp.toolGroups = [];
      }
      return new Promise<ToolGroups>(resolve => {
        const event = new CustomEvent('devtoolstooldiscovery');
        const groups: ToolGroups = [];
        // @ts-expect-error Adding custom property
        event.respondWith = toolGroup => {
          if (!window.__dtmcp) {
            window.__dtmcp = {};
          }
          if (!window.__dtmcp.toolGroups) {
            window.__dtmcp.toolGroups = [];
          }

          if (
            typeof toolGroup.name !== 'string' ||
            (toolGroup.description &&
              typeof toolGroup.description !== 'string') ||
            !Array.isArray(toolGroup.tools)
          ) {
            console.error('Invalid toolGroup:', toolGroup);
            return;
          }
          for (const tool of toolGroup.tools) {
            if (
              typeof tool.name !== 'string' ||
              typeof tool.description !== 'string' ||
              typeof tool.inputSchema !== 'object' ||
              typeof tool.execute !== 'function'
            ) {
              console.error('Invalid tool:', tool);
              return;
            }
          }

          window.__dtmcp.toolGroups.push(toolGroup);

          // When receiving a toolGroup for the first time, expose a simple execution helper
          if (!window.__dtmcp.executeTool) {
            window.__dtmcp.executeTool = async (toolName, args) => {
              if (
                !window.__dtmcp?.toolGroups ||
                window.__dtmcp.toolGroups.length === 0
              ) {
                throw new Error('No tools found on the page');
              }
              for (const group of window.__dtmcp.toolGroups) {
                const tool = group.tools?.find(t => t.name === toolName);
                if (tool) {
                  return await tool.execute(args);
                }
              }
              throw new Error(`Tool ${toolName} not found`);
            };
          }

          groups.push(toolGroup);
        };
        window.dispatchEvent(event);
        // If at least one toolGroup was added synchronously, resolve with the array.
        // Otherwise, use setTimeout to allow for any microtask/asynchronous respondWith calls, or resolve with an empty array.
        if (groups.length > 0) {
          resolve(groups);
        } else {
          setTimeout(() => {
            if (groups.length > 0) {
              resolve(groups);
            } else {
              resolve([]);
            }
          }, 0);
        }
      });
    });

    for (const group of toolGroups) {
      for (const tool of group.tools ?? []) {
        replaceHtmlElementsWithUids(tool.inputSchema);
      }
    }

    this.thirdPartyDeveloperTools = toolGroups;

    return toolGroups;
  }

  getWebMcpTools(): WebMCPTool[] {
    return this.pptrPage.webmcp.tools();
  }

  resolveCdpRequestId(cdpRequestId: string): number | undefined {
    if (!cdpRequestId) {
      logger?.('no network request');
      return;
    }
    const request = this.networkCollector.find(request => {
      // @ts-expect-error id is internal.
      return request.id === cdpRequestId;
    });
    if (!request) {
      logger?.('no network request for ' + cdpRequestId);
      return;
    }
    return this.networkCollector.getIdForResource(request);
  }

  getNetworkRequests(includePreservedRequests?: boolean): HTTPRequest[] {
    return this.networkCollector.getData(includePreservedRequests);
  }

  async getDevToolsPage(): Promise<Page | undefined> {
    try {
      if (await this.pptrPage.hasDevTools()) {
        return await this.pptrPage.openDevTools();
      }
      return undefined;
    } catch {
      // Prior to Chrome 144.0.7559.59, the command fails,
      // Some Electron apps still use older version
      // Fall back to not exposing DevTools at all.
      return undefined;
    }
  }

  getConsoleData(
    includePreservedMessages?: boolean,
  ): Array<ConsoleMessage | Error | DevTools.AggregatedIssue | UncaughtError> {
    return this.consoleCollector.getData(includePreservedMessages);
  }

  getConsoleMessageById(
    id: number,
  ): ConsoleMessage | Error | DevTools.AggregatedIssue | UncaughtError {
    return this.consoleCollector.getById(id);
  }

  getNetworkRequestById(reqid: number): HTTPRequest {
    return this.networkCollector.getById(reqid);
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
    options?: {
      timeout?: number;
      handleDialog?:
        DialogAction | Partial<Record<Protocol.Page.DialogType, DialogAction>>;
    },
  ): Promise<WaitForEventsResult> {
    const helper = this.createWaitForHelper(
      this.cpuThrottlingRate,
      getNetworkMultiplierFromString(this.networkConditions),
    );
    return helper.waitForEventsAfterAction(action, options);
  }

  dispose(): void {
    this.pptrPage.off('dialog', this.#dialogHandler);
    this.networkCollector.dispose();
    this.consoleCollector.dispose();
  }

  async executeThirdPartyDeveloperTool(
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
          .catch(e => logger?.('Failed to dispose old handle', e));
      }
    }

    const cdpElementIds = await Promise.all(
      elementHandles.map(async (elementHandle, index) => {
        const backendNodeId = await elementHandle.backendNodeId();
        if (!backendNodeId) {
          logger?.(
            `No backendNodeId for stashed DOM element with index ${index}`,
          );
          return `stashed-${index}`;
        }
        const cdpElementId =
          this.textSnapshot?.resolveCdpElementId(backendNodeId);
        if (!cdpElementId) {
          logger?.(
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

  async getDevToolsData(): Promise<DevToolsData> {
    try {
      logger?.('Getting DevTools UI data');
      const devtoolsPage = await this.getDevToolsPage();
      if (!devtoolsPage) {
        logger?.('No DevTools page detected');
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
      logger?.('error getting devtools data', err);
    }
    return {};
  }

  async restoreEmulation() {
    const currentSetting = this.emulationSettings;
    await this.emulate(currentSetting);
  }

  async emulate(options: {
    networkConditions?: string;
    cpuThrottlingRate?: number;
    geolocation?: GeolocationOptions;
    userAgent?: string;
    colorScheme?: 'dark' | 'light' | 'auto';
    viewport?: Viewport;
    extraHttpHeaders?: Record<string, string> | undefined;
  }): Promise<void> {
    const page = this.pptrPage;
    const newSettings: EmulationSettings = {...this.emulationSettings};

    // Skip network emulation if blocklist/allowlist is configured, as it conflicts with blocking rules in Puppeteer.
    if (this.#hasNetworkBlockOrAllowlist) {
      if (options.networkConditions !== undefined) {
        throw new Error(
          'Network throttling is not supported when network blocking (allowlist/blocklist) is configured.',
        );
      }
    } else if (!options.networkConditions) {
      await page.emulateNetworkConditions(null);
      delete newSettings.networkConditions;
    } else if (options.networkConditions === 'Offline') {
      await page.emulateNetworkConditions({
        offline: true,
        download: 0,
        upload: 0,
        latency: 0,
      });
      newSettings.networkConditions = 'Offline';
    } else if (options.networkConditions in PredefinedNetworkConditions) {
      const networkCondition =
        PredefinedNetworkConditions[
          options.networkConditions as keyof typeof PredefinedNetworkConditions
        ];
      await page.emulateNetworkConditions(networkCondition);
      newSettings.networkConditions = options.networkConditions;
    }

    const secondarySession = this.devtoolsUniverse?.session;
    if (!options.cpuThrottlingRate) {
      await page.emulateCPUThrottling(1);
      if (secondarySession) {
        await secondarySession.send('Emulation.setCPUThrottlingRate', {
          rate: 1,
        });
      }
      delete newSettings.cpuThrottlingRate;
    } else {
      await page.emulateCPUThrottling(options.cpuThrottlingRate);
      if (secondarySession) {
        await secondarySession.send('Emulation.setCPUThrottlingRate', {
          rate: options.cpuThrottlingRate,
        });
      }
      newSettings.cpuThrottlingRate = options.cpuThrottlingRate;
    }

    if (!options.geolocation) {
      await page.setGeolocation({latitude: 0, longitude: 0});
      delete newSettings.geolocation;
    } else {
      await page.setGeolocation(options.geolocation);
      newSettings.geolocation = options.geolocation;
    }

    if (!options.userAgent) {
      await page.setUserAgent({userAgent: undefined});
      delete newSettings.userAgent;
    } else {
      await page.setUserAgent({userAgent: options.userAgent});
      newSettings.userAgent = options.userAgent;
    }

    if (!options.colorScheme || options.colorScheme === 'auto') {
      await page.emulateMediaFeatures([
        {name: 'prefers-color-scheme', value: ''},
      ]);
      delete newSettings.colorScheme;
    } else {
      await page.emulateMediaFeatures([
        {name: 'prefers-color-scheme', value: options.colorScheme},
      ]);
      newSettings.colorScheme = options.colorScheme;
    }

    if (!options.viewport) {
      delete newSettings.viewport;
    } else {
      const defaults = {
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
        isLandscape: false,
      };
      newSettings.viewport = {...defaults, ...options.viewport};
    }

    if (options.extraHttpHeaders !== undefined) {
      await page.setExtraHTTPHeaders(options.extraHttpHeaders);
      newSettings.extraHttpHeaders = options.extraHttpHeaders;
      if (Object.keys(options.extraHttpHeaders).length === 0) {
        delete newSettings.extraHttpHeaders;
      }
    }

    this.emulationSettings = Object.keys(newSettings).length ? newSettings : {};

    this.updateTimeouts();

    // This should happen after updating the page timeouts.
    // Setting the viewport can trigger a reload which we don't want to timeout.
    await page.setViewport(newSettings.viewport ?? null);
  }

  updateTimeouts() {
    // For waiters 5sec timeout should be sufficient.
    // Increased in case we throttle the CPU
    const cpuMultiplier = this.cpuThrottlingRate;
    this.pptrPage.setDefaultTimeout(DEFAULT_TIMEOUT * cpuMultiplier);
    // 10sec should be enough for the load event to be emitted during
    // navigations.
    // Increased in case we throttle the network requests or the CPU
    const networkMultiplier = getNetworkMultiplierFromString(
      this.networkConditions,
    );
    this.pptrPage.setDefaultNavigationTimeout(
      NAVIGATION_TIMEOUT * networkMultiplier * cpuMultiplier,
    );
  }

  waitForTextOnPage(text: string[], timeout?: number): Promise<Element> {
    const frames = this.pptrPage.frames();

    let locator = this.#locatorClass.race(
      frames.flatMap(frame =>
        text.flatMap(value => [
          frame.locator(`aria/${value}`),
          frame.locator(`text/${value}`),
        ]),
      ),
    );

    if (timeout) {
      locator = locator.setTimeout(timeout);
    }

    return locator.wait();
  }

  /**
   * We need to ignore favicon request as they make our test flaky
   */
  async setUpNetworkCollectorForTesting() {
    this.networkCollector.dispose();
    this.networkCollector = new NetworkCollector(this.pptrPage, collect => {
      return {
        request: req => {
          if (req.url().includes('favicon.ico')) {
            return;
          }
          collect(req);
        },
      } as ListenerMap;
    });
  }
}
