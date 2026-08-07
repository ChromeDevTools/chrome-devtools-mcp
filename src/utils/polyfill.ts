/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DisposableStack,
  AsyncDisposableStack,
  SuppressedError,
} from '../third_party/index.js';

globalThis.DisposableStack ??= DisposableStack;
globalThis.AsyncDisposableStack ??= AsyncDisposableStack;
// @ts-expect-error Type mismatch between puppeteer-core and node for SuppressedError.
globalThis.SuppressedError ??= SuppressedError;
