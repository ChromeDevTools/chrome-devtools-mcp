/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {DisposableStack, AsyncDisposableStack} from '../third_party/index.js';

globalThis.DisposableStack ??= DisposableStack;
globalThis.AsyncDisposableStack ??= AsyncDisposableStack;
