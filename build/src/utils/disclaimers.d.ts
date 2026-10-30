/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ParsedArguments } from '../config/mcp-options.js';
export declare function logCruxDisclaimer(args: ParsedArguments): void;
/**
 * Prints the privacy disclaimers to stderr. Both the server and the CLI
 * client call it. The CLI must not load `src/index.ts`, so this function
 * lives in its own module.
 */
export declare const logDisclaimers: (args: ParsedArguments) => void;
