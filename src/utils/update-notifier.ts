/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import updateNotifier from 'update-notifier';

import {VERSION} from '../version.js';

/**
 * Notifies the user if an update for the package is available.
 * @param message A custom message to display in the update notification.
 */
export function notifyUpdate(message: string) {
  const notifier = updateNotifier({
    pkg: {
      name: 'chrome-devtools-mcp',
      version: VERSION,
    },
    shouldNotifyInNpmScript: true,
  });
  notifier.notify({
    message: message,
  });
}
