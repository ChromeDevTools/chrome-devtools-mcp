/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

import {BrowserManager} from './BrowserManager.js';
import {type ParsedArguments} from './config/ConfigParser.js';
import {DEFAULT_FILESYSTEM_ROOT} from './config/mcp-options.js';
import {ServerConfig} from './config/ServerConfig.js';
import {loadIssueDescriptions} from './devtools/issueDescriptions.js';
import {McpContext} from './McpContext.js';
import {HeapSnapshotManager} from './processors/HeapSnapshotManager.js';
import {ClearcutLogger} from './telemetry/ClearcutLogger.js';
import {FilePersistence} from './telemetry/persistence.js';
import {
  type CallToolResult,
  McpServer as SdkMcpServer,
  ProtocolError,
  ProtocolErrorCode,
  type RegisteredTool,
  type Root,
  type Transport,
  Mutex,
  puppeteer,
} from './third_party/index.js';
import {ToolHandler} from './ToolHandler.js';
import type {AnyToolDefinition} from './tools/ToolDefinition.js';
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

interface ToolEntry {
  handler: ToolHandler;
  registeredTool: RegisteredTool;
}

export class McpServer {
  readonly server: SdkMcpServer;
  #config: ServerConfig;
  #browserManager: BrowserManager;
  #context: McpContext;
  #heapSnapshotManager = new HeapSnapshotManager();

  /**
   * Client roots stay valid across browser reconnects and only the client can
   * invalidate them through a `roots/list_changed` notification. CLI-configured
   * roots are read from `#config` when combining roots.
   */
  #lastClientRoots?: Root[];
  /**
   * Whether a tool call already waited for the initial `roots/list`, so a
   * client that negotiates roots but never answers only delays the first call.
   */
  #awaitedInitialRoots = false;
  #toolMutex = new Mutex();
  #tools = new Map<string, ToolEntry>();

  private constructor(config: ServerConfig, options: McpServerOptions) {
    this.#config = config;
    this.#browserManager = options.browserManager;
    const serverArgs = this.#config.resolved;

    if (serverArgs.usageStatistics) {
      ClearcutLogger.initialize({
        persistence: new FilePersistence(),
        logFile: serverArgs.logFile,
        appVersion: VERSION,
        clearcutEndpoint: serverArgs.clearcutEndpoint,
        clearcutForceFlushIntervalMs: serverArgs.clearcutForceFlushIntervalMs,
        clearcutIncludePidHeader: serverArgs.clearcutIncludePidHeader,
      });
    }

    this.server = new SdkMcpServer(
      {
        name: 'chrome_devtools',
        title: 'Chrome DevTools MCP server',
        version: VERSION,
      },
      {
        capabilities: {logging: {}, tools: {listChanged: true}},
        // Enabling or updating many tools at once sends a single notification.
        debouncedNotificationMethods: ['notifications/tools/list_changed'],
      },
    );

    this.#context = McpContext.create(logger, {
      config: this.#config,
      heapSnapshotManager: this.#heapSnapshotManager,
      getBrowser: () => this.#browserManager.ensureBrowser(),
    });
    this.#context.setRoots(this.#combinedRoots());

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
        !this.#config.resolved.allowUnrestrictedPaths &&
        ((this.#config.resolved.filesystemRoot ?? []).length === 0 ||
          this.#config.resolved.filesystemRoot === DEFAULT_FILESYSTEM_ROOT)
      ) {
        console.warn(
          '[chrome-devtools-mcp] The connecting client did not negotiate the MCP roots ' +
            'capability. Tools that read or write local files will be restricted to the OS temp directory. ' +
            'To restore the previous unrestricted behavior, start the server with ' +
            '--allow-unrestricted-paths.',
        );
      }
    };
  }

  async connect(transport: Transport): Promise<void> {
    return await this.server.connect(transport);
  }

  async callTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<CallToolResult> {
    const toolHandler = this.#tools.get(name)?.handler;
    if (!toolHandler) {
      return {
        content: [
          {
            type: 'text',
            text: `Tool ${name} not found`,
          },
        ],
        isError: true,
      };
    }
    return await toolHandler.handle(args);
  }

  /**
   * Closes the MCP connection and disposes internal context/listeners.
   */
  async close(): Promise<void> {
    try {
      this.#context.dispose();
    } catch (err) {
      logger?.('Failed to dispose context', err);
    }
    this.#heapSnapshotManager.dispose();
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
    config: ServerConfig,
    options: McpServerOptions,
  ): Promise<McpServer> {
    const server = new McpServer(config, options);
    await server.#init();
    return server;
  }

  async #init(): Promise<void> {
    // Tool definitions take a ParsedArguments snapshot; reload recreates them.
    for (const tool of createTools(this.#config.resolved)) {
      this.#registerTool(tool);
    }
    this.#setToolCallRequestHandler();
    await loadIssueDescriptions();
  }

  #combinedRoots(): Root[] | undefined {
    const serverArgs = this.#config.resolved;
    const configuredRoots = (
      serverArgs.allowUnrestrictedPaths ? [] : (serverArgs.filesystemRoot ?? [])
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
   * background refreshes (on initialization and `roots/list_changed`) block
   * nobody, so bounding them would just discard roots a slow client was about
   * to send
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
      this.#context.setRoots(this.#combinedRoots());
    } catch (e) {
      logger?.('Failed to list roots', e);
    }
  }

  async #getContext(): Promise<McpContext> {
    if (this.#lastClientRoots === undefined && !this.#awaitedInitialRoots) {
      this.#awaitedInitialRoots = true;
      // Nothing listed yet, so this call has to wait – bounded, since it is
      // holding the tool mutex, and a later background refresh still lands
      await this.#updateRoots(ROOTS_REQUEST_TIMEOUT);
    }
    return this.#context;
  }

  #createToolHandler(tool: AnyToolDefinition): ToolHandler {
    return new ToolHandler(
      tool,
      this.#config,
      () => this.#getContext(),
      this.#toolMutex,
      () => this.#browserManager.abandonPendingAttempt(),
    );
  }

  /**
   * Overrides the SDK's `tools/call` handler so enabled and input-schema
   * checks run inside `ToolHandler.handle()` after acquiring `#toolMutex`.
   */
  #setToolCallRequestHandler(): void {
    this.server.server.setRequestHandler('tools/call', async request => {
      const entry = this.#tools.get(request.params.name);
      if (!entry) {
        throw new ProtocolError(
          ProtocolErrorCode.InvalidParams,
          `Tool ${request.params.name} not found`,
        );
      }
      const result = await entry.handler.handle(request.params.arguments, {
        viaMcp: true,
      });
      return this.server.server.projectCallToolResult(result, undefined);
    });
  }

  #registerTool(tool: AnyToolDefinition): void {
    const handler = this.#createToolHandler(tool);

    const registeredTool = this.server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: handler.registeredInputSchema,
        annotations: tool.annotations,
      },
      args => handler.handle(args),
    );

    if (handler.disabled) {
      registeredTool.disable();
    }

    this.#tools.set(tool.name, {handler, registeredTool});
  }
}

/**
 * Creates and initializes a Chrome DevTools MCP server instance.
 *
 * Maintained as a public API for backwards compatibility because external
 * consumers and integrations rely on `createMcpServer()`. For new code,
 * prefer using `McpServer.from(config, options)`.
 */
export async function createMcpServer(
  serverArgs: ParsedArguments,
  options: {
    logFile?: fs.WriteStream;
  },
): Promise<{server: SdkMcpServer}> {
  // BrowserManager only reads non-reloadable browser launch and connection
  // options.
  const browserManager = new BrowserManager(serverArgs, {
    logFile: options.logFile,
  });
  // createMcpServer takes a flat ParsedArguments snapshot and only returns
  // SdkMcpServer, so instances created here are never reloaded.
  const server = await McpServer.from(
    new ServerConfig({
      cliArgs: {},
      fileArgs: {},
      configPath: undefined,
      resolved: serverArgs,
    }),
    {
      browserManager,
      ...options,
    },
  );
  return {server: server.server};
}
