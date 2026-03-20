/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type fs from 'node:fs';

import type {ParsedArguments} from './bin/chrome-devtools-mcp-cli-options.js';
import type {Channel} from './browser.js';
import {ensureBrowserConnected, launch} from './browser.js';
import {logger} from './logger.js';
import {McpContext} from './McpContext.js';
import type {Browser} from './third_party/index.js';

interface McpContextOptions {
  experimentalDevToolsDebugging: boolean;
  experimentalIncludeAllPages?: boolean;
  performanceCrux: boolean;
}

export interface SessionInfo {
  id: number;
  name: string;
  connectionType: 'launched' | 'connected';
  connectionInfo: string;
  isActive: boolean;
  pageCount: number;
}

export interface LaunchSessionOptions {
  name?: string;
  headless?: boolean;
  channel?: Channel;
  isolated?: boolean;
  executablePath?: string;
  url?: string;
}

export interface ConnectSessionOptions {
  name?: string;
  browserUrl?: string;
  wsEndpoint?: string;
  wsHeaders?: Record<string, string>;
}

interface Session {
  id: number;
  name: string;
  browser: Browser;
  context: McpContext;
  connectionType: 'launched' | 'connected';
  connectionInfo: string;
}

export class SessionManager {
  #sessions = new Map<number, Session>();
  #sessionsByName = new Map<string, Session>();
  #activeSessionId: number | undefined;
  #nextSessionId = 1;
  #contextOpts: McpContextOptions;

  constructor(contextOpts: McpContextOptions) {
    // contextOpts are the McpContext options shared across sessions
    this.#contextOpts = contextOpts;
  }

  hasActiveSession(): boolean {
    return this.#activeSessionId !== undefined &&
      this.#sessions.has(this.#activeSessionId);
  }

  getActiveContext(): McpContext {
    if (!this.#activeSessionId) {
      throw new Error('No active session. Call create_session or list_sessions first.');
    }
    const session = this.#sessions.get(this.#activeSessionId);
    if (!session) {
      throw new Error('Active session not found.');
    }
    return session.context;
  }

  /**
   * Creates the default session from CLI args. This replicates the existing
   * browser initialization logic from index.ts getContext().
   */
  async createDefaultSession(
    serverArgs: ParsedArguments,
    logFile?: fs.WriteStream,
  ): Promise<Session> {
    const chromeArgs: string[] = (serverArgs.chromeArg ?? []).map(String);
    const ignoreDefaultChromeArgs: string[] = (
      serverArgs.ignoreDefaultChromeArg ?? []
    ).map(String);
    if (serverArgs.proxyServer) {
      chromeArgs.push(`--proxy-server=${serverArgs.proxyServer}`);
    }
    const devtools = serverArgs.experimentalDevtools ?? false;

    let browser: Browser;
    let connectionType: 'launched' | 'connected';
    let connectionInfo: string;

    if (serverArgs.browserUrl || serverArgs.wsEndpoint || serverArgs.autoConnect) {
      browser = await ensureBrowserConnected({
        browserURL: serverArgs.browserUrl,
        wsEndpoint: serverArgs.wsEndpoint,
        wsHeaders: serverArgs.wsHeaders,
        channel: serverArgs.autoConnect
          ? (serverArgs.channel as Channel)
          : undefined,
        userDataDir: serverArgs.userDataDir,
        devtools,
        enableExtensions: serverArgs.categoryExtensions,
      });
      connectionType = 'connected';
      connectionInfo = serverArgs.wsEndpoint ?? serverArgs.browserUrl ?? 'auto-connect';
    } else {
      browser = await launch({
        headless: serverArgs.headless,
        executablePath: serverArgs.executablePath,
        channel: serverArgs.channel as Channel,
        isolated: serverArgs.isolated ?? false,
        userDataDir: serverArgs.userDataDir,
        logFile,
        viewport: serverArgs.viewport,
        chromeArgs,
        ignoreDefaultChromeArgs,
        acceptInsecureCerts: serverArgs.acceptInsecureCerts,
        devtools,
        enableExtensions: serverArgs.categoryExtensions,
        viaCli: serverArgs.viaCli,
      });
      connectionType = 'launched';
      connectionInfo = serverArgs.channel ?? 'stable';
    }

    const context = await McpContext.from(browser, logger, this.#contextOpts);
    return this.#addSession('default', browser, context, connectionType, connectionInfo);
  }

  async launchSession(opts: LaunchSessionOptions): Promise<Session> {
    const name = opts.name ?? `session-${this.#nextSessionId}`;
    this.#validateName(name);

    const browser = await launch({
      headless: opts.headless ?? false,
      channel: opts.channel as Channel,
      isolated: opts.isolated ?? true,
      executablePath: opts.executablePath,
      devtools: false,
    });

    const context = await McpContext.from(browser, logger, this.#contextOpts);
    return this.#addSession(name, browser, context, 'launched', opts.channel ?? 'stable');
  }

  async connectSession(opts: ConnectSessionOptions): Promise<Session> {
    const name = opts.name ?? `session-${this.#nextSessionId}`;
    this.#validateName(name);

    if (!opts.browserUrl && !opts.wsEndpoint) {
      throw new Error('Either browserUrl or wsEndpoint must be provided.');
    }

    const browser = await ensureBrowserConnected({
      browserURL: opts.browserUrl,
      wsEndpoint: opts.wsEndpoint,
      wsHeaders: opts.wsHeaders,
      devtools: false,
    });

    const context = await McpContext.from(browser, logger, this.#contextOpts);
    const connectionInfo = opts.wsEndpoint ?? opts.browserUrl ?? 'unknown';
    return this.#addSession(name, browser, context, 'connected', connectionInfo);
  }

  selectSession(id: number): void {
    const session = this.#sessions.get(id);
    if (!session) {
      throw new Error(`Session ${id} not found.`);
    }
    this.#activeSessionId = id;
  }

  selectSessionByName(name: string): void {
    const session = this.#sessionsByName.get(name);
    if (!session) {
      throw new Error(`Session '${name}' not found.`);
    }
    this.#activeSessionId = session.id;
  }

  async closeSession(id: number): Promise<void> {
    const session = this.#sessions.get(id);
    if (!session) {
      throw new Error(`Session ${id} not found.`);
    }

    const mode = session.connectionType === 'launched' ? 'close' : 'disconnect';
    await session.context.close(mode);

    this.#sessions.delete(id);
    this.#sessionsByName.delete(session.name);

    // If we closed the active session, auto-select the next one
    if (this.#activeSessionId === id) {
      const remaining = [...this.#sessions.keys()];
      this.#activeSessionId = remaining.length > 0 ? remaining[0] : undefined;
    }
  }

  listSessions(): SessionInfo[] {
    const result: SessionInfo[] = [];
    for (const session of this.#sessions.values()) {
      result.push({
        id: session.id,
        name: session.name,
        connectionType: session.connectionType,
        connectionInfo: session.connectionInfo,
        isActive: session.id === this.#activeSessionId,
        pageCount: session.context.getPages().length,
      });
    }
    return result;
  }

  async disposeAll(): Promise<void> {
    for (const session of this.#sessions.values()) {
      const mode = session.connectionType === 'launched' ? 'close' : 'disconnect';
      try {
        await session.context.close(mode);
      } catch {
        // Ignore cleanup errors.
      }
    }
    this.#sessions.clear();
    this.#sessionsByName.clear();
    this.#activeSessionId = undefined;
  }

  #addSession(
    name: string,
    browser: Browser,
    context: McpContext,
    connectionType: 'launched' | 'connected',
    connectionInfo: string,
  ): Session {
    const id = this.#nextSessionId++;
    const session: Session = {
      id,
      name,
      browser,
      context,
      connectionType,
      connectionInfo,
    };
    this.#sessions.set(id, session);
    this.#sessionsByName.set(name, session);
    this.#activeSessionId = id;
    return session;
  }

  #validateName(name: string): void {
    if (this.#sessionsByName.has(name)) {
      throw new Error(`Session with name '${name}' already exists.`);
    }
  }
}
