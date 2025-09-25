/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import http, {
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import {before, after, afterEach} from 'node:test';

import {html} from './utils.js';

class TestServer {
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

  constructor(port: number) {
    this.#port = port;
    this.#server = http.createServer((req, res) => this.#handle(req, res));
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
  }

  start(): Promise<void> {
    return new Promise(res => {
      this.#server.listen(this.#port, res);
    });
  }

  stop(): Promise<void> {
    return new Promise((res, rej) => {
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
