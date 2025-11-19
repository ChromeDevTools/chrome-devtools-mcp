/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {parseArguments} from './cli.js';

// If moved update release-please config
// x-release-please-start-version
const VERSION = '0.10.1';
// x-release-please-end

export const args = parseArguments(VERSION);
export {VERSION};
