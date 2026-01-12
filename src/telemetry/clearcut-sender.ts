/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {logger} from '../logger.js';

import type {ChromeDevToolsMcpExtension} from './types.js';

export class ClearcutSender {
  async send(event: ChromeDevToolsMcpExtension): Promise<void> {
    logger('Telemetry event', JSON.stringify(event, null, 2));
  }
}
