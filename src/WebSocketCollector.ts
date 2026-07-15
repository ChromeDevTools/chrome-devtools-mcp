/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {PageCollector, type ListenerMap} from './PageCollector.js';
import type {CDPSession, Page, Protocol} from './third_party/index.js';

/**
 * Number of messages retained per connection. When exceeded, the oldest
 * messages are dropped and counted in `droppedMessages`.
 */
export const MAX_MESSAGES_PER_CONNECTION = 500;

/**
 * Maximum stored payload length per message. Longer payloads are truncated
 * and marked as such; `payloadLength` keeps the original length.
 */
export const MAX_STORED_PAYLOAD_LENGTH = 100_000;

/**
 * Maximum total stored payload length per connection. When exceeded, the
 * oldest messages are dropped even if the message count is below
 * MAX_MESSAGES_PER_CONNECTION.
 */
export const MAX_STORED_PAYLOAD_TOTAL = 2_000_000;

const TEXT_OPCODE = 1;
const BINARY_OPCODE = 2;

export interface WebSocketMessage {
  /** 1-based id, unique within the connection, stable across drops. */
  id: number;
  direction: 'sent' | 'received';
  /** 1 for text messages; 2 for binary messages (payload is base64). */
  opcode: number;
  payload: string;
  truncated: boolean;
  /** Length of the original payload (characters; base64 for binary). */
  payloadLength: number;
  receivedAt: Date;
}

export interface RetentionLimits {
  maxMessages: number;
  maxPayloadLength: number;
  maxPayloadTotal: number;
}

const DEFAULT_RETENTION_LIMITS: RetentionLimits = {
  maxMessages: MAX_MESSAGES_PER_CONNECTION,
  maxPayloadLength: MAX_STORED_PAYLOAD_LENGTH,
  maxPayloadTotal: MAX_STORED_PAYLOAD_TOTAL,
};

export class WebSocketConnection {
  readonly url: string;
  status: 'open' | 'closed' = 'open';
  droppedMessages = 0;
  sentCount = 0;
  receivedCount = 0;
  #messages: WebSocketMessage[] = [];
  #nextMessageId = 1;
  #storedPayloadTotal = 0;
  #limits: RetentionLimits;

  constructor(url: string, limits: RetentionLimits = DEFAULT_RETENTION_LIMITS) {
    this.url = url;
    this.#limits = limits;
  }

  addFrame(
    direction: 'sent' | 'received',
    frame: Protocol.Network.WebSocketFrame,
  ): void {
    // Only data frames are stored; control frames (ping/pong/close) are
    // protocol noise for debugging purposes.
    if (frame.opcode !== TEXT_OPCODE && frame.opcode !== BINARY_OPCODE) {
      return;
    }
    if (direction === 'sent') {
      this.sentCount++;
    } else {
      this.receivedCount++;
    }
    const truncated = frame.payloadData.length > this.#limits.maxPayloadLength;
    const payload = truncated
      ? frame.payloadData.slice(0, this.#limits.maxPayloadLength)
      : frame.payloadData;
    this.#messages.push({
      id: this.#nextMessageId++,
      direction,
      opcode: frame.opcode,
      payload,
      truncated,
      payloadLength: frame.payloadData.length,
      receivedAt: new Date(),
    });
    this.#storedPayloadTotal += payload.length;
    // Drop the oldest messages when either the message count or the total
    // stored payload budget is exceeded. The newest message is always kept.
    while (
      this.#messages.length > this.#limits.maxMessages ||
      (this.#messages.length > 1 &&
        this.#storedPayloadTotal > this.#limits.maxPayloadTotal)
    ) {
      const removed = this.#messages.shift();
      if (!removed) {
        break;
      }
      this.#storedPayloadTotal -= removed.payload.length;
    }
    this.droppedMessages = this.#nextMessageId - 1 - this.#messages.length;
  }

  getMessages(): WebSocketMessage[] {
    return this.#messages;
  }

  getMessage(id: number): WebSocketMessage | undefined {
    return this.#messages.find(message => message.id === id);
  }
}

/**
 * Collects WebSocket connections and their messages for a single page.
 * Puppeteer does not expose WebSocket frames, so the CDP Network events
 * (which are already enabled on the page session) are consumed directly and
 * fed into the PageCollector storage, following the same per-page pattern as
 * NetworkCollector and ConsoleCollector.
 */
export class WebSocketCollector extends PageCollector<WebSocketConnection> {
  #subscriber: WebSocketPageSubscriber;

  constructor(page: Page) {
    // Capture the storage `collect` callback so the CDP subscriber can feed
    // newly created connections into the collector. WebSocket frames arrive
    // as CDP session events rather than puppeteer page events, so there is no
    // page event to list in the ListenerMap.
    let collect!: (connection: WebSocketConnection) => void;
    super(page, collector => {
      collect = collector;
      return {} as ListenerMap;
    });
    this.#subscriber = new WebSocketPageSubscriber(page, connection => {
      collect(connection);
    });
    this.#subscriber.subscribe();
  }

  override dispose(): void {
    super.dispose();
    this.#subscriber.unsubscribe();
  }

  // Carry still-open connections over into the current navigation view. The
  // base split fires on puppeteer's "framenavigated", which also fires for
  // same-document navigations (for example history.pushState during the boot
  // of a single-page app) that do not close WebSockets; without this, a
  // connection created before such a navigation would silently disappear from
  // the listing while still serving the page.
  override splitAfterNavigation(): void {
    const open = this.storage[0].filter(connection => {
      return connection.status === 'open';
    });
    this.storage[0] = this.storage[0].filter(connection => {
      return connection.status !== 'open';
    });
    this.storage.unshift(open);
    this.storage.splice(this.maxNavigationSaved);
  }
}

class WebSocketPageSubscriber {
  #session: CDPSession;
  #onConnection: (connection: WebSocketConnection) => void;
  #openConnections = new Map<Protocol.Network.RequestId, WebSocketConnection>();

  constructor(
    page: Page,
    onConnection: (connection: WebSocketConnection) => void,
  ) {
    this.#onConnection = onConnection;
    // @ts-expect-error use existing CDP client (internal Puppeteer API).
    this.#session = page._client() as CDPSession;
  }

  subscribe() {
    this.#session.on('Network.webSocketCreated', this.#onCreated);
    this.#session.on('Network.webSocketFrameSent', this.#onFrameSent);
    this.#session.on('Network.webSocketFrameReceived', this.#onFrameReceived);
    this.#session.on('Network.webSocketClosed', this.#onClosed);
    this.#session.on(
      'Runtime.executionContextsCleared',
      this.#onExecutionContextsCleared,
    );
  }

  unsubscribe() {
    this.#session.off('Network.webSocketCreated', this.#onCreated);
    this.#session.off('Network.webSocketFrameSent', this.#onFrameSent);
    this.#session.off('Network.webSocketFrameReceived', this.#onFrameReceived);
    this.#session.off('Network.webSocketClosed', this.#onClosed);
    this.#session.off(
      'Runtime.executionContextsCleared',
      this.#onExecutionContextsCleared,
    );
    this.#openConnections.clear();
  }

  #onCreated = (event: Protocol.Network.WebSocketCreatedEvent) => {
    const connection = new WebSocketConnection(event.url);
    this.#openConnections.set(event.requestId, connection);
    this.#onConnection(connection);
  };

  #onFrameSent = (event: Protocol.Network.WebSocketFrameSentEvent) => {
    this.#openConnections
      .get(event.requestId)
      ?.addFrame('sent', event.response);
  };

  #onFrameReceived = (event: Protocol.Network.WebSocketFrameReceivedEvent) => {
    this.#openConnections
      .get(event.requestId)
      ?.addFrame('received', event.response);
  };

  #onClosed = (event: Protocol.Network.WebSocketClosedEvent) => {
    const connection = this.#openConnections.get(event.requestId);
    if (connection) {
      connection.status = 'closed';
      this.#openConnections.delete(event.requestId);
    }
  };

  // Connections do not survive a cross-document navigation, but the backend
  // does not reliably report them as closed. Unlike puppeteer's
  // "framenavigated" event, executionContextsCleared does not fire for
  // same-document navigations (history.pushState), which keep WebSockets
  // alive.
  #onExecutionContextsCleared = () => {
    for (const connection of this.#openConnections.values()) {
      connection.status = 'closed';
    }
    this.#openConnections.clear();
  };
}
