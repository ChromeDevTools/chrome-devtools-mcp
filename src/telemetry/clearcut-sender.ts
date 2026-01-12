/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {ChromeDevToolsMcpExtension} from './types.js';
import {logger} from '../logger.js';

export class ClearcutSender {
  async send(event: ChromeDevToolsMcpExtension): Promise<void> {
    logger('Telemetry event', JSON.stringify(event, null, 2));
  }
}
