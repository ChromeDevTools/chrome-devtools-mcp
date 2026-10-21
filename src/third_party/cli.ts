/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @file Third-party modules for the `chrome-devtools` CLI client.
 *
 * The CLI starts a new process for every command. It must load only the
 * modules it needs, so it does not import `./index.js`. That bundle contains
 * Puppeteer, the MCP SDK and the DevTools frontend and takes about 0.5 s to
 * load. Modules on the CLI path import from this file instead.
 *
 * `./index.js` re-exports everything from this file, so the server code can
 * keep one import path.
 */

// Node 20 and 22 have no global URLPattern. Puppeteer's polyfill module sets
// `globalThis.URLPattern` when the global is missing. ES modules evaluate
// their imports before their own body, so the global is always defined by
// the time the export below runs.
import 'puppeteer-core/lib/third_party/urlpattern-polyfill/urlpattern-polyfill.js';

export type {Options as YargsOptions, InferredOptionTypes} from 'yargs';
export {default as yargs} from 'yargs';
export {hideBin} from 'yargs/helpers';
export {default as semver} from 'semver';
export {PipeTransport} from 'puppeteer-core/internal/node/PipeTransport.js';

/**
 * The native `URLPattern` on Node 23+, or Puppeteer's polyfill on older
 * Node versions. Import this instead of using the global so the import
 * also installs the polyfill.
 */
export const URLPattern: typeof globalThis.URLPattern = globalThis.URLPattern;
