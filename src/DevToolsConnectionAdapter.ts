/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type * as puppeteer from './third_party/index.js';
import type {DevTools} from './third_party/index.js';
import {CDPSessionEvent} from './third_party/index.js';

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
      throw new Error('Unknown session ' + sessionId);
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
