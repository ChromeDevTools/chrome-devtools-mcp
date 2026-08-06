/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type * as puppeteer from '../third_party/index.js';
import type {DevTools} from '../third_party/index.js';
import {CDPSessionEvent} from '../third_party/index.js';

import {
  isResourceUrlAllowed,
  recordRefusedResourceUrl,
} from './sourceMapGate.js';

/**
 * This class makes a puppeteer connection look like DevTools CDPConnection.
 *
 * Since we connect "root" DevTools targets to specific pages, we scope everything to a puppeteer CDP session.
 *
 * We don't have to recursively listen for 'sessionattached' as the "root" CDP session sees all child session attached
 * events, regardless how deeply nested they are.
 */
export class PuppeteerDevToolsConnection
  implements DevTools.CDPConnection.CDPConnection
{
  readonly #connection: puppeteer.Connection;
  readonly #observers = new Set<DevTools.CDPConnection.CDPConnectionObserver>();
  readonly #sessionEventHandlers = new Map<
    string,
    puppeteer.Handler<unknown>
  >();

  constructor(session: puppeteer.CDPSession) {
    this.#connection = session.connection()!;

    session.on(
      CDPSessionEvent.SessionAttached,
      this.#startForwardingCdpEvents.bind(this),
    );
    session.on(
      CDPSessionEvent.SessionDetached,
      this.#stopForwardingCdpEvents.bind(this),
    );

    this.#startForwardingCdpEvents(session);
  }

  send<T extends DevTools.CDPConnection.Command>(
    method: T,
    params: DevTools.CDPConnection.CommandParams<T>,
    sessionId: string | undefined,
  ): Promise<
    | {result: DevTools.CDPConnection.CommandResult<T>}
    | {error: DevTools.CDPConnection.CDPError}
  > {
    if (sessionId === undefined) {
      throw new Error(
        'Attempting to send on the root session. This must not happen',
      );
    }
    const session = this.#connection.session(sessionId);
    if (!session) {
      // A session can go away while commands for it are still in flight, for
      // example when a page is closed while its source maps are loading. That
      // is normal, so report it the same way a failed command is reported.
      // Throwing here would escape synchronously out of a method declared to
      // return a promise, past the generated agent code, and end the process.
      return Promise.resolve({
        error: {
          code: -32000,
          message: 'Unknown session ' + sessionId,
        } as DevTools.CDPConnection.CDPError,
      });
    }
    // The DevTools frontend loads developer resources (in practice: source
    // maps) for every script it sees. We only want the ones we are about to
    // use, so refuse the rest before they reach the browser. Answering with a
    // protocol error is the path `PageResourceLoader` already handles.
    if (method === 'Network.loadNetworkResource') {
      const url = (params as {url?: string})?.url;
      if (url !== undefined && !isResourceUrlAllowed(url)) {
        recordRefusedResourceUrl(url);
        return Promise.resolve({
          error: {
            code: -32000,
            message: 'Developer resources are loaded on demand',
          } as DevTools.CDPConnection.CDPError,
        });
      }
    }
    // Rolled protocol version between puppeteer and DevTools doesn't necessarily match
    /* eslint-disable @typescript-eslint/no-explicit-any */
    return session
      .send(method as any, params)
      .then(result => ({result}))
      .catch(error => ({error})) as any;
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  observe(observer: DevTools.CDPConnection.CDPConnectionObserver): void {
    this.#observers.add(observer);
  }

  unobserve(observer: DevTools.CDPConnection.CDPConnectionObserver): void {
    this.#observers.delete(observer);
  }

  #startForwardingCdpEvents(session: puppeteer.CDPSession): void {
    const handler = this.#handleEvent.bind(
      this,
      session.id(),
    ) as puppeteer.Handler<unknown>;
    this.#sessionEventHandlers.set(session.id(), handler);
    session.on('*', handler);
  }

  #stopForwardingCdpEvents(session: puppeteer.CDPSession): void {
    const handler = this.#sessionEventHandlers.get(session.id());
    if (handler) {
      session.off('*', handler);
    }
  }

  #handleEvent(
    sessionId: string,
    type: string | symbol | number,
    event: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  ): void {
    if (
      typeof type === 'string' &&
      type !== CDPSessionEvent.SessionAttached &&
      type !== CDPSessionEvent.SessionDetached
    ) {
      this.#observers.forEach(observer =>
        observer.onEvent({
          method: type as DevTools.CDPConnection.Event,
          sessionId,
          params: event,
        }),
      );
    }
  }
}
