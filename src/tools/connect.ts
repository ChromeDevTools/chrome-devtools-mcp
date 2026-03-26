/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {disconnectBrowser, ensureBrowserConnected} from '../browser.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const connect = defineTool({
  name: 'connect',
  description:
    'Connect to a different browser/Electron instance by CDP port. Disconnects from the current instance first.',
  schema: {
    port: zod
      .number()
      .describe('The remote debugging port to connect to (e.g. 9222, 9223)'),
  },
  annotations: {
    title: 'Connect to CDP instance',
    category: ToolCategory.NAVIGATION,
    readOnlyHint: false,
  },
  handler: async ({params}, response) => {
    disconnectBrowser();
    try {
      await ensureBrowserConnected({
        browserURL: `http://127.0.0.1:${params.port}`,
        devtools: false,
      });
      response.appendResponseLine(
        `Connected to CDP instance on port ${params.port}`,
      );
    } catch (err) {
      response.appendResponseLine(
        `Failed to connect to port ${params.port}: ${(err as Error).message}`,
      );
    }
  },
});

export const listInstances = defineTool({
  name: 'list_instances',
  description:
    'Scan for running browser/Electron instances on CDP ports 9222-9231',
  schema: {},
  annotations: {
    title: 'List CDP instances',
    category: ToolCategory.NAVIGATION,
    readOnlyHint: true,
  },
  handler: async (_args, response) => {
    const found: Array<{port: number; browser: string}> = [];
    for (let port = 9222; port < 9232; port++) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
          signal: AbortSignal.timeout(500),
        });
        const info = (await res.json()) as {Browser: string};
        found.push({port, browser: info.Browser});
      } catch {
        // not running on this port
      }
    }
    if (found.length === 0) {
      response.appendResponseLine(
        'No CDP instances found on ports 9222-9231',
      );
    } else {
      response.appendResponseLine(JSON.stringify(found, null, 2));
    }
  },
});
