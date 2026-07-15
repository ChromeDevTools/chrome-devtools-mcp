/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {createHash} from 'node:crypto';
import http, {
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type {Duplex} from 'node:stream';
import {before, after, afterEach} from 'node:test';

import {html} from './utils.js';

const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

interface ParsedFrame {
  opcode: number;
  payload: Buffer;
  bytesConsumed: number;
}

// Parses a single client-to-server (masked) WebSocket frame with a payload
// of up to 64KiB. Returns null when the buffer does not contain a complete
// frame yet.
function parseClientFrame(buffer: Buffer): ParsedFrame | null {
  if (buffer.length < 2) {
    return null;
  }
  const opcode = buffer[0] & 0x0f;
  let payloadLength = buffer[1] & 0x7f;
  let offset = 2;
  if (payloadLength === 127) {
    if (buffer.length < 10) {
      return null;
    }
    payloadLength = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  } else if (payloadLength === 126) {
    if (buffer.length < 4) {
      return null;
    }
    payloadLength = buffer.readUInt16BE(2);
    offset = 4;
  }
  const masked = (buffer[1] & 0x80) !== 0;
  const maskLength = masked ? 4 : 0;
  if (buffer.length < offset + maskLength + payloadLength) {
    return null;
  }
  const mask = buffer.subarray(offset, offset + maskLength);
  const payload = Buffer.from(
    buffer.subarray(offset + maskLength, offset + maskLength + payloadLength),
  );
  if (masked) {
    for (let i = 0; i < payload.length; i++) {
      payload[i] ^= mask[i % 4];
    }
  }
  return {opcode, payload, bytesConsumed: offset + maskLength + payloadLength};
}

// Encodes a server-to-client (unmasked) text frame.
function encodeTextFrame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8');
  if (payload.length < 126) {
    return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
  }
  if (payload.length < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
    return Buffer.concat([header, payload]);
  }
  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(payload.length), 2);
  return Buffer.concat([header, payload]);
}

export class TestServer {
  #port: number;
  #server: Server;

  static randomPort() {
    /**
     * Some ports are restricted by Chromium and will fail to connect
     * to prevent we start after the
     *
     * https://source.chromium.org/chromium/chromium/src/+/main:net/base/port_util.cc;l=107?q=kRestrictedPorts&ss=chromium
     */
    const min = 10101;
    const max = 20202;
    return Math.floor(Math.random() * (max - min + 1) + min);
  }

  #routes: Record<string, (req: IncomingMessage, res: ServerResponse) => void> =
    {};
  #webSocketEchoPaths = new Set<string>();

  constructor(port: number) {
    this.#port = port;
    this.#server = http.createServer((req, res) => this.#handle(req, res));
    this.#server.on('upgrade', (req, socket) => {
      this.#handleUpgrade(req, socket);
    });
  }

  get baseUrl(): string {
    return `http://localhost:${this.#port}`;
  }

  getRoute(path: string) {
    if (!this.#routes[path]) {
      throw new Error(`Route ${path} was not setup.`);
    }
    return `${this.baseUrl}${path}`;
  }

  addHtmlRoute(path: string, htmlContent: string) {
    if (this.#routes[path]) {
      throw new Error(`Route ${path} was already setup.`);
    }
    this.#routes[path] = (_req: IncomingMessage, res: ServerResponse) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.statusCode = 200;
      res.end(htmlContent);
    };
  }

  addRoute(
    path: string,
    handler: (req: IncomingMessage, res: ServerResponse) => void,
  ) {
    if (this.#routes[path]) {
      throw new Error(`Route ${path} was already setup.`);
    }
    this.#routes[path] = handler;
  }

  /**
   * Accepts WebSocket connections on the given path and echoes every text
   * message back, prefixed with "echo: ".
   */
  addWebSocketEchoRoute(path: string) {
    this.#webSocketEchoPaths.add(path);
  }

  #handleUpgrade(req: IncomingMessage, socket: Duplex) {
    const key = req.headers['sec-websocket-key'];
    if (!this.#webSocketEchoPaths.has(req.url ?? '') || !key) {
      socket.destroy();
      return;
    }
    const accept = createHash('sha1')
      .update(key + WEBSOCKET_GUID)
      .digest('base64');
    socket.write(
      [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${accept}`,
        '',
        '',
      ].join('\r\n'),
    );

    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      let frame = parseClientFrame(buffer);
      while (frame) {
        buffer = buffer.subarray(frame.bytesConsumed);
        if (frame.opcode === 8) {
          // Close: acknowledge and end.
          socket.end(Buffer.from([0x88, 0x00]));
          return;
        }
        if (frame.opcode === 1) {
          socket.write(
            encodeTextFrame(`echo: ${frame.payload.toString('utf8')}`),
          );
        }
        frame = parseClientFrame(buffer);
      }
    });
    socket.on('error', () => {
      // The client may close abruptly at the end of a test.
    });
  }

  #handle(req: IncomingMessage, res: ServerResponse) {
    const url = req.url ?? '';
    const routeHandler = this.#routes[url];

    if (routeHandler) {
      routeHandler(req, res);
    } else {
      res.writeHead(404, {'Content-Type': 'text/html'});
      res.end(
        html`<h1>404 - Not Found</h1><p>The requested page does not exist.</p>`,
      );
    }
  }

  restore() {
    this.#routes = {};
    this.#webSocketEchoPaths.clear();
  }

  start(): Promise<void> {
    return new Promise(res => {
      this.#server.listen(this.#port, res);
    });
  }

  stop(): Promise<void> {
    return new Promise((res, rej) => {
      this.#server.closeAllConnections();
      this.#server.close(err => {
        if (err) {
          rej(err);
        } else {
          res();
        }
      });
    });
  }
}

export function serverHooks() {
  const server = new TestServer(TestServer.randomPort());
  before(async () => {
    await server.start();
  });
  after(async () => {
    await server.stop();
  });
  afterEach(() => {
    server.restore();
  });

  return server;
}
