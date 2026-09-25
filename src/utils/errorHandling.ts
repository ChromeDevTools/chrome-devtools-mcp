
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';
import {logger} from './logger.js';
import {PuppeteerError} from '../third_party/index.js';

export function setupUnhandledRejectionHandler(onCrash: () => void) {
  process.on('unhandledRejection', (reason, promise) => {
    logger?.('Unhandled promise rejection', promise, reason);
    if (process.env['CHROME_DEVTOOLS_MCP_CRASH_ON_UNCAUGHT'] === 'true') {
      onCrash();
      return;
    }

    // Crash on structural errors
    if (
      reason instanceof TypeError ||
      reason instanceof ReferenceError ||
      reason instanceof SyntaxError ||
      reason instanceof RangeError
    ) {
      logger?.('Crashing on structural unhandled rejection:', reason);
      onCrash();
      return;
    }

    if (reason instanceof PuppeteerError) {
      logger?.('Swallowing benign PuppeteerError:', reason);
      return;
    }

    console.error('Unhandled promise rejection (swallowed):', reason);
    logger?.('Unhandled promise rejection (swallowed):', reason);
  });
}
