/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';

import {logger} from '../../logger.js';
import type {ChromeDevToolsMcpExtension, OsType} from '../types.js';

const SESSION_ROTATION_INTERVAL_MS = 24 * 60 * 60 * 1000;

export class ClearcutSender {
  #appVersion: string;
  #osType: OsType;
  #sessionId: string;
  #sessionCreated: number;

  constructor(appVersion: string, osType: OsType) {
    this.#appVersion = appVersion;
    this.#osType = osType;
    this.#sessionId = crypto.randomUUID();
    this.#sessionCreated = Date.now();
  }

  async send(event: ChromeDevToolsMcpExtension): Promise<void> {
    this.#rotateSessionIfNeeded();
    const enrichedEvent = this.#enrichEvent(event);
    this.transport(enrichedEvent);
  }

  transport(event: ChromeDevToolsMcpExtension): void {
    logger('Telemetry event', JSON.stringify(event, null, 2));
  }

  async sendShutdownEvent(): Promise<void> {
    const shutdownEvent: ChromeDevToolsMcpExtension = {
      server_shutdown: {},
    };
    await this.send(shutdownEvent);
  }

  #rotateSessionIfNeeded(): void {
    if (Date.now() - this.#sessionCreated > SESSION_ROTATION_INTERVAL_MS) {
      this.#sessionId = crypto.randomUUID();
      this.#sessionCreated = Date.now();
    }
  }

  #enrichEvent(event: ChromeDevToolsMcpExtension): ChromeDevToolsMcpExtension {
    return {
      ...event,
      session_id: this.#sessionId,
      app_version: this.#appVersion,
      os_type: this.#osType,
    };
  }
}
