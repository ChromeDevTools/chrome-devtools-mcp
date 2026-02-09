/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';

import type {Channel} from './browser.js';
import {launch} from './browser.js';
import {logger} from './logger.js';
import {McpContext} from './McpContext.js';
import {Mutex} from './Mutex.js';
import type {Browser} from './third_party/index.js';

export interface SessionInfo {
  sessionId: string;
  browser: Browser;
  context: McpContext;
  mutex: Mutex;
  createdAt: Date;
  label?: string;
}

export interface CreateSessionOptions {
  headless?: boolean;
  executablePath?: string;
  channel?: Channel;
  userDataDir?: string;
  viewport?: {width: number; height: number};
  chromeArgs?: string[];
  ignoreDefaultChromeArgs?: string[];
  acceptInsecureCerts?: boolean;
  devtools?: boolean;
  enableExtensions?: boolean;
  label?: string;
}

export interface McpContextOptions {
  experimentalDevToolsDebugging: boolean;
  experimentalIncludeAllPages?: boolean;
  performanceCrux: boolean;
}

export class SessionManager {
  readonly #sessions = new Map<string, SessionInfo>();
  readonly #contextOptions: McpContextOptions;
  #shuttingDown = false;

  constructor(contextOptions: McpContextOptions) {
    this.#contextOptions = contextOptions;
  }

  async createSession(options: CreateSessionOptions): Promise<SessionInfo> {
    if (this.#shuttingDown) {
      throw new Error('Server is shutting down. Cannot create new sessions.');
    }

    const sessionId = crypto.randomUUID().slice(0, 8);
    logger(`Creating session ${sessionId}`);

    let browser: Browser | undefined;
    try {
      browser = await launch({
        headless: options.headless ?? false,
        executablePath: options.executablePath,
        channel: options.channel,
        userDataDir: options.userDataDir,
        // Always isolated to avoid profile conflicts between concurrent sessions
        isolated: true,
        viewport: options.viewport,
        chromeArgs: options.chromeArgs ?? [],
        ignoreDefaultChromeArgs: options.ignoreDefaultChromeArgs ?? [],
        acceptInsecureCerts: options.acceptInsecureCerts,
        devtools: options.devtools ?? false,
        enableExtensions: options.enableExtensions,
      });

      const context = await McpContext.from(
        browser,
        logger,
        this.#contextOptions,
      );
      const mutex = new Mutex();

      const session: SessionInfo = {
        sessionId,
        browser,
        context,
        mutex,
        createdAt: new Date(),
        label: options.label,
      };

      browser.on('disconnected', () => {
        logger(`Session ${sessionId} browser disconnected unexpectedly`);
        this.#purgeDisconnectedSession(sessionId);
      });

      this.#sessions.set(sessionId, session);
      logger(`Session ${sessionId} created`);
      return session;
    } catch (err) {
      if (browser?.connected) {
        try {
          await browser.close();
        } catch (closeErr) {
          logger(`Failed to close browser after creation failure:`, closeErr);
        }
      }
      throw err;
    }
  }

  getSession(sessionId: string): SessionInfo {
    const session = this.#sessions.get(sessionId);
    if (!session) {
      const available = [...this.#sessions.keys()].join(', ');
      throw new Error(
        `Session "${sessionId}" not found. Available sessions: ${available || 'none. Create one with create_session.'}`,
      );
    }
    if (!session.browser.connected) {
      this.#purgeDisconnectedSession(sessionId);
      throw new Error(
        `Session "${sessionId}" browser is disconnected. Create a new session.`,
      );
    }
    return session;
  }

  listSessions(): Array<{
    sessionId: string;
    createdAt: string;
    label?: string;
    connected: boolean;
  }> {
    const result: Array<{
      sessionId: string;
      createdAt: string;
      label?: string;
      connected: boolean;
    }> = [];

    for (const [, session] of this.#sessions) {
      result.push({
        sessionId: session.sessionId,
        createdAt: session.createdAt.toISOString(),
        label: session.label,
        connected: session.browser.connected,
      });
    }
    return result;
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.#sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session "${sessionId}" not found.`);
    }

    logger(`Closing session ${sessionId} (acquiring mutex)`);
    const guard = await session.mutex.acquire();
    try {
      session.context.dispose();
      if (session.browser.connected) {
        await session.browser.close();
      }
    } catch (err) {
      logger(`Error closing session ${sessionId}:`, err);
    } finally {
      guard.dispose();
      this.#sessions.delete(sessionId);
      logger(`Session ${sessionId} closed`);
    }
  }

  async closeAllSessions(): Promise<void> {
    this.#shuttingDown = true;
    const ids = [...this.#sessions.keys()];
    await Promise.allSettled(ids.map(id => this.closeSession(id)));
  }

  get sessionCount(): number {
    return this.#sessions.size;
  }

  get isShuttingDown(): boolean {
    return this.#shuttingDown;
  }

  #purgeDisconnectedSession(sessionId: string): void {
    const session = this.#sessions.get(sessionId);
    if (!session) {
      return;
    }
    try {
      session.context.dispose();
    } catch (err) {
      logger(`Error disposing context for disconnected session ${sessionId}:`, err);
    }
    this.#sessions.delete(sessionId);
    logger(`Purged disconnected session ${sessionId}`);
  }
}
