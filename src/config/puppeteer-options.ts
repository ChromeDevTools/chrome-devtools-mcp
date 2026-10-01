/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {YargsOptions} from '../third_party/index.js';
import {findUnenforceablePattern} from '../utils/url.js';

/**
 * Options that are applied through Puppeteer when launching or connecting to
 * the browser.
 */
export const puppeteerOptions = {
  viewport: {
    type: 'string',
    describe:
      'Initial viewport size for the Chrome instances started by the server. For example, `1280x720`. In headless mode, max size is 3840x2160px.',
    coerce: (arg: string | undefined) => {
      if (arg === undefined) {
        return;
      }
      const [width, height] = arg.split('x').map(Number);
      if (!width || !height || Number.isNaN(width) || Number.isNaN(height)) {
        throw new Error('Invalid viewport. Expected format is `1280x720`.');
      }
      return {
        width,
        height,
      };
    },
  },
  acceptInsecureCerts: {
    type: 'boolean',
    default: false,
    description: `If enabled, ignores errors relative to self-signed and expired certificates. Use with caution.`,
  },
  blockedUrlPattern: {
    type: 'array',
    string: true,
    describe:
      "Restricts browser's network access by blocking specified URL patterns (uses https://urlpattern.spec.whatwg.org/). Silently detaches from targets with blocked URLs upon connection, and blocks runtime requests (including navigations and subresources). Accepts an array of patterns. A pattern that uses a regexp group or a named group (`:name`) in any component (for example `(127\\.\\d+\\.\\d+\\.\\d+)` in the hostname or `*://127.0.0.1::port/*`) is rejected, because it is not enforced on redirects or subresources; use an exact value or a `*` wildcard instead.",
    coerce: (arg: string[] | undefined) => {
      if (arg === undefined || arg.length === 0) {
        return undefined;
      }
      const pattern = findUnenforceablePattern(arg);
      if (pattern) {
        throw new Error(
          `Invalid --blockedUrlPattern "${pattern}": a regexp group or a ":name" named group is not enforced on redirects or subresources. Use an exact value or a "*" wildcard instead.`,
        );
      }
      return arg;
    },
  },
  allowedUrlPattern: {
    type: 'array',
    string: true,
    describe:
      "Restricts browser's network access by allowing only specified URL patterns (uses https://urlpattern.spec.whatwg.org/). Requires Chrome 149+. Silently detaches from targets with unallowed URLs upon connection, and blocks runtime requests (including navigations and subresources). Accepts an array of patterns. A pattern that uses a regexp group or a named group (`:name`) in any component (for example `(127\\.\\d+\\.\\d+\\.\\d+)` in the hostname or `*://127.0.0.1::port/*`) is rejected, because it is not enforced on redirects or subresources; use an exact value or a `*` wildcard instead.",
    coerce: (arg: string[] | undefined) => {
      if (arg === undefined) {
        return undefined;
      }
      if (arg.length === 0) {
        throw new Error(
          'Invalid --allowedUrlPattern: at least one pattern is required.',
        );
      }
      const pattern = findUnenforceablePattern(arg);
      if (pattern) {
        throw new Error(
          `Invalid --allowedUrlPattern "${pattern}": a regexp group or a ":name" named group is not enforced on redirects or subresources. Use an exact value or a "*" wildcard instead.`,
        );
      }
      return arg;
    },
  },
} satisfies Record<string, YargsOptions>;
