/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';

import {logger} from '../../logger.js';
import type {
  ChromeDevToolsMcpExtension,
  LogRequest,
  LogResponse,
  OsType,
} from '../types.js';

export interface ClearcutSenderConfig {
  appVersion: string;
  osType: OsType;
  clearcutEndpoint?: string;
  forceFlushIntervalMs?: number;
  includePidHeader?: boolean;
}

const MAX_BUFFER_SIZE = 1000;
const DEFAULT_CLEARCUT_ENDPOINT =
  'https://play.googleapis.com/log?format=json_proto';
const DEFAULT_FLUSH_INTERVAL_MS = 15 * 60 * 1000;

const LOG_SOURCE = 2839;
const CLIENT_TYPE = 47;
const MIN_RATE_LIMIT_WAIT_MS = 30_000;
const REQUEST_TIMEOUT_MS = 30_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;
const SESSION_ROTATION_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface BufferedEvent {
  event: ChromeDevToolsMcpExtension;
  timestamp: number;
}

export class ClearcutSender {
  #appVersion: string;
  #osType: OsType;
  #clearcutEndpoint: string;
  #flushIntervalMs: number;
  #includePidHeader: boolean;
  #sessionId: string;
  #sessionCreated: number;
  #buffer: BufferedEvent[] = [];
  #flushTimer: ReturnType<typeof setTimeout> | null = null;
  #isFlushing = false;
  #timerStarted = false;

  constructor(config: ClearcutSenderConfig) {
    this.#appVersion = config.appVersion;
    this.#osType = config.osType;
    this.#clearcutEndpoint =
      config.clearcutEndpoint ?? DEFAULT_CLEARCUT_ENDPOINT;
    this.#flushIntervalMs =
      config.forceFlushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this.#includePidHeader = config.includePidHeader ?? false;
    this.#sessionId = crypto.randomUUID();
    this.#sessionCreated = Date.now();
  }

  enqueueEvent(event: ChromeDevToolsMcpExtension): void {
    if (Date.now() - this.#sessionCreated > SESSION_ROTATION_INTERVAL_MS) {
      this.#sessionId = crypto.randomUUID();
      this.#sessionCreated = Date.now();
    }

    logger('Enqueing telemetry event', JSON.stringify(event, null, 2));

    this.#addToBuffer({
      ...event,
      session_id: this.#sessionId,
      app_version: this.#appVersion,
      os_type: this.#osType,
    });

    if (!this.#timerStarted) {
      this.#timerStarted = true;
      this.#scheduleFlush(this.#flushIntervalMs);
    }
  }

  async sendShutdownEvent(): Promise<void> {
    if (this.#flushTimer) {
      clearTimeout(this.#flushTimer);
      this.#flushTimer = null;
    }

    const shutdownEvent: ChromeDevToolsMcpExtension = {
      server_shutdown: {},
    };
    this.enqueueEvent(shutdownEvent);

    try {
      await Promise.race([
        this.#finalFlush(),
        new Promise(resolve => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS)),
      ]);
      logger('Final flush completed');
    } catch (error) {
      logger('Final flush failed:', error);
    }
  }

  async #flush(): Promise<void> {
    if (this.#isFlushing) {
      return;
    }

    if (this.#buffer.length === 0) {
      this.#scheduleFlush(this.#flushIntervalMs);
      return;
    }

    this.#isFlushing = true;
    let nextDelayMs = this.#flushIntervalMs;

    // Optimistically remove events from buffer before sending.
    // This prevents race conditions where a simultaneous #finalFlush would include these same events.
    const eventsToSend = [...this.#buffer];
    this.#buffer = [];

    try {
      const result = await this.#sendBatch(eventsToSend);

      if (result.success) {
        if (result.nextRequestWaitMs !== undefined) {
          nextDelayMs = Math.max(
            result.nextRequestWaitMs,
            MIN_RATE_LIMIT_WAIT_MS,
          );
        }
      } else if (result.isPermanentError) {
        logger(
          'Permanent error, dropped batch of',
          eventsToSend.length,
          'events',
        );
      } else {
        // Transient error: Requeue events at the front of the buffer
        // to maintain order and retry them later.
        this.#buffer = [...eventsToSend, ...this.#buffer];
      }
    } catch (error) {
      // Safety catch for unexpected errors, requeue events
      this.#buffer = [...eventsToSend, ...this.#buffer];
      logger('Flush failed unexpectedly:', error);
    } finally {
      this.#isFlushing = false;
      this.#scheduleFlush(nextDelayMs);
    }
  }

  #addToBuffer(event: ChromeDevToolsMcpExtension): void {
    if (this.#buffer.length >= MAX_BUFFER_SIZE) {
      this.#buffer.shift();
      logger('Telemetry buffer overflow: dropped oldest event');
    }
    this.#buffer.push({
      event,
      timestamp: Date.now(),
    });
  }

  #scheduleFlush(delayMs: number): void {
    if (this.#flushTimer) {
      clearTimeout(this.#flushTimer);
    }
    this.#flushTimer = setTimeout(() => {
      this.#flush().catch(err => {
        logger('Flush error:', err);
      });
    }, delayMs);
  }

  async #sendBatch(events: BufferedEvent[]): Promise<{
    success: boolean;
    isPermanentError?: boolean;
    nextRequestWaitMs?: number;
  }> {
    const requestBody: LogRequest = {
      log_source: LOG_SOURCE,
      request_time_ms: Date.now().toString(),
      client_info: {
        client_type: CLIENT_TYPE,
      },
      log_event: events.map(({event, timestamp}) => ({
        event_time_ms: timestamp.toString(),
        source_extension_json: JSON.stringify(event),
      })),
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(this.#clearcutEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Used in E2E tests to confirm that the watchdog process is killed
          ...(this.#includePidHeader
            ? {'X-Watchdog-Pid': process.pid.toString()}
            : {}),
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      if (response.ok) {
        const data = (await response.json()) as LogResponse;
        return {
          success: true,
          nextRequestWaitMs: data.next_request_wait_millis,
        };
      }

      const status = response.status;
      if (status >= 500 || status === 429) {
        return {success: false};
      }

      logger('Telemetry permanent error:', status);
      return {success: false, isPermanentError: true};
    } catch {
      clearTimeout(timeoutId);
      return {success: false};
    }
  }

  async #finalFlush(): Promise<void> {
    if (this.#buffer.length === 0) {
      return;
    }
    const eventsToSend = [...this.#buffer];
    await this.#sendBatch(eventsToSend);
  }

  stopForTesting(): void {
    if (this.#flushTimer) {
      clearTimeout(this.#flushTimer);
      this.#flushTimer = null;
    }
    this.#timerStarted = false;
  }

  get bufferSizeForTesting(): number {
    return this.#buffer.length;
  }
}
