/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

import type {Channel} from './browser.js';
import {ensureBrowserConnected, ensureBrowserLaunched} from './browser.js';
import {type ParsedArguments} from './config/mcp-options.js';
import {loadIssueDescriptions} from './devtools/issueDescriptions.js';
import {McpContext} from './McpContext.js';
import {ClearcutLogger} from './telemetry/ClearcutLogger.js';
import {FilePersistence} from './telemetry/persistence.js';
import {
  McpServer as SdkMcpServer,
  type CallToolResult,
  type Root,
  type Transport,
  SetLevelRequestSchema,
  ListRootsResultSchema,
  RootsListChangedNotificationSchema,
  Mutex,
  puppeteer,
} from './third_party/index.js';
import {ToolHandler} from './ToolHandler.js';
import type {DefinedPageTool, ToolDefinition} from './tools/ToolDefinition.js';
import {createTools} from './tools/tools.js';
import {logger} from './utils/logger.js';
import {VERSION} from './version.js';

export {buildFlag} from './ToolHandler.js';

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
  logFile?: fs.WriteStream;
}

export class McpServer {
  readonly server: SdkMcpServer;
  #serverArgs: ParsedArguments;
  #options: McpServerOptions;
  #context?: McpContext;
  #configuredRoots: Root[];

  /**
   * Client roots stay valid across browser reconnects and only the client can
   * invalidate them through a `roots/list_changed` notification. Explicitly
   * configured roots are process state and are always included.
   */
  #lastClientRoots?: Root[];
  #toolMutex = new Mutex();

  private constructor(
    serverArgs: ParsedArguments,
    options: McpServerOptions = {},
  ) {
    this.#serverArgs = serverArgs;
    this.#options = options;
    this.#configuredRoots = (serverArgs.filesystemRoot ?? []).map(root => {
      const rootPath = path.resolve(String(root));
      return {
        uri: pathToFileURL(rootPath).href,
        name: path.basename(rootPath) || rootPath,
      };
    });

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

    this.server.server.setRequestHandler(SetLevelRequestSchema, () => {
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
          RootsListChangedNotificationSchema,
          () => {
            void this.#updateRoots();
          },
        );
      } else if (
        !this.#serverArgs.allowUnrestrictedPaths &&
        this.#configuredRoots.length === 0
      ) {
        console.warn(
          '[chrome-devtools-mcp] The connecting client did not negotiate the MCP roots ' +
            'capability. File-writing tools will be restricted to the OS temp directory. ' +
            'To restore the previous unrestricted behavior, start the server with ' +
            '--allow-unrestricted-paths.',
        );
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
    this.#context?.dispose();
    this.#context = undefined;
    await this.server.close();
  }

  [Symbol.dispose](): void {
    this.close().catch(() => {
      // TODO: wire up the logger
    });
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  static async from(
    serverArgs: ParsedArguments,
    options: McpServerOptions = {},
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
    if (
      this.#configuredRoots.length === 0 &&
      this.#lastClientRoots === undefined
    ) {
      return undefined;
    }
    return [...this.#configuredRoots, ...(this.#lastClientRoots ?? [])];
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
      const roots = await this.server.server.request(
        {method: 'roots/list'},
        ListRootsResultSchema,
        timeout === undefined ? undefined : {timeout},
      );
      this.#lastClientRoots = roots.roots;
      this.#context?.setRoots(this.#combinedRoots());
    } catch (e) {
      logger?.('Failed to list roots', e);
    }
  }

  async #getContext(): Promise<McpContext> {
    const chromeArgs: string[] = (this.#serverArgs.chromeArg ?? []).map(String);
    const ignoreDefaultChromeArgs: string[] = (
      this.#serverArgs.ignoreDefaultChromeArg ?? []
    ).map(String);
    if (this.#serverArgs.proxyServer) {
      chromeArgs.push(`--proxy-server=${this.#serverArgs.proxyServer}`);
    }
    const devtools = this.#serverArgs.experimentalDevtools ?? false;
    const blocklist = this.#serverArgs.blockedUrlPattern
      ? this.#serverArgs.blockedUrlPattern.map(String)
      : undefined;
    const allowlist = this.#serverArgs.allowedUrlPattern
      ? this.#serverArgs.allowedUrlPattern.map(String)
      : undefined;

    const channel = this.#serverArgs.channel as Channel | undefined;

    const browser =
      this.#serverArgs.browserUrl ||
      this.#serverArgs.wsEndpoint ||
      this.#serverArgs.autoConnect
        ? await ensureBrowserConnected({
            browserURL: this.#serverArgs.browserUrl,
            wsEndpoint: this.#serverArgs.wsEndpoint,
            wsHeaders: this.#serverArgs.wsHeaders,
            // Important: only pass channel, if autoConnect is true.
            channel: this.#serverArgs.autoConnect ? channel : undefined,
            userDataDir: this.#serverArgs.userDataDir,
            devtools,
            blocklist,
            allowlist,
          })
        : await ensureBrowserLaunched({
            headless: this.#serverArgs.headless,
            executablePath: this.#serverArgs.executablePath,
            channel,
            isolated: this.#serverArgs.isolated ?? false,
            userDataDir: this.#serverArgs.userDataDir,
            logFile: this.#options.logFile,
            viewport: this.#serverArgs.viewport,
            chromeArgs,
            ignoreDefaultChromeArgs,
            acceptInsecureCerts: this.#serverArgs.acceptInsecureCerts,
            devtools,
            enableExtensions: this.#serverArgs.categoryExtensions,
            viaCli: this.#serverArgs.viaCli,
            blocklist,
            allowlist,
          });

    if (this.#context?.browser !== browser) {
      this.#context?.dispose();
      this.#context = await McpContext.from(browser, logger, {
        experimentalDevToolsDebugging: devtools,
        experimentalIncludeAllPages:
          this.#serverArgs.experimentalIncludeAllPages,
        performanceCrux: this.#serverArgs.performanceCrux,
        allowList: allowlist,
        blocklist: blocklist,
        allowUnrestrictedPaths: this.#serverArgs.allowUnrestrictedPaths,
        // Surfaces a one-time note in the next response after a reconnect.
        reconnected: this.#context !== undefined,
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
    if (this.#context === undefined) {
      throw new Error('MCP context was not initialized');
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

    if (!toolHandler.shouldRegister) {
      return;
    }

    this.server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: toolHandler.registeredInputSchema,
        annotations: tool.annotations,
      },
      async (params): Promise<CallToolResult> => {
        return await toolHandler.handle(params);
      },
    );
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
  options: McpServerOptions = {},
): Promise<{server: SdkMcpServer}> {
  const server = await McpServer.from(serverArgs, options);
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
