/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

import {BrowserManager} from './BrowserManager.js';
import {type ParsedArguments} from './config/mcp-options.js';
import {loadIssueDescriptions} from './devtools/issueDescriptions.js';
import {McpContext} from './McpContext.js';
import {ClearcutLogger} from './telemetry/ClearcutLogger.js';
import {FilePersistence} from './telemetry/persistence.js';
import {
  McpServer as SdkMcpServer,
  type Root,
  type Transport,
  Mutex,
  puppeteer,
} from './third_party/index.js';
import {ToolHandler} from './ToolHandler.js';
import type {DefinedPageTool, ToolDefinition} from './tools/ToolDefinition.js';
import {createTools} from './tools/tools.js';
import {logger} from './utils/logger.js';
import {VERSION} from './version.js';

puppeteer.setFollowSymlinks(false);

/**
 * Timeout for a `roots/list` that a tool call is waiting on, matching the 5s
 * default used for page operations. `getContext()` awaits it while
 * `ToolHandler` holds the tool mutex, so leaving it unbounded lets a client
 * that negotiates `roots` but does not answer block every tool for the SDK's
 * default of 60s. Background refreshes are not bounded by this, so roots a
 * slow client sends late still land.
 */
const ROOTS_REQUEST_TIMEOUT = 5_000;

export interface McpServerOptions {
  browserManager: BrowserManager;
  logFile?: fs.WriteStream;
}

export class McpServer {
  readonly server: SdkMcpServer;
  #serverArgs: ParsedArguments;
  #browserManager: BrowserManager;
  #context?: McpContext;

  /**
   * Client roots stay valid across browser reconnects and only the client can
   * invalidate them through a `roots/list_changed` notification. CLI-configured
   * roots are read from `#serverArgs` when combining roots.
   */
  #lastClientRoots?: Root[];
  #toolMutex = new Mutex();

  private constructor(serverArgs: ParsedArguments, options: McpServerOptions) {
    this.#serverArgs = serverArgs;
    this.#browserManager = options.browserManager;

    if (this.#serverArgs.usageStatistics) {
      ClearcutLogger.initialize({
        persistence: new FilePersistence(),
        logFile: this.#serverArgs.logFile,
        appVersion: VERSION,
        clearcutEndpoint: this.#serverArgs.clearcutEndpoint,
        clearcutForceFlushIntervalMs:
          this.#serverArgs.clearcutForceFlushIntervalMs,
        clearcutIncludePidHeader: this.#serverArgs.clearcutIncludePidHeader,
      });
    }

    this.server = new SdkMcpServer(
      {
        name: 'chrome_devtools',
        title: 'Chrome DevTools MCP server',
        version: VERSION,
      },
      {capabilities: {logging: {}}},
    );

    this.server.server.setRequestHandler('logging/setLevel', () => {
      return {};
    });

    this.server.server.oninitialized = () => {
      const clientName = this.server.server.getClientVersion()?.name;
      if (clientName) {
        ClearcutLogger.get()?.setClientName(clientName);
      }
      if (this.server.server.getClientCapabilities()?.roots) {
        void this.#updateRoots();
        this.server.server.setNotificationHandler(
          'notifications/roots/list_changed',
          () => {
            void this.#updateRoots();
          },
        );
      } else if (
        !this.#serverArgs.allowUnrestrictedPaths &&
        (this.#serverArgs.filesystemRoot ?? []).length === 0
      ) {
        console.warn(
          '[chrome-devtools-mcp] The connecting client did not negotiate the MCP roots ' +
            'capability. File-writing tools will be restricted to the OS temp directory. ' +
            'To restore the previous unrestricted behavior, start the server with ' +
            '--allow-unrestricted-paths.',
        );
      }

      if (this.#serverArgs.autoConnect) {
        void this.#browserManager.ensureBrowser().catch(err => {
          logger?.('Failed to connect to Chrome during initialization', err);
        });
      }
    };
  }

  async connect(transport: Transport): Promise<void> {
    return await this.server.connect(transport);
  }

  /**
   * Closes the MCP connection and disposes internal context/listeners.
   */
  async close(): Promise<void> {
    try {
      this.#context?.dispose();
    } catch (err) {
      logger?.('Failed to dispose context', err);
    } finally {
      this.#context = undefined;
    }
    await Promise.allSettled([
      this.#browserManager.close(),
      this.server.close(),
    ]);
  }

  [Symbol.dispose](): void {
    this.close().catch(err => {
      logger?.('Failed to dispose McpServer', err);
    });
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  static async from(
    serverArgs: ParsedArguments,
    options: McpServerOptions,
  ): Promise<McpServer> {
    const server = new McpServer(serverArgs, options);
    await server.#init();
    return server;
  }

  async #init(): Promise<void> {
    const tools = createTools(this.#serverArgs);
    for (const tool of tools) {
      this.#registerTool(tool);
    }
    await loadIssueDescriptions();
  }

  #combinedRoots(): Root[] | undefined {
    const configuredRoots = (
      this.#serverArgs.allowUnrestrictedPaths
        ? []
        : (this.#serverArgs.filesystemRoot ?? [])
    ).map(root => {
      const rootPath = path.resolve(root);
      return {
        uri: pathToFileURL(rootPath).href,
        name: path.basename(rootPath) || rootPath,
      };
    });
    if (configuredRoots.length === 0 && this.#lastClientRoots === undefined) {
      return undefined;
    }
    return [...configuredRoots, ...(this.#lastClientRoots ?? [])];
  }

  /**
   * `timeout` is only passed where a tool call is waiting on the result – the
   * background refreshes below block nobody, so bounding them would just discard
   * roots a slow client was about to send
   */
  async #updateRoots(timeout?: number): Promise<void> {
    if (!this.server.server.getClientCapabilities()?.roots) {
      return;
    }
    try {
      const result = await this.server.server.request(
        {method: 'roots/list'},
        timeout === undefined ? undefined : {timeout},
      );
      this.#lastClientRoots = result.roots;
      this.#context?.setRoots(this.#combinedRoots());
    } catch (e) {
      logger?.('Failed to list roots', e);
    }
  }

  async #getContext(): Promise<McpContext> {
    if (
      this.#serverArgs.autoConnect &&
      this.#browserManager.isBrowserInitializing()
    ) {
      throw new Error(
        'Chrome is still waiting for the remote debugging connection to be approved. Approve the request in Chrome, then retry this tool call.',
      );
    }
    const browser = await this.#browserManager.ensureBrowser();

    if (this.#context?.browser !== browser) {
      this.#context?.dispose();
      this.#context = await McpContext.from(browser, logger, {
        experimentalDevToolsDebugging:
          this.#serverArgs.experimentalDevtools ?? false,
        experimentalIncludeAllPages:
          this.#serverArgs.experimentalIncludeAllPages,
        performanceCrux: this.#serverArgs.performanceCrux,
        sourceMaps: this.#serverArgs.sourceMaps,
        allowlist: this.#serverArgs.allowedUrlPattern,
        blocklist: this.#serverArgs.blockedUrlPattern,
        allowUnrestrictedPaths: this.#serverArgs.allowUnrestrictedPaths,
        // Surfaces a one-time note in the next response after a reconnect.
        reconnected: this.#context !== undefined,
        categoryExtensions: this.#serverArgs.categoryExtensions,
        onNotification: (message: string) => {
          void this.server
            .sendLoggingMessage({
              level: 'info',
              data: message,
            })
            .catch(e => {
              logger?.('Failed to send MCP notification', e);
            });
        },
      });
      this.#context.setRoots(this.#combinedRoots());
      if (this.#lastClientRoots === undefined) {
        // Nothing listed yet, so this call has to wait – bounded, since it is
        // holding the tool mutex, and a later background refresh still lands
        await this.#updateRoots(ROOTS_REQUEST_TIMEOUT);
      } else {
        // Carry the known roots over and refresh out of band, so a reconnect
        // never pays for a client round-trip
        void this.#updateRoots();
      }
    }
    return this.#context;
  }

  #registerTool(tool: ToolDefinition | DefinedPageTool): void {
    const toolHandler = new ToolHandler(
      tool,
      this.#serverArgs,
      () => this.#getContext(),
      this.#toolMutex,
    );

    const registeredTool = this.server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: toolHandler.registeredInputSchema,
        annotations: tool.annotations,
      },
      toolHandler.handle,
    );

    if (toolHandler.disabled) {
      registeredTool.disable();
    }
  }
}

/**
 * Creates and initializes a Chrome DevTools MCP server instance.
 *
 * Maintained as a public API for backwards compatibility because external
 * consumers and integrations rely on `createMcpServer()`. For new code,
 * prefer using `McpServer.from(serverArgs, options)`.
 */
export async function createMcpServer(
  serverArgs: ParsedArguments,
  options: {
    logFile?: fs.WriteStream;
  },
): Promise<{server: SdkMcpServer}> {
  const browserManager = new BrowserManager(serverArgs, {
    logFile: options.logFile,
  });
  const server = await McpServer.from(serverArgs, {
    browserManager,
    ...options,
  });
  return {server: server.server};
}

export const logDisclaimers = (args: ParsedArguments) => {
  console.error(
    `chrome-devtools-mcp exposes content of the browser instance to the MCP clients allowing them to inspect,
debug, and modify any data in the browser or DevTools.
Avoid sharing sensitive or personal information that you do not want to share with MCP clients.`,
  );

  if (!args.slim && args.performanceCrux) {
    console.error(
      `Performance tools may send trace URLs to the Google CrUX API to fetch real-user experience data. To disable, run with --no-performance-crux.`,
    );
  }

  if (!args.slim && args.usageStatistics) {
    console.error(
      `
Google collects usage statistics to improve Chrome DevTools MCP. To opt-out, run with --no-usage-statistics.
For more details, visit: https://github.com/ChromeDevTools/chrome-devtools-mcp#usage-statistics`,
    );
  }
};
