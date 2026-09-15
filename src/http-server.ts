/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {randomUUID} from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

import type {ParsedArguments} from './config/mcp-options.js';
import {McpServer, type McpServerOptions} from './index.js';
import {
  isInitializeRequest,
  StreamableHTTPServerTransport,
} from './third_party/index.js';
import {logger} from './utils/logger.js';

const MAX_REQUEST_BYTES = 4 * 1024 * 1024;

interface Session {
  id?: string;
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  idleTimer?: NodeJS.Timeout;
  closing: boolean;
}

export interface HttpMcpServerOptions extends McpServerOptions {
  host?: string;
  port?: number;
  allowedHosts?: string[];
  allowedOrigins?: string[];
  sessionIdleTimeoutMs?: number;
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, {'content-type': 'application/json'});
  response.end(JSON.stringify(body));
}

function sendMcpError(
  response: ServerResponse,
  status: number,
  code: number,
  message: string,
): void {
  sendJson(response, status, {
    jsonrpc: '2.0',
    error: {code, message},
    id: null,
  });
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > MAX_REQUEST_BYTES) {
      throw new Error('Request body is too large');
    }
    chunks.push(buffer);
  }
  const body = Buffer.concat(chunks).toString('utf8');
  if (!body) {
    throw new Error('Request body is empty');
  }
  return JSON.parse(body);
}

export class HttpMcpServer {
  #args: ParsedArguments;
  #options: HttpMcpServerOptions;
  #httpServer: Server;
  #sessions = new Map<string, Session>();
  #activeSessions = new Set<Session>();
  #allowedHosts = new Set<string>();
  #allowedOrigins = new Set<string>();
  #closing = false;
  #url?: URL;

  constructor(args: ParsedArguments, options: HttpMcpServerOptions = {}) {
    this.#args = args;
    this.#options = options;
    this.#httpServer = createServer((request, response) => {
      void this.#handleRequest(request, response).catch(error => {
        logger?.('Failed to handle HTTP MCP request', error);
        if (!response.headersSent) {
          sendMcpError(response, 500, -32603, 'Internal server error');
        } else if (!response.writableEnded) {
          response.end();
        }
      });
    });
  }

  get url(): URL {
    if (!this.#url) {
      throw new Error('HTTP MCP server has not started');
    }
    return new URL(this.#url);
  }

  get sessionCount(): number {
    return this.#sessions.size;
  }

  async start(): Promise<URL> {
    if (this.#url) {
      return this.url;
    }
    const host = this.#options.host ?? this.#args.host;
    const port = this.#options.port ?? this.#args.port;
    if (port === undefined) {
      throw new Error('HTTP MCP port is required');
    }
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        this.#httpServer.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        this.#httpServer.off('error', onError);
        resolve();
      };
      this.#httpServer.once('error', onError);
      this.#httpServer.once('listening', onListening);
      this.#httpServer.listen(port, host);
    });
    const address = this.#httpServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('HTTP MCP server did not bind a TCP address');
    }
    const displayHost = host === '::1' ? '[::1]' : host;
    this.#url = new URL(`http://${displayHost}:${address.port}/mcp`);
    for (const localHost of [
      `127.0.0.1:${address.port}`,
      `localhost:${address.port}`,
      `[::1]:${address.port}`,
    ]) {
      this.#allowedHosts.add(localHost);
    }
    for (const allowedHost of [
      ...(this.#args.allowedHosts ?? []),
      ...(this.#options.allowedHosts ?? []),
    ]) {
      this.#allowedHosts.add(String(allowedHost).toLowerCase());
    }
    for (const localOrigin of [
      `http://127.0.0.1:${address.port}`,
      `http://localhost:${address.port}`,
      `http://[::1]:${address.port}`,
    ]) {
      this.#allowedOrigins.add(localOrigin);
    }
    for (const allowedOrigin of [
      ...(this.#args.allowedOrigins ?? []),
      ...(this.#options.allowedOrigins ?? []),
    ]) {
      this.#allowedOrigins.add(String(allowedOrigin));
    }
    return this.url;
  }

  async close(): Promise<void> {
    if (this.#closing) {
      return;
    }
    this.#closing = true;
    await Promise.all(
      [...this.#activeSessions].map(session => this.#closeSession(session)),
    );
    if (!this.#httpServer.listening) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      this.#httpServer.close(error => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
      this.#httpServer.closeAllConnections();
    });
  }

  #isRequestAllowed(request: IncomingMessage): boolean {
    const host = request.headers.host?.toLowerCase();
    if (!host || !this.#allowedHosts.has(host)) {
      return false;
    }
    const origin = request.headers.origin;
    return origin === undefined || this.#allowedOrigins.has(origin);
  }

  #touchSession(session: Session): void {
    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
    }
    const timeout =
      this.#options.sessionIdleTimeoutMs ??
      (this.#args.sessionIdleTimeout ?? 86400) * 1000;
    if (timeout === 0) {
      session.idleTimer = undefined;
      return;
    }
    session.idleTimer = setTimeout(() => {
      void this.#closeSession(session).catch(error => {
        logger?.('Failed to close idle HTTP MCP session', error);
      });
    }, timeout);
    session.idleTimer.unref();
  }

  async #closeSession(session: Session): Promise<void> {
    if (session.closing) {
      return;
    }
    session.closing = true;
    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
      session.idleTimer = undefined;
    }
    if (session.id) {
      this.#sessions.delete(session.id);
    }
    this.#activeSessions.delete(session);
    await session.server.close();
  }

  async #handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (this.#closing) {
      sendMcpError(response, 503, -32000, 'Server is shutting down');
      return;
    }
    if (!this.#isRequestAllowed(request)) {
      sendMcpError(response, 403, -32000, 'Forbidden');
      return;
    }
    const path = (request.url ?? '').split('?', 1)[0];
    if (path === '/healthz' && request.method === 'GET') {
      sendJson(response, 200, {status: 'ok', sessions: this.sessionCount});
      return;
    }
    if (path !== '/mcp') {
      sendMcpError(response, 404, -32001, 'Not found');
      return;
    }
    if (!['GET', 'POST', 'DELETE'].includes(request.method ?? '')) {
      response.setHeader('allow', 'GET, POST, DELETE');
      sendMcpError(response, 405, -32000, 'Method not allowed');
      return;
    }

    const sessionId = request.headers['mcp-session-id'];
    if (Array.isArray(sessionId)) {
      sendMcpError(response, 400, -32000, 'Invalid Mcp-Session-Id header');
      return;
    }
    if (sessionId) {
      const session = this.#sessions.get(sessionId);
      if (!session) {
        sendMcpError(response, 404, -32001, 'Session not found');
        return;
      }
      this.#touchSession(session);
      let body: unknown;
      if (request.method === 'POST') {
        try {
          body = await readJsonBody(request);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Invalid request body';
          sendMcpError(response, 400, -32700, message);
          return;
        }
      }
      await session.transport.handleRequest(request, response, body);
      return;
    }

    if (request.method !== 'POST') {
      sendMcpError(response, 400, -32000, 'Mcp-Session-Id is required');
      return;
    }
    let body: unknown;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Invalid request body';
      sendMcpError(response, 400, -32700, message);
      return;
    }
    if (!isInitializeRequest(body)) {
      sendMcpError(
        response,
        400,
        -32000,
        'An initialize request is required for a new session',
      );
      return;
    }

    const mcpServer = await McpServer.from(this.#args, {
      logFile: this.#options.logFile,
    });
    if (this.#closing) {
      await mcpServer.close();
      sendMcpError(response, 503, -32000, 'Server is shutting down');
      return;
    }
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: randomUUID,
      onsessioninitialized: initializedSessionId => {
        session.id = initializedSessionId;
        this.#sessions.set(initializedSessionId, session);
        this.#touchSession(session);
      },
      onsessionclosed: async closedSessionId => {
        const closedSession = this.#sessions.get(closedSessionId);
        if (closedSession) {
          await this.#closeSession(closedSession);
        }
      },
    });
    const session: Session = {
      server: mcpServer,
      transport,
      closing: false,
    };
    this.#activeSessions.add(session);
    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(request, response, body);
      if (!session.id) {
        await this.#closeSession(session);
      }
    } catch (error) {
      await this.#closeSession(session);
      throw error;
    }
  }
}
