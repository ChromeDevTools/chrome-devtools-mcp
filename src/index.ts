/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

import {BrowserManager} from './BrowserManager.js';
import {ConfigParser} from './config/ConfigParser.js';
import {ConfigWatcher} from './config/ConfigWatcher.js';
import {
  DEFAULT_FILESYSTEM_ROOT,
  type ParsedArguments,
} from './config/mcp-options.js';
import {ServerConfig} from './config/ServerConfig.js';
import {loadIssueDescriptions} from './devtools/issueDescriptions.js';
import type {McpContext} from './McpContext.js';
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
} from './third_party/index.js';
import {ToolHandler} from './ToolHandler.js';
import type {AnyToolDefinition} from './tools/ToolDefinition.js';
import {createTools} from './tools/tools.js';
import {logCruxDisclaimer} from './utils/disclaimers.js';
import {parseDurationMs} from './utils/duration.js';
import {getErrorMessage} from './utils/errorHandling.js';
import {IdleTimer} from './utils/IdleTimer.js';
import {logger} from './utils/logger.js';
import {TaskRunner} from './utils/TaskRunner.js';
import {VERSION} from './version.js';

/**
 * Timeout for a `roots/list` that a tool call is waiting on, matching the 5s
 * default used for page operations. `getContext()` awaits it before
 * `ToolHandler` enters the task runner, so leaving it unbounded lets a client
 * that negotiates `roots` but does not answer delay every tool for the SDK's
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
  #context?: McpContext;
  #contextPromise?: Promise<McpContext>;
  #closed = false;
  /** Runs every tool call and config reload. */
  #taskRunner = new TaskRunner();
  #heapSnapshotManager = new HeapSnapshotManager(this.#taskRunner);

  /**
   * Client roots stay valid across browser reconnects and only the client can
   * invalidate them through a `roots/list_changed` notification. CLI-configured
   * roots are read from `#config` when combining roots.
   */
  #lastClientRoots?: Root[];
  /**
   * The bounded initial `roots/list` request. Every tool call that starts
   * before the client answered waits on the same request, so a client that
   * negotiates roots but never answers only delays the first calls.
   */
  #initialRoots?: Promise<void>;
  #configWatcher?: ConfigWatcher;
  #idleTimer?: IdleTimer;
  #idleCloseAbortController?: AbortController;
  #tools = new Map<string, ToolEntry>();

  private constructor(config: ServerConfig, options: McpServerOptions) {
    this.#config = config;
    this.#browserManager = options.browserManager;
    const serverArgs = this.#config.resolved;
    if (serverArgs.idleTimeout !== undefined) {
      this.#idleTimer = new IdleTimer({
        timeoutMs: parseDurationMs('idleTimeout', serverArgs.idleTimeout),
        onIdle: () => {
          void this.#closeIdleBrowser();
        },
      });
    }

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
    if (this.#config.resolved.watchConfig) {
      this.watchConfig();
    }
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
    return await this.#handleToolCall(toolHandler, args);
  }

  /**
   * Applies a new config to the running server. Only reloadable options are
   * applied, all other options keep the value the server was started with.
   * Tools are updated in place and only tools whose listing changed notify
   * the client, which results in at most one `tools/list_changed`
   * notification.
   */
  async applyConfig(config: ServerConfig): Promise<void> {
    // Goes ahead of waiting tool calls and waits for running ones, so every
    // waiting call runs with the new config.
    using guard = await this.#taskRunner.pause();
    await this.#applyConfigLocked(this.#config.mergeReloadable(config));
  }

  async #applyConfigLocked(nextConfig: ServerConfig): Promise<void> {
    const previousArgs = this.#config.resolved;
    const nextArgs = nextConfig.resolved;
    // Build everything before committing so that a throwing tool factory
    // leaves the server untouched.
    const updates: Array<{
      entry: ToolEntry;
      tool: AnyToolDefinition;
    }> = [];
    for (const tool of createTools(nextArgs)) {
      const entry = this.#tools.get(tool.name);
      if (entry) {
        updates.push({entry, tool});
      }
    }

    this.#config.commit(nextConfig);
    for (const {entry, tool} of updates) {
      if (entry.handler.update(tool)) {
        entry.registeredTool.update({
          description: tool.description,
          paramsSchema: entry.handler.registeredInputSchema,
          annotations: tool.annotations,
          enabled: !entry.handler.disabled,
        });
      }
    }

    if (!previousArgs.performanceCrux || previousArgs.slim) {
      logCruxDisclaimer(nextArgs);
    }

    if (this.#context) {
      this.#context.setRoots(this.#combinedRoots());
      await this.#context.onConfigChanged(previousArgs);
    }
  }

  /**
   * Watches the config file and applies its changes to the running server.
   */
  watchConfig(): void {
    const configPath = this.#config.configPath;
    if (!configPath) {
      console.error(
        '--watchConfig has no effect because no config file was found.',
      );
      return;
    }
    this.#configWatcher?.dispose();
    this.#configWatcher = undefined;
    const watcher = new ConfigWatcher(configPath, content =>
      this.#reloadConfig(watcher, configPath, content),
    );
    try {
      watcher.start();
    } catch (err) {
      watcher.dispose();
      console.error(`Failed to watch ${configPath}: ${getErrorMessage(err)}`);
      return;
    }
    this.#configWatcher = watcher;
  }

  async #reloadConfig(
    watcher: ConfigWatcher,
    configPath: string,
    content: string,
  ): Promise<void> {
    using guard = await this.#taskRunner.pause();
    if (this.#configWatcher !== watcher) {
      return;
    }
    let config: ServerConfig;
    let nextConfig: ServerConfig;
    try {
      const fileArgs = ConfigParser.parseConfigFile(configPath, content);
      config = this.#config.withFileArgs(fileArgs);
      nextConfig = this.#config.mergeReloadable(config);
    } catch (err) {
      const message = `Keeping the previous configuration, failed to reload ${configPath}: ${getErrorMessage(err)}`;
      logger?.(message);
      console.error(message);
      return;
    }
    await this.#applyConfigLocked(nextConfig);
    const restartRequired = this.#config.getRestartRequiredChanges(config);
    logger?.(`Applied config changes from ${configPath}`);
    if (restartRequired.length > 0) {
      const message = `Restart chrome-devtools-mcp to fully apply changes to ${restartRequired.map(name => `--${name}`).join(', ')} from ${configPath}.`;
      logger?.(message);
      console.error(message);
    }
  }

  /**
   * Closes the MCP connection and disposes internal context/listeners.
   */
  async close(): Promise<void> {
    this.#closed = true;
    this.#idleCloseAbortController?.abort();
    this.#idleTimer?.dispose();
    this.#configWatcher?.dispose();
    this.#configWatcher = undefined;
    try {
      this.#context?.dispose();
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
    server.#init();
    return server;
  }

  #init(): void {
    // Tool definitions take a ParsedArguments snapshot; reload recreates them.
    for (const tool of createTools(this.#config.resolved)) {
      this.#registerTool(tool);
    }
    this.#setToolCallRequestHandler();
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
      this.#context?.setRoots(this.#combinedRoots());
    } catch (e) {
      logger?.('Failed to list roots', e);
    }
  }

  #ensureContext(): Promise<McpContext> {
    if (this.#closed) {
      return Promise.reject(new Error('MCP server is closed'));
    }
    if (this.#context) {
      return Promise.resolve(this.#context);
    }
    this.#contextPromise ??= Promise.all([
      import('./McpContext.js'),
      loadIssueDescriptions(),
    ])
      .then(([mcpContextModule]) => {
        const context = mcpContextModule.McpContext.create(logger, {
          config: this.#config,
          heapSnapshotManager: this.#heapSnapshotManager,
          taskRunner: this.#taskRunner,
          getBrowser: () => this.#browserManager.ensureBrowser(),
        });
        if (this.#closed) {
          try {
            context.dispose();
          } catch (err) {
            logger?.('Failed to dispose context', err);
          }
          throw new Error('MCP server is closed');
        }
        context.setRoots(this.#combinedRoots());
        this.#context = context;
        return context;
      })
      .catch((err: unknown) => {
        this.#contextPromise = undefined;
        throw err;
      });
    return this.#contextPromise;
  }

  async #getContext(): Promise<McpContext> {
    if (this.#lastClientRoots === undefined) {
      // Nothing listed yet, so this call has to wait – bounded, since every
      // tool call waits on it, and a later background refresh still lands
      this.#initialRoots ??= this.#updateRoots(ROOTS_REQUEST_TIMEOUT);
      await this.#initialRoots;
    }
    return await this.#ensureContext();
  }

  #handleToolCall(
    handler: ToolHandler,
    args?: Record<string, unknown>,
    options?: {viaMcp?: boolean; signal?: AbortSignal},
  ): Promise<CallToolResult> {
    this.#idleCloseAbortController?.abort();
    const idleTimer = this.#idleTimer;
    if (!idleTimer) {
      return handler.handle(args, options);
    }
    return idleTimer.track(() => handler.handle(args, options));
  }

  async #closeIdleBrowser(): Promise<void> {
    if (this.#closed || this.#idleTimer?.hasActiveWork) {
      return;
    }
    const controller = new AbortController();
    this.#idleCloseAbortController = controller;
    try {
      using guard = await this.#taskRunner.pause(controller.signal);
      this.#idleCloseAbortController = undefined;
      if (
        this.#closed ||
        controller.signal.aborted ||
        this.#idleTimer?.hasActiveWork
      ) {
        return;
      }
      if (this.#context) {
        await this.#context.releaseScreencasts('the browser was idle');
        await this.#context.releasePerformanceTrace('the browser was idle');
        this.#context.onBrowserClosed();
      }
      await this.#browserManager.close();
    } catch (err) {
      if (!controller.signal.aborted) {
        logger?.('Failed to close idle browser', err);
      }
    } finally {
      if (this.#idleCloseAbortController === controller) {
        this.#idleCloseAbortController = undefined;
      }
    }
  }

  #createToolHandler(tool: AnyToolDefinition): ToolHandler {
    return new ToolHandler(
      tool,
      this.#config,
      () => this.#getContext(),
      () => this.#browserManager.abandonPendingAttempt(),
    );
  }

  /**
   * Overrides the SDK's `tools/call` handler so enabled and input-schema
   * checks run inside `ToolHandler.handle()` inside the task runner.
   */
  #setToolCallRequestHandler(): void {
    this.server.server.setRequestHandler('tools/call', async (request, ctx) => {
      const entry = this.#tools.get(request.params.name);
      if (!entry) {
        throw new ProtocolError(
          ProtocolErrorCode.InvalidParams,
          `Tool ${request.params.name} not found`,
        );
      }
      const result = await this.#handleToolCall(
        entry.handler,
        request.params.arguments,
        {
          viaMcp: true,
          signal: ctx.mcpReq.signal,
        },
      );
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
      args => this.#handleToolCall(handler, args),
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
  // createMcpServer takes a flat ParsedArguments snapshot and only returns
  // SdkMcpServer, so instances created here are never reloaded.
  const serverConfig = new ServerConfig({
    cliArgs: {},
    fileArgs: {},
    configPath: undefined,
    resolved: serverArgs,
  });
  const browserManager = new BrowserManager(serverConfig, {
    logFile: options.logFile,
  });
  const server = await McpServer.from(serverConfig, {
    browserManager,
    ...options,
  });
  return {server: server.server};
}
