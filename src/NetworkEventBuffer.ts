/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Browser,
  CDPSession,
  Connection,
  Handler,
  Page,
  Protocol,
} from './third_party/index.js';
import {CDPSessionEvent} from './third_party/index.js';
import {logger} from './utils/logger.js';

/**
 * The Network domain events consumed by Puppeteer's NetworkManager.
 */
const NETWORK_EVENTS = [
  'Network.requestWillBeSent',
  'Network.requestWillBeSentExtraInfo',
  'Network.requestServedFromCache',
  'Network.responseReceived',
  'Network.loadingFinished',
  'Network.loadingFailed',
  'Network.responseReceivedExtraInfo',
] as const;

type NetworkEventName = (typeof NETWORK_EVENTS)[number];

interface BufferedTarget {
  session: CDPSession;
  events: Array<{name: NetworkEventName; event: unknown}>;
  listeners: Array<[NetworkEventName, Handler<unknown>]>;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * Captures Network events for newly attached page targets before the
 * Puppeteer Page (and with it the NetworkCollector) exists.
 *
 * Pages created by the browser itself (window.open, target=_blank,
 * chrome.tabs.create, ...) start navigating as soon as Puppeteer's
 * TargetManager resumes them, long before `targetcreated` handlers get to
 * create the Puppeteer Page whose NetworkManager sends `Network.enable`.
 * Chromium does not replay Network events to sessions that enable the domain
 * late, so the initial navigation request (including its redirect chain) was
 * never recorded.
 *
 * This class enables the Network domain the moment the new target's session
 * attaches: the connection emits `SessionAttached` before the
 * `Target.attachedToTarget` event reaches Puppeteer's TargetManager, so the
 * `Network.enable` command is dispatched on the session before the
 * `Runtime.runIfWaitingForDebugger` command with which the TargetManager
 * resumes the target, and CDP processes commands of a session in order.
 * Events arriving while nothing else listens are buffered and replayed into
 * the session once the McpPage's collectors are wired up, at which point
 * Puppeteer's NetworkManager turns them into regular HTTPRequests.
 */
export class NetworkEventBuffer {
  static readonly MAX_EVENTS_PER_TARGET = 1_000;
  static readonly BUFFER_TIMEOUT = 30_000;

  #connection?: Connection;
  #buffers = new Map<string, BufferedTarget>();
  #hookedSessions = new Set<CDPSession>();
  #disposed = false;

  constructor(browser: Browser) {
    // @ts-expect-error use the CDP connection (internal Puppeteer API).
    this.#connection = browser._connection as Connection | undefined;
    this.#connection?.on(
      CDPSessionEvent.SessionAttached,
      this.#onSessionAttached,
    );
    this.#connection?.on(
      CDPSessionEvent.SessionDetached,
      this.#onSessionDetached,
    );
  }

  dispose(): void {
    this.#disposed = true;
    this.#connection?.off(
      CDPSessionEvent.SessionAttached,
      this.#onSessionAttached,
    );
    this.#connection?.off(
      CDPSessionEvent.SessionDetached,
      this.#onSessionDetached,
    );
    for (const session of this.#hookedSessions) {
      session.off('Target.attachedToTarget', this.#onAttachedToTarget);
    }
    this.#hookedSessions.clear();
    for (const targetId of [...this.#buffers.keys()]) {
      this.#dropBuffer(targetId);
    }
  }

  /**
   * The connection emits SessionAttached for a new session before it routes
   * the Target.attachedToTarget event to the parent session, so the listener
   * registered here on new (e.g. tab) sessions runs before the one Puppeteer's
   * TargetManager registers later while handling the same event.
   */
  #onSessionAttached = (session: CDPSession): void => {
    if (this.#disposed) {
      return;
    }
    session.on('Target.attachedToTarget', this.#onAttachedToTarget);
    this.#hookedSessions.add(session);
  };

  #onSessionDetached = (session: CDPSession): void => {
    this.#hookedSessions.delete(session);
    for (const [targetId, entry] of this.#buffers) {
      if (entry.session === session) {
        this.#dropBuffer(targetId);
      }
    }
  };

  #onAttachedToTarget = (
    event: Protocol.Target.AttachedToTargetEvent,
  ): void => {
    if (this.#disposed) {
      return;
    }
    const {sessionId, targetInfo} = event;
    if (targetInfo.type !== 'page' || this.#buffers.has(targetInfo.targetId)) {
      return;
    }
    const session = this.#connection?.session(sessionId);
    if (!session) {
      return;
    }
    // Enable the Network domain before Puppeteer's TargetManager resumes the
    // target so that the very first (navigation) request is reported.
    session.send('Network.enable').catch(() => {
      // The target may be gone already.
    });
    const entry: BufferedTarget = {
      session,
      events: [],
      listeners: [],
      timeout: setTimeout(() => {
        this.#dropBuffer(targetInfo.targetId);
      }, NetworkEventBuffer.BUFFER_TIMEOUT),
    };
    entry.timeout.unref?.();
    for (const name of NETWORK_EVENTS) {
      const listener: Handler<unknown> = networkEvent => {
        if (session.listenerCount(name) > 1) {
          // Another consumer (Puppeteer's NetworkManager) has attached in the
          // meantime and processes events as they arrive.
          return;
        }
        if (entry.events.length >= NetworkEventBuffer.MAX_EVENTS_PER_TARGET) {
          return;
        }
        entry.events.push({name, event: networkEvent});
      };
      session.on(name, listener);
      entry.listeners.push([name, listener]);
    }
    this.#buffers.set(targetInfo.targetId, entry);
  };

  /**
   * Replays the events buffered for the page's target into its CDP session so
   * that Puppeteer's NetworkManager turns them into HTTPRequests. Must be
   * called after the page's collectors are wired up.
   */
  flush(page: Page): void {
    let targetId: string;
    try {
      // @ts-expect-error use internal Puppeteer API to get the target ID.
      targetId = page.target()._targetId as string;
    } catch {
      return;
    }
    const entry = this.#buffers.get(targetId);
    if (!entry) {
      return;
    }
    // Remove the buffer (and its listeners) first so that replayed events are
    // not buffered again.
    this.#dropBuffer(targetId);
    for (const {name, event} of entry.events) {
      try {
        entry.session.emit(name, event as never);
      } catch (err) {
        logger?.('Error replaying buffered network event', err);
      }
    }
  }

  #dropBuffer(targetId: string): void {
    const entry = this.#buffers.get(targetId);
    if (!entry) {
      return;
    }
    this.#buffers.delete(targetId);
    clearTimeout(entry.timeout);
    for (const [name, listener] of entry.listeners) {
      entry.session.off(name, listener);
    }
  }
}
