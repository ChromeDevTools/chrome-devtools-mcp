/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {randomUUID} from 'node:crypto';
import type fs from 'node:fs';
import {isIP} from 'node:net';
import http, {
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

import {McpServer} from './index.js';
import {
  isInitializeRequest,
  StreamableHTTPServerTransport,
} from './third_party/index.js';
import type {ParsedArguments} from './config/mcp-options.js';
import {logger} from './utils/logger.js';

const MCP_PATH = '/mcp';
const ALLOWED_METHODS: Record<string, true> = {
  GET: true,
  POST: true,
  DELETE: true,
};
const LOOPBACK_HOSTNAMES: Record<string, true> = {
  localhost: true,
  '::1': true,
};
const DEFAULT_MAX_SESSIONS = 128;
const DEFAULT_MAX_PENDING_SESSIONS = 8;
const DEFAULT_SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_REQUEST_BODY_BYTES = 4 * 1024 * 1024;
const REQUEST_BODY_TIMEOUT_MS = 30 * 1000;
type TimeoutHandle = NodeJS.Timeout;

export interface McpHttpServerOptions {
  port: number;
  logFile?: fs.WriteStream;
  maxSessions?: number;
  maxPendingSessions?: number;
  sessionIdleTimeoutMs?: number;
}

export interface McpHttpServer {
  url: URL;
  close(): Promise<void>;
}

interface HttpSession {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  sessionId?: string;
  idleTimer?: TimeoutHandle;
  activeRequests: number;
  closePromise?: Promise<void>;
}

class HttpRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sendJsonRpcError(
  response: ServerResponse,
  status: number,
  message: string,
  code = -32000,
  headers: Record<string, string> = {},
): void {
  if (response.headersSent) {
    if (!response.writableEnded) {
      response.end();
    }
    return;
  }

  response.writeHead(status, {
    'Content-Type': 'application/json',
    ...headers,
  });
  response.end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code,
        message,
      },
      id: null,
    }),
  );
}

function getHeader(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === 'string' ? value : undefined;
}
function hasMediaType(value: string | undefined, mediaType: string): boolean {
  if (value === undefined) {
    return false;
  }
  return value.split(',').some(part => {
    return part.split(';', 1)[0]?.trim().toLowerCase() === mediaType;
  });
}

function validatePostHeaders(request: IncomingMessage): void {
  const accept = getHeader(request, 'accept');
  if (
    !hasMediaType(accept, 'application/json') ||
    !hasMediaType(accept, 'text/event-stream')
  ) {
    throw new HttpRequestError(
      406,
      'Accept must include application/json and text/event-stream.',
    );
  }

  const contentType = getHeader(request, 'content-type');
  if (
    contentType === undefined ||
    contentType.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json'
  ) {
    throw new HttpRequestError(415, 'Content-Type must be application/json.');
  }
}

function countInitializeRequests(body: unknown): number {
  if (Array.isArray(body)) {
    return body.reduce((count, item) => {
      return count + (isInitializeRequest(item) ? 1 : 0);
    }, 0);
  }
  return isInitializeRequest(body) ? 1 : 0;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const declaredLength = request.headers['content-length'];
  if (declaredLength !== undefined) {
    if (typeof declaredLength !== 'string' || !/^\d+$/.test(declaredLength)) {
      request.resume();
      throw new HttpRequestError(400, 'Invalid Content-Length header.');
    }
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length > MAX_REQUEST_BODY_BYTES) {
      request.resume();
      throw new HttpRequestError(413, 'Request body is too large.');
    }
  }

  const {promise, resolve, reject} = Promise.withResolvers<unknown>();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  let settled = false;

  const cleanup = (): void => {
    clearTimeout(timeout);
    request.setTimeout(0);
    request.off('data', onData);
    request.off('end', onEnd);
    request.off('aborted', onAborted);
    request.off('error', onError);
  };
  const rejectBody = (error: HttpRequestError): void => {
    if (settled) {
      return;
    }
    settled = true;
    cleanup();
    request.resume();
    reject(error);
  };
  const resolveBody = (body: unknown): void => {
    if (settled) {
      return;
    }
    settled = true;
    cleanup();
    resolve(body);
  };
  const onData = (chunk: Buffer | string): void => {
    const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_REQUEST_BODY_BYTES) {
      rejectBody(new HttpRequestError(413, 'Request body is too large.'));
      return;
    }
    chunks.push(bytes);
  };
  const onEnd = (): void => {
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      rejectBody(new HttpRequestError(400, 'Request body must be valid JSON.'));
      return;
    }
    resolveBody(body);
  };
  const onAborted = (): void => {
    rejectBody(new HttpRequestError(400, 'Request body was aborted.'));
  };
  const onError = (error: Error): void => {
    rejectBody(
      new HttpRequestError(
        400,
        `Failed to read request body: ${error.message}`,
      ),
    );
  };
  const onTimeout = (): void => {
    rejectBody(new HttpRequestError(408, 'Request body timed out.'));
  };

  const timeout = setTimeout(onTimeout, REQUEST_BODY_TIMEOUT_MS);
  timeout.unref();
  request.setTimeout(REQUEST_BODY_TIMEOUT_MS, onTimeout);
  request.on('data', onData);
  request.once('end', onEnd);
  request.once('aborted', onAborted);
  request.once('error', onError);
  return await promise;
}

function normalizeHostname(hostname: string): string {
  return hostname
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/\.$/, '')
    .toLowerCase();
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (LOOPBACK_HOSTNAMES[normalized] === true) {
    return true;
  }

  if (isIP(normalized) === 4) {
    const firstOctet = Number(normalized.split('.')[0]);
    return firstOctet === 127;
  }

  return false;
}

function isLoopbackHost(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(`http://${value}`);
    return (
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.pathname === '/' &&
      parsed.search === '' &&
      parsed.hash === '' &&
      isLoopbackHostname(parsed.hostname)
    );
  } catch {
    return false;
  }
}

function isLoopbackOrigin(value: string | undefined): boolean {
  if (!value || value === 'null') {
    return false;
  }

  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.username === '' &&
      parsed.password === '' &&
      (parsed.pathname === '' || parsed.pathname === '/') &&
      parsed.search === '' &&
      parsed.hash === '' &&
      isLoopbackHostname(parsed.hostname)
    );
  } catch {
    return false;
  }
}

function validateRequestSecurity(
  request: IncomingMessage,
  response: ServerResponse,
): boolean {
  const host = getHeader(request, 'host');
  if (!isLoopbackHost(host)) {
    sendJsonRpcError(response, 403, `Invalid Host header: ${host}`);
    return false;
  }

  const origin = getHeader(request, 'origin');
  if (origin !== undefined && !isLoopbackOrigin(origin)) {
    sendJsonRpcError(response, 403, `Invalid Origin header: ${origin}`);
    return false;
  }

  return true;
}

function validatePort(port: number): void {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(
      `Invalid HTTP port ${port}. Expected an integer from 0 to 65535.`,
    );
  }
}
function resolvePositiveLimit(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return resolved;
}

function closeNodeServer(server: Server): Promise<void> {
  server.closeAllConnections();
  const {promise, resolve, reject} = Promise.withResolvers<void>();
  server.close(error => {
    if (error) {
      reject(error);
    } else {
      resolve();
    }
  });
  return promise;
}
export async function startMcpHttpServer(
  serverArgs: ParsedArguments,
  options: McpHttpServerOptions,
): Promise<McpHttpServer> {
  validatePort(options.port);
  const maxSessions = resolvePositiveLimit(
    options.maxSessions,
    DEFAULT_MAX_SESSIONS,
    'maxSessions',
  );
  const maxPendingSessions = resolvePositiveLimit(
    options.maxPendingSessions,
    DEFAULT_MAX_PENDING_SESSIONS,
    'maxPendingSessions',
  );
  const sessionIdleTimeoutMs = resolvePositiveLimit(
    options.sessionIdleTimeoutMs,
    DEFAULT_SESSION_IDLE_TIMEOUT_MS,
    'sessionIdleTimeoutMs',
  );

  const sessions = new Map<string, HttpSession>();
  const pendingSessions = new Set<HttpSession>();
  const pendingInitializationPromises = new Set<Promise<HttpSession>>();
  let pendingInitializations = 0;
  const nodeServer = http.createServer();
  let closing = false;
  let closePromise: Promise<void> | undefined;

  const removeSession = (session: HttpSession): void => {
    pendingSessions.delete(session);
    if (session.idleTimer !== undefined) {
      clearTimeout(session.idleTimer);
      session.idleTimer = undefined;
    }
    if (
      session.sessionId !== undefined &&
      sessions.get(session.sessionId) === session
    ) {
      sessions.delete(session.sessionId);
    }
  };

  const refreshSession = (session: HttpSession): void => {
    if (session.idleTimer !== undefined) {
      clearTimeout(session.idleTimer);
      session.idleTimer = undefined;
    }
    if (session.closePromise !== undefined || session.activeRequests > 0) {
      return;
    }
    const timer = setTimeout(() => {
      void closeSession(session).catch(error => {
        logger?.('Failed to close idle HTTP MCP session', error);
      });
    }, sessionIdleTimeoutMs);
    timer.unref();
    session.idleTimer = timer;
  };

  const beginSessionRequest = (session: HttpSession): void => {
    if (session.idleTimer !== undefined) {
      clearTimeout(session.idleTimer);
      session.idleTimer = undefined;
    }
    session.activeRequests++;
  };

  const endSessionRequest = (session: HttpSession): void => {
    session.activeRequests--;
    if (session.activeRequests === 0) {
      refreshSession(session);
    }
  };

  const closeSession = (session: HttpSession): Promise<void> => {
    if (session.closePromise !== undefined) {
      return session.closePromise;
    }

    removeSession(session);
    const sessionClosePromise = Promise.resolve().then(async () => {
      await session.server.close();
    });
    session.closePromise = sessionClosePromise;
    return sessionClosePromise;
  };

  const createSession = async (): Promise<HttpSession> => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: randomUUID,
      onsessioninitialized: sessionId => {
        if (session === undefined || session.closePromise !== undefined) {
          return;
        }
        session.sessionId = sessionId;
        pendingSessions.delete(session);
        sessions.set(sessionId, session);
        refreshSession(session);
      },
      onsessionclosed: async sessionId => {
        const closedSession = sessions.get(sessionId);
        if (closedSession !== undefined) {
          await closeSession(closedSession);
        }
      },
    });
    const server = await McpServer.from(serverArgs, {
      logFile: options.logFile,
      getSessionId: () => transport.sessionId,
    });
    const session: HttpSession = {server, transport, activeRequests: 0};
    pendingSessions.add(session);
    transport.onclose = () => {
      if (session !== undefined) {
        void closeSession(session).catch(error => {
          logger?.('Failed to close HTTP MCP session', error);
        });
      }
    };

    try {
      await server.connect(transport);
      return session;
    } catch (error) {
      await closeSession(session).catch(closeError => {
        logger?.(
          'Failed to close HTTP MCP session after connect error',
          closeError,
        );
      });
      throw error;
    }
  };
  const createTrackedSession = async (): Promise<HttpSession> => {
    if (pendingInitializations + pendingSessions.size >= maxPendingSessions) {
      throw new HttpRequestError(
        503,
        'Too many MCP session initializations are in progress.',
      );
    }
    if (
      sessions.size + pendingSessions.size + pendingInitializations >=
      maxSessions
    ) {
      throw new HttpRequestError(
        503,
        'The MCP session limit has been reached.',
      );
    }

    pendingInitializations++;
    const creation = createSession();
    pendingInitializationPromises.add(creation);
    try {
      return await creation;
    } finally {
      pendingInitializationPromises.delete(creation);
      pendingInitializations--;
    }
  };

  const handleRequest = async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    if (request.url !== MCP_PATH) {
      sendJsonRpcError(response, 404, 'Not Found', -32000);
      return;
    }

    if (!validateRequestSecurity(request, response)) {
      return;
    }

    const method = request.method ?? '';
    if (ALLOWED_METHODS[method] !== true) {
      sendJsonRpcError(response, 405, 'Method not allowed.', -32000, {
        Allow: 'GET, POST, DELETE',
      });
      return;
    }

    if (closing) {
      sendJsonRpcError(response, 503, 'Server is shutting down.', -32000);
      return;
    }

    const sessionId = getHeader(request, 'mcp-session-id');
    let session: HttpSession | undefined;
    let requestTracked = false;
    let parsedBody: unknown = undefined;

    const finishSessionRequest = (): void => {
      if (!requestTracked || session === undefined) {
        return;
      }
      requestTracked = false;
      endSessionRequest(session);
    };

    if (sessionId !== undefined) {
      session = sessions.get(sessionId);
      if (session === undefined) {
        sendJsonRpcError(response, 404, 'Session not found', -32001);
        return;
      }
      beginSessionRequest(session);
      requestTracked = true;
    }

    if (method === 'POST') {
      try {
        validatePostHeaders(request);
        parsedBody = await readJsonBody(request);
      } catch (error) {
        finishSessionRequest();
        request.resume();
        if (error instanceof HttpRequestError) {
          sendJsonRpcError(response, error.status, error.message);
        } else {
          sendJsonRpcError(
            response,
            400,
            `Failed to read request body: ${errorMessage(error)}`,
          );
        }
        return;
      }
    }

    if (session === undefined) {
      if (method !== 'POST') {
        sendJsonRpcError(
          response,
          400,
          'Bad Request: Mcp-Session-Id header is required',
          -32000,
        );
        return;
      }
      if (countInitializeRequests(parsedBody) !== 1) {
        sendJsonRpcError(
          response,
          400,
          'A session-less POST must contain exactly one initialize request.',
        );
        return;
      }

      try {
        session = await createTrackedSession();
      } catch (error) {
        if (error instanceof HttpRequestError) {
          sendJsonRpcError(response, error.status, error.message);
        } else {
          sendJsonRpcError(
            response,
            500,
            `Failed to create MCP session: ${errorMessage(error)}`,
            -32603,
          );
        }
        return;
      }

      if (closing) {
        await closeSession(session).catch(closeError => {
          logger?.(
            'Failed to close HTTP MCP session during shutdown',
            closeError,
          );
        });
        sendJsonRpcError(response, 503, 'Server is shutting down.', -32000);
        return;
      }

      beginSessionRequest(session);
      requestTracked = true;
    }

    try {
      if (method === 'POST') {
        await session.transport.handleRequest(request, response, parsedBody);
        if (session.sessionId === undefined) {
          await closeSession(session);
        }
      } else {
        await session.transport.handleRequest(request, response);
      }
    } catch (error) {
      await closeSession(session).catch(closeError => {
        logger?.(
          'Failed to close HTTP MCP session after request error',
          closeError,
        );
      });
      if (!response.headersSent) {
        sendJsonRpcError(
          response,
          500,
          `MCP request failed: ${errorMessage(error)}`,
          -32603,
        );
      } else if (!response.writableEnded) {
        response.end();
      }
    } finally {
      finishSessionRequest();
    }
  };

  nodeServer.on('request', (request, response) => {
    void handleRequest(request, response).catch(error => {
      logger?.('Unhandled HTTP MCP request error', error);
      if (!response.headersSent) {
        sendJsonRpcError(response, 500, 'Internal server error', -32603);
      } else if (!response.writableEnded) {
        response.end();
      }
    });
  });

  try {
    const {promise, resolve, reject} = Promise.withResolvers<void>();
    const onError = (error: Error): void => {
      nodeServer.off('error', onError);
      reject(error);
    };
    nodeServer.once('error', onError);
    nodeServer.listen(options.port, '127.0.0.1', () => {
      nodeServer.off('error', onError);
      resolve();
    });
    await promise;
  } catch (error) {
    nodeServer.closeAllConnections();
    throw error;
  }

  const address = nodeServer.address();
  if (address === null || typeof address === 'string') {
    await closeNodeServer(nodeServer).catch(closeError => {
      logger?.('Failed to close HTTP server after bind error', closeError);
    });
    throw new Error('HTTP server did not provide a bound address');
  }

  const url = new URL(`http://127.0.0.1:${address.port}${MCP_PATH}`);

  const close = async (): Promise<void> => {
    if (closePromise !== undefined) {
      return await closePromise;
    }

    closing = true;
    closePromise = (async () => {
      await Promise.allSettled([...pendingInitializationPromises]);
      const allSessions = new Set<HttpSession>([
        ...sessions.values(),
        ...pendingSessions,
      ]);
      await Promise.allSettled(
        [...allSessions].map(async session => {
          await closeSession(session);
        }),
      );
      await closeNodeServer(nodeServer);
    })();

    return await closePromise;
  };

  return {url, close};
}
