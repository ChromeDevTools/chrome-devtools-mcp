/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { KeyInput } from '../third_party/index.js';
/**
 * Whether the string is a single valid key name (no `+` combinations).
 */
export declare function isValidKey(key: string): key is KeyInput;
/**
 * Error message for a string that is not a valid key name.
 */
export declare function invalidKeyMessage(key: string): string;
/**
 * Returns the primary key, followed by modifiers in original order.
 */
export declare function parseKey(keyInput: string): [KeyInput, ...KeyInput[]];
