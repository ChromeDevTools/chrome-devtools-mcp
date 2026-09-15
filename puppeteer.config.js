/**
 * @license
 * Copyright 2025 Google Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @type {import("puppeteer").Configuration}
 */
export default {
  chrome: {
    skipDownload: false,
  },
  ['chrome-headless-shell']: {
    skipDownload: true,
  },
  firefox: {
    skipDownload: true,
  },
};
