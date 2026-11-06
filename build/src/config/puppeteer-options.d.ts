/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { YargsOptions } from '../third_party/index.js';
import type { McpOptionsFor } from './category-options.js';
interface PuppeteerOption extends YargsOptions {
    reloadable?: boolean;
}
export interface PuppeteerArguments {
    viewport?: {
        width: number;
        height: number;
    };
    acceptInsecureCerts: boolean;
    blockedUrlPattern?: string[];
    allowedUrlPattern?: string[];
}
export type PuppeteerOptions = McpOptionsFor<PuppeteerArguments, PuppeteerOption>;
/**
 * Options that are applied through Puppeteer when launching or connecting to
 * the browser.
 */
export declare const puppeteerOptions: PuppeteerOptions;
export {};
