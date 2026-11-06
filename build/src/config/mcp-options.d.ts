/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { YargsOptions } from '../third_party/index.js';
import { type CategoryArguments, type McpOption, type McpOptionsFor } from './category-options.js';
import { type BrowserArguments } from './browser-options.js';
import { type PuppeteerArguments } from './puppeteer-options.js';
import { type ToolArguments } from './tool-options.js';
export interface McpArguments extends CategoryArguments, BrowserArguments, PuppeteerArguments, ToolArguments {
    logFile?: string;
    pageIdRouting: boolean;
    devtoolsComments: boolean;
    experimentalDevtools: boolean;
    experimentalVision: boolean;
    memoryDebugging: boolean;
    experimentalStructuredContent: boolean;
    experimentalToonFormat: boolean;
    experimentalDataFormat?: 'default' | 'toon' | 'gcf';
    experimentalIncludeAllPages: boolean;
    experimentalInteropTools: boolean;
    experimentalScreencast: boolean;
    experimentalFfmpegPath?: string;
    screencastFps?: number;
    performanceCrux: boolean;
    usageStatistics: boolean;
    javascriptEvaluation: boolean;
    fileNavigations: boolean;
    sourceMaps: boolean;
    maxNavigationSaved: number;
    clearcutEndpoint?: string;
    clearcutForceFlushIntervalMs?: number;
    clearcutIncludePidHeader: boolean;
    slim: boolean;
    viaCli: boolean;
    redactNetworkHeaders: boolean;
    allowUnrestrictedPaths: boolean;
    filesystemRoot?: string[];
    config?: string;
    watchConfig: boolean;
}
export type ParsedArguments = {
    [K in keyof McpArguments]: McpArguments[K];
};
export type McpOptions = McpOptionsFor<ParsedArguments, McpOption>;
export declare const DEFAULT_FILESYSTEM_ROOT: string[];
export declare const MAX_NAVIGATION_SAVED_LIMIT = 25;
export declare const mcpOptions: McpOptions;
export declare const mcpOptionsForViaCli: McpOptions;
export declare function getCliOptions(): Partial<Record<keyof McpOptions, YargsOptions>>;
export declare const CLI_EXAMPLES: Array<[string, string]>;
export declare const CONFLICTING_ARGS: Array<Array<keyof McpOptions>>;
export declare const IMPLICATIONS: Array<[keyof McpOptions, keyof McpOptions]>;
export declare function withoutDefaults(options: Record<string, YargsOptions>): Record<string, YargsOptions>;
export declare function stripYargsPositionalArgs<T extends {
    _?: unknown;
    $0?: unknown;
}>(parsed: T): {
    [K in keyof T as string extends K ? never : K extends '_' | '$0' ? never : K]: T[K];
};
export declare function isReloadableOption(name: keyof McpOptions): boolean;
