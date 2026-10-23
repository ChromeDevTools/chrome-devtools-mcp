/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { McpOptionsFor } from './category-options.js';
export interface BrowserArguments {
    autoConnect: boolean;
    browserUrl?: string;
    wsEndpoint?: string;
    wsHeaders?: Record<string, string>;
    headless: boolean;
    executablePath?: string;
    isolated: boolean;
    userDataDir?: string;
    channel?: 'canary' | 'dev' | 'beta' | 'stable';
    proxyServer?: string;
    chromeArg?: string[];
    ignoreDefaultChromeArg?: string[];
}
export type BrowserOptions = McpOptionsFor<BrowserArguments>;
export declare const browserOptions: BrowserOptions;
export declare function getBrowserOptions(): BrowserOptions;
