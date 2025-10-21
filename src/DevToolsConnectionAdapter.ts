/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {Connection} from '../node_modules/chrome-devtools-frontend/front_end/core/protocol_client/InspectorBackend.js';

import {type ConnectionTransport} from './third_party/index.js';

/**
 * Allows a puppeteer {@link ConnectionTransport} to act like a DevTools {@link Connection}.
 */
export class DevToolsConnectionAdapter extends Connection {
  #transport: ConnectionTransport | null;
  #onDisconnect: ((arg0: string) => void) | null = null;

  constructor(transport: ConnectionTransport) {
    super();
    this.#transport = transport;
    this.#transport.onclose = () => this.#onDisconnect?.('');
    this.#transport.onmessage = msg => this.onMessage?.(msg);
  }

  override setOnMessage(onMessage: (arg0: object | string) => void): void {
    this.onMessage = onMessage;
  }

  override setOnDisconnect(onDisconnect: (arg0: string) => void): void {
    this.#onDisconnect = onDisconnect;
  }

  override sendRawMessage(message: string): void {
    this.#transport?.send(message);
  }

  override async disconnect(): Promise<void> {
    this.#transport?.close();
    this.#transport = null;
  }
}
