/**
 * @license
 * Copyright 2026 Colin (@cejor6)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Originally added in fork cejor6/chrome-devtools-mcp on top of
 * Google's chrome-devtools-mcp (Apache-2.0). This file is new in the fork.
 */

import {randomUUID, timingSafeEqual} from 'node:crypto';
import type fs from 'node:fs';
import {createServer, type IncomingMessage, type Server} from 'node:http';

import type {parseArguments} from './bin/chrome-devtools-mcp-cli-options.js';
import {logger} from './logger.js';
import {StreamableHTTPServerTransport} from './third_party/index.js';

import {createMcpServer, type SharedState} from './index.js';

export interface HttpTransportOptions {
  host: string;
  port: number;
  /** If set, clients must send `Authorization: Bearer <token>`. */
  token?: string;
  args: ReturnType<typeof parseArguments>;
  sharedState: SharedState;
  logFile?: fs.WriteStream;
}

export interface HttpTransportHandle {
  server: Server;
  close(): Promise<void>;
}

/**
 * Starts an HTTP transport that accepts multiple concurrent MCP sessions.
 * Each session gets its own McpServer but shares the same Chrome browser
 * and MutexRegistry via the provided `sharedState`.
 *
 * Uses the modern Streamable HTTP transport (MCP SDK). Bearer token auth is
 * optional but strongly recommended.
 */
export async function startHttpTransport(
  opts: HttpTransportOptions,
): Promise<HttpTransportHandle> {
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createServer(async (req, res) => {
    try {
      if (opts.token && !checkBearer(req, opts.token)) {
        res.statusCode = 401;
        res.setHeader('WWW-Authenticate', 'Bearer realm="chrome-devtools-mcp"');
        res.end('Unauthorized');
        return;
      }

      const sessionId = req.headers['mcp-session-id'];
      const sessionIdStr =
        typeof sessionId === 'string' ? sessionId : undefined;
      let transport: StreamableHTTPServerTransport | undefined = sessionIdStr
        ? sessions.get(sessionIdStr)
        : undefined;

      if (!transport) {
        // New session. Create transport + a fresh McpServer that shares
        // browser/context/mutex with all other sessions.
        const newTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: id => {
            sessions.set(id, newTransport);
            logger(`HTTP session initialized: ${id}`);
          },
        });
        newTransport.onclose = () => {
          const id = newTransport.sessionId;
          if (id) {
            sessions.delete(id);
            logger(`HTTP session closed: ${id}`);
          }
        };
        const {server} = await createMcpServer(
          opts.args,
          {logFile: opts.logFile},
          opts.sharedState,
        );
        await server.connect(newTransport);
        transport = newTransport;
      }

      await transport.handleRequest(req, res);
    } catch (e) {
      logger('HTTP request error', e);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal server error');
      } else {
        res.end();
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => {
      httpServer.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      httpServer.off('error', onError);
      resolve();
    };
    httpServer.once('error', onError);
    httpServer.once('listening', onListening);
    httpServer.listen(opts.port, opts.host);
  });

  logger(`HTTP transport listening on ${opts.host}:${opts.port}`);

  return {
    server: httpServer,
    async close() {
      for (const transport of sessions.values()) {
        try {
          await transport.close();
        } catch (e) {
          logger('Error closing session transport', e);
        }
      }
      sessions.clear();
      await new Promise<void>(resolve => {
        httpServer.close(() => resolve());
      });
    },
  };
}

function checkBearer(req: IncomingMessage, expected: string): boolean {
  const auth = req.headers.authorization;
  if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) {
    return false;
  }
  const provided = auth.slice('Bearer '.length);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host);
}
