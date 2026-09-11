/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {randomUUID} from 'node:crypto';
import type fs from 'node:fs';
import http, {
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import {isIP} from 'node:net';
import path from 'node:path';

import {BrowserManager} from './browser.js';
import type {ParsedArguments} from './config/mcp-options.js';
import {McpServer} from './index.js';
import {
  isInitializeRequest,
  StreamableHTTPServerTransport,
} from './third_party/index.js';
import {logger} from './utils/logger.js';

const MAXIMUM_BODY_SIZE = 4 * 1024 * 1024;

export const DEFAULT_HTTP_HOST = '127.0.0.1';
export const MCP_HTTP_PATH = '/mcp';

export interface McpHttpServerOptions {
  port: number;
  host?: string;
  logFile?: fs.WriteStream;
}

interface Session {
  id?: string;
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  closePromise?: Promise<void>;
}

class RequestBodyTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequestBodyTooLargeError';
  }
}

/** Hosts accepted by the transport's DNS rebinding protection. */
function getAllowedHosts(host: string, port: number): string[] {
  const hosts = new Set([host, 'localhost', '127.0.0.1', '::1']);
  const allowedHosts: string[] = [];
  for (const allowedHost of hosts) {
    const formattedHost = formatHost(allowedHost);
    allowedHosts.push(formattedHost, `${formattedHost}:${port}`);
  }
  return allowedHosts;
}

function formatHost(host: string): string {
  return isIP(host) === 6 ? `[${host}]` : host;
}

function validatePort(port: number): void {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Provided HTTP port ${port} is not a valid port.`);
  }
}

function validateHost(host: string): void {
  const validLabel = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
  const validHostname = host.split('.').every(label => validLabel.test(label));
  if (
    host.length === 0 ||
    host.length > 253 ||
    (isIP(host) === 0 && !validHostname)
  ) {
    throw new Error(`Provided HTTP host ${host} is not a valid host.`);
  }
}

function getSessionId(request: IncomingMessage): string | undefined | null {
  const header = request.headers['mcp-session-id'];
  if (Array.isArray(header)) {
    return header.length === 1 && header[0] !== '' ? header[0] : null;
  }
  return header === '' ? null : header;
}

function isInitializationMessage(body: unknown): boolean {
  if (Array.isArray(body)) {
    return body.some(message => isInitializeRequest(message));
  }
  return isInitializeRequest(body);
}

function respondJsonRpcError(
  response: ServerResponse,
  statusCode: number,
  code: number,
  message: string,
): void {
  if (response.headersSent || response.writableEnded) {
    return;
  }
  response.writeHead(statusCode, {'Content-Type': 'application/json'});
  response.end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: {code, message},
      id: null,
    }),
  );
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const body = await new Promise<string>((resolve, reject) => {
    let content = '';
    let size = 0;
    let settled = false;
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      if (settled) {
        return;
      }
      size += Buffer.byteLength(chunk);
      if (size > MAXIMUM_BODY_SIZE) {
        settled = true;
        request.resume();
        reject(
          new RequestBodyTooLargeError('Request body exceeds maximum size'),
        );
        return;
      }
      content += chunk;
    });
    request.on('end', () => {
      if (!settled) {
        resolve(content);
      }
    });
    request.on('error', error => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    request.on('aborted', () => {
      if (!settled) {
        settled = true;
        reject(new Error('Request aborted'));
      }
    });
  });
  const parsed: unknown = JSON.parse(body);
  return parsed;
}

function validateSessionArguments(args: ParsedArguments): void {
  if (args.browserUrl || args.wsEndpoint || args.autoConnect) {
    throw new Error(
      'HTTP sessions require launched browsers; --browserUrl, --wsEndpoint, and --autoConnect are not supported with --httpPort.',
    );
  }
}

function getSessionArguments(args: ParsedArguments): ParsedArguments {
  validateSessionArguments(args);
  const sessionArgs = {...args};
  sessionArgs.isolated = true;
  if (args.userDataDir) {
    sessionArgs.userDataDir = path.join(
      args.userDataDir,
      `mcp-http-session-${randomUUID()}`,
    );
    sessionArgs.isolated = false;
  }
  return sessionArgs;
}

/**
 * Hosts one isolated MCP server and browser per Streamable HTTP session.
 */
export class McpHttpServer {
  #args: ParsedArguments;
  #options: {port: number; host: string; logFile?: fs.WriteStream};
  #sessions = new Map<string, Session>();
  #pendingSessions = new Set<Session>();
  #httpServer: Server;
  #closed = false;
  #closePromise?: Promise<void>;

  private constructor(
    args: ParsedArguments,
    options: {port: number; host: string; logFile?: fs.WriteStream},
  ) {
    this.#args = args;
    this.#options = options;
    this.#httpServer = http.createServer((request, response) => {
      void this.#handleRequest(request, response).catch(error => {
        logger?.('Error handling HTTP request', error);
        respondJsonRpcError(response, 500, -32603, 'Internal server error');
      });
    });
  }

  static async start(
    args: ParsedArguments,
    options: McpHttpServerOptions,
  ): Promise<McpHttpServer> {
    validatePort(options.port);
    validateSessionArguments(args);
    const host = options.host ?? DEFAULT_HTTP_HOST;
    validateHost(host);
    const server = new McpHttpServer(args, {
      port: options.port,
      host,
      logFile: options.logFile,
    });
    await server.#listen();
    return server;
  }

  get host(): string {
    return this.#options.host;
  }

  get port(): number {
    const address = this.#httpServer.address();
    if (address === null || typeof address === 'string') {
      throw new Error('HTTP server is not listening on a TCP port');
    }
    return address.port;
  }

  get url(): string {
    return `http://${formatHost(this.host)}:${this.port}${MCP_HTTP_PATH}`;
  }

  get sessionCount(): number {
    return this.#sessions.size;
  }

  async close(): Promise<void> {
    if (this.#closePromise !== undefined) {
      await this.#closePromise;
      return;
    }
    this.#closed = true;
    const closePromise = Promise.resolve().then(async () => {
      await this.#closeSessions();
      await this.#closeHttpServer();
    });
    this.#closePromise = closePromise;
    await closePromise;
  }

  async #listen(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        this.#httpServer.removeListener('error', onError);
        reject(error);
      };
      this.#httpServer.once('error', onError);
      try {
        this.#httpServer.listen(this.#options.port, this.#options.host, () => {
          this.#httpServer.removeListener('error', onError);
          resolve();
        });
      } catch (error) {
        this.#httpServer.removeListener('error', onError);
        reject(error);
      }
    });
  }

  async #handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (this.#closed) {
      request.resume();
      respondJsonRpcError(response, 503, -32000, 'Server is shutting down');
      return;
    }

    let requestUrl: URL;
    try {
      requestUrl = new URL(request.url ?? '/', 'http://localhost');
    } catch {
      request.resume();
      respondJsonRpcError(response, 400, -32000, 'Invalid request URL');
      return;
    }
    if (requestUrl.pathname !== MCP_HTTP_PATH) {
      request.resume();
      respondJsonRpcError(response, 404, -32000, 'Not found');
      return;
    }

    const sessionId = getSessionId(request);
    if (sessionId === null) {
      request.resume();
      respondJsonRpcError(
        response,
        400,
        -32000,
        'Bad Request: invalid MCP session ID',
      );
      return;
    }
    if (sessionId !== undefined) {
      await this.#handleExistingSession(sessionId, request, response);
      return;
    }
    await this.#handleNewSession(request, response);
  }

  async #handleExistingSession(
    sessionId: string,
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const session = this.#sessions.get(sessionId);
    if (session === undefined) {
      request.resume();
      respondJsonRpcError(response, 404, -32001, 'Session not found');
      return;
    }
    await session.transport.handleRequest(request, response);
  }

  async #handleNewSession(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (request.method !== 'POST') {
      request.resume();
      respondJsonRpcError(
        response,
        400,
        -32000,
        'Bad Request: no valid session ID provided',
      );
      return;
    }

    let body: unknown;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      const statusCode = error instanceof RequestBodyTooLargeError ? 413 : 400;
      const message =
        error instanceof RequestBodyTooLargeError
          ? 'Request body exceeds maximum size'
          : 'Parse error';
      respondJsonRpcError(response, statusCode, -32700, message);
      return;
    }
    if (!isInitializationMessage(body)) {
      respondJsonRpcError(
        response,
        400,
        -32000,
        'Bad Request: no valid session ID provided',
      );
      return;
    }

    const session = await this.#createSession();
    try {
      await session.transport.handleRequest(request, response, body);
      if (session.id === undefined) {
        await this.#closeSession(session).catch(closeError => {
          logger?.('Error closing rejected HTTP session', closeError);
        });
      }
    } catch (error) {
      await this.#closeSession(session).catch(closeError => {
        logger?.('Error closing failed HTTP session', closeError);
      });
      throw error;
    }
  }

  async #createSession(): Promise<Session> {
    const browserManager = new BrowserManager();
    let initializedServer: McpServer | undefined;
    let session: Session | undefined;
    try {
      initializedServer = await McpServer.from(
        getSessionArguments(this.#args),
        {
          logFile: this.#options.logFile,
          browserManager,
        },
      );
      session = this.#makeSession(initializedServer);
      await initializedServer.connect(session.transport);
      return session;
    } catch (error) {
      await this.#cleanupSessionSetup(
        session,
        initializedServer,
        browserManager,
      );
      throw error;
    }
  }

  #makeSession(server: McpServer): Session {
    const sessionRef: {session?: Session} = {};
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableDnsRebindingProtection: true,
      allowedHosts: getAllowedHosts(this.host, this.port),
      onsessioninitialized: sessionId => {
        const session = sessionRef.session;
        if (session === undefined) {
          throw new Error('HTTP session was not created');
        }
        if (this.#closed) {
          void this.#closeSession(session).catch(error => {
            logger?.('Error closing HTTP session after shutdown', error);
          });
          return;
        }
        session.id = sessionId;
        this.#pendingSessions.delete(session);
        this.#sessions.set(sessionId, session);
        logger?.(`MCP session initialized: ${sessionId}`);
      },
      onsessionclosed: sessionId => {
        const closedSession = this.#sessions.get(sessionId);
        if (closedSession !== undefined) {
          this.#sessions.delete(sessionId);
        }
      },
    });
    const session: Session = {server, transport};
    sessionRef.session = session;
    this.#pendingSessions.add(session);
    transport.onclose = () => {
      const activeSession = sessionRef.session;
      if (activeSession !== undefined) {
        void this.#closeSession(activeSession).catch(error => {
          logger?.('Error closing HTTP session', error);
        });
      }
    };
    return session;
  }

  async #cleanupSessionSetup(
    session: Session | undefined,
    server: McpServer | undefined,
    browserManager: BrowserManager,
  ): Promise<void> {
    if (session !== undefined) {
      await this.#closeSession(session).catch(closeError => {
        logger?.('Error closing HTTP session after setup failure', closeError);
      });
      return;
    }
    if (server !== undefined) {
      await server.close().catch(closeError => {
        logger?.('Error closing MCP server after setup failure', closeError);
      });
      return;
    }
    await browserManager.closeBrowser().catch(closeError => {
      logger?.('Error closing browser after setup failure', closeError);
    });
  }

  async #closeSession(session: Session): Promise<void> {
    if (session.closePromise !== undefined) {
      await session.closePromise;
      return;
    }
    this.#forgetSession(session);
    const closePromise = Promise.resolve().then(async () => {
      try {
        await session.server.close();
      } finally {
        await session.transport.close();
      }
    });
    session.closePromise = closePromise;
    await closePromise;
  }

  #forgetSession(session: Session): void {
    this.#pendingSessions.delete(session);
    if (
      session.id !== undefined &&
      this.#sessions.get(session.id) === session
    ) {
      this.#sessions.delete(session.id);
    }
  }

  async #closeSessions(): Promise<void> {
    const sessions = new Set([
      ...this.#sessions.values(),
      ...this.#pendingSessions.values(),
    ]);
    this.#sessions.clear();
    this.#pendingSessions.clear();
    const results = await Promise.allSettled(
      [...sessions].map(session => this.#closeSession(session)),
    );
    for (const result of results) {
      if (result.status === 'rejected') {
        logger?.('Error closing HTTP session during shutdown', result.reason);
      }
    }
  }

  async #closeHttpServer(): Promise<void> {
    if (!this.#httpServer.listening) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      this.#httpServer.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
      this.#httpServer.closeAllConnections();
    });
  }
}
