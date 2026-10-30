/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { YargsOptions } from '../third_party/index.js';
import type { McpOptionsFor } from './category-options.js';
interface ToolOption extends YargsOptions {
    reloadable: true;
}
export interface ToolArguments {
    screenshotFormat: 'jpeg' | 'png' | 'webp';
    screenshotQuality?: number;
    screenshotMaxWidth?: number;
    screenshotMaxHeight?: number;
}
export type ToolOptions = McpOptionsFor<ToolArguments, ToolOption>;
/**
 * Options that change the default behavior of tools.
 */
export declare const toolOptions: ToolOptions;
export {};
