/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import http from 'node:http';

import {
  DEFAULT_HTTP_HOST,
  DEFAULT_HTTP_PORT,
  HTTP_ENDPOINT_PATH,
  isLoopbackHost,
} from '../config/http-options.js';
import {
  loadHttp,
  type CreateMcpHandlerOptions,
  type McpHandlerRequestOptions,
  type McpHttpHandler,
} from '../third_party/index.js';

import {
  applySecurityHeaders,
  createSecurityGate,
  formatHostForUrl,
} from './security.js';

export interface HttpMcpServer {
  createHttpHandler(
    options?: Omit<CreateMcpHandlerOptions, 'legacy'>,
  ): McpHttpHandler;
}

export interface HttpServerOptions {
  host?: string;
  port?: number;
  path?: string;
  allowedHosts?: string[];
  allowedOrigins?: string[];
  httpToken?: string;
  allowUnauthenticatedHttp?: boolean;
  onerror?: (error: Error) => void;
}

export interface HttpServerAddress {
  host: string;
  port: number;
  path: string;
  url: string;
}

function createJsonErrorResponse(
  status: number,
  code: number,
  message: string,
  extraHeaders?: Record<string, string>,
): Response {
  return applySecurityHeaders(
    Response.json(
      {
        jsonrpc: '2.0',
        error: {
          code,
          message,
        },
        id: null,
      },
      {
        status,
        headers: {
          'Content-Type': 'application/json',
          ...extraHeaders,
        },
      },
    ),
  );
}

export class HttpServer {
  #mcpServer: HttpMcpServer;
  #options: HttpServerOptions;
  #server?: http.Server;
  #handler?: McpHttpHandler;
  #starting = false;
  #closing?: Promise<void>;

  constructor(mcpServer: HttpMcpServer, options: HttpServerOptions = {}) {
    this.#mcpServer = mcpServer;
    this.#options = options;
  }

  async start(): Promise<HttpServerAddress> {
    if (this.#server || this.#starting) {
      throw new Error('HttpServer is already started.');
    }

    const rawHost = (this.#options.host ?? DEFAULT_HTTP_HOST).trim();
    const bindHost =
      rawHost.startsWith('[') && rawHost.endsWith(']')
        ? rawHost.slice(1, -1)
        : rawHost;
    const port = this.#options.port ?? DEFAULT_HTTP_PORT;
    const endpointPath = this.#options.path ?? HTTP_ENDPOINT_PATH;

    if (
      !isLoopbackHost(rawHost) &&
      !this.#options.httpToken &&
      !this.#options.allowUnauthenticatedHttp
    ) {
      throw new Error(
        `Refusing to bind non-loopback host "${rawHost}" without authentication. ` +
          'Provide httpToken or set allowUnauthenticatedHttp to true.',
      );
    }

    this.#starting = true;
    let handler: McpHttpHandler | undefined;
    let server: http.Server | undefined;
    try {
      handler = this.#mcpServer.createHttpHandler({
        onerror: this.#options.onerror,
      });
      const {toNodeHandler} = await loadHttp();
      const securityGate = createSecurityGate({
        host: rawHost,
        allowedHosts: this.#options.allowedHosts,
        allowedOrigins: this.#options.allowedOrigins,
        httpToken: this.#options.httpToken,
      });
      const activeHandler = handler;

      const guardedFetch = async (
        request: Request,
        options?: McpHandlerRequestOptions,
      ): Promise<Response> => {
        let pathname: string;
        try {
          pathname = new URL(request.url).pathname;
        } catch {
          return createJsonErrorResponse(
            400,
            -32600,
            'Bad Request: Invalid URL',
          );
        }

        if (pathname !== endpointPath) {
          return createJsonErrorResponse(404, -32000, `Not Found: ${pathname}`);
        }

        const method = request.method.toUpperCase();
        if (method !== 'POST' && method !== 'GET') {
          return createJsonErrorResponse(405, -32000, 'Method not allowed.', {
            Allow: 'POST, GET',
          });
        }

        const rejected = securityGate(request);
        if (rejected) {
          return rejected;
        }

        const response = await activeHandler.fetch(request, options);
        return applySecurityHeaders(response);
      };

      const nodeHandler = toNodeHandler(
        {fetch: guardedFetch},
        {onerror: this.#options.onerror},
      );

      server = http.createServer((req, res) => {
        void nodeHandler(req, res);
      });

      const listeningServer = server;
      const boundPort = await new Promise<number>((resolve, reject) => {
        const onError = (err: Error): void => {
          listeningServer.off('listening', onListening);
          reject(err);
        };
        const onListening = (): void => {
          listeningServer.off('error', onError);
          const addr = listeningServer.address();
          if (!addr || typeof addr === 'string') {
            reject(new Error('Failed to determine bound HTTP server port.'));
            return;
          }
          resolve(addr.port);
        };
        listeningServer.once('error', onError);
        listeningServer.once('listening', onListening);
        listeningServer.listen({host: bindHost, port});
      });

      if (this.#options.onerror) {
        const onerror = this.#options.onerror;
        server.on('error', err => {
          onerror(err);
        });
      }

      this.#server = server;
      this.#handler = handler;

      return {
        host: bindHost,
        port: boundPort,
        path: endpointPath,
        url: `http://${formatHostForUrl(bindHost)}:${boundPort}${endpointPath}`,
      };
    } catch (err) {
      if (server && server.listening) {
        server.close();
      }
      if (handler) {
        await handler.close().catch(() => {});
      }
      throw err;
    } finally {
      this.#starting = false;
    }
  }

  async close(): Promise<void> {
    if (this.#closing) {
      return await this.#closing;
    }
    if (!this.#server && !this.#handler) {
      return;
    }

    this.#closing = (async (): Promise<void> => {
      const server = this.#server;
      const handler = this.#handler;
      this.#server = undefined;
      this.#handler = undefined;

      let serverClosed: Promise<void> | undefined;
      if (server) {
        serverClosed = new Promise<void>(resolve => {
          if (!server.listening) {
            resolve();
            return;
          }
          server.close(() => {
            resolve();
          });
        });
      }

      if (handler) {
        try {
          await handler.close();
        } catch (err) {
          this.#options.onerror?.(
            err instanceof Error ? err : new Error(String(err)),
          );
        }
      }

      if (server) {
        server.closeIdleConnections();
        await serverClosed;
      }
    })();

    try {
      await this.#closing;
    } finally {
      this.#closing = undefined;
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }
}
