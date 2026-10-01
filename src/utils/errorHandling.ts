/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';
import {logger} from './logger.js';

export function setupUnhandledRejectionHandler(onCrash: () => void) {
  process.on('unhandledRejection', (reason, promise) => {
    logger?.('Unhandled promise rejection:', promise, reason);
    console.error('Unhandled promise rejection:', reason);

    if (process.env['CHROME_DEVTOOLS_MCP_CRASH_ON_UNCAUGHT'] === 'true') {
      onCrash();
    }
  });
}
