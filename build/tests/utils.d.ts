/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import './setupDevTools.js';
import { type ChildProcess } from 'node:child_process';
import type { TestContext } from 'node:test';
import type { Browser } from 'puppeteer';
import { Locator } from 'puppeteer';
import type { Frame, HTTPRequest, HTTPResponse, Page, Target } from 'puppeteer-core';
import sinon from 'sinon';
import type { ParsedArguments } from '../src/config/mcp-options.js';
import { McpContext, type McpContextOptions } from '../src/McpContext.js';
import { McpResponse } from '../src/McpResponse.js';
import { TaskRunner } from '../src/utils/TaskRunner.js';
import { DevTools, type CallToolResult } from '../src/third_party/index.js';
export declare function assertNoServiceWorkerReported(targets: Target[], id: string): void;
export declare function getTextContent(content: CallToolResult['content'][number]): string;
export declare function getImageContent(content: CallToolResult['content'][number]): {
    data: string;
    mimeType: string;
};
export declare function extractExtensionId(response: McpResponse): string;
export declare function withBrowser(cb: (browser: Browser, page: Page) => Promise<void>, options?: {
    debug?: boolean;
    autoOpenDevTools?: boolean;
    executablePath?: string;
    args?: string[];
    blockedUrlPattern?: string[];
    allowedUrlPattern?: string[];
}): Promise<void>;
/**
 * Creates an McpContext that is already connected to `browser`.
 */
export declare function createConnectedMcpContext(browser: Browser, options: Omit<McpContextOptions, 'getBrowser' | 'taskRunner'> & {
    taskRunner?: TaskRunner;
}, locatorClass?: typeof Locator): Promise<McpContext>;
export declare function withMcpContext(cb: (response: McpResponse, context: McpContext, args: ParsedArguments) => Promise<void>, options?: {
    debug?: boolean;
    autoOpenDevTools?: boolean;
    performanceCrux?: boolean;
    sourceMaps?: boolean;
    executablePath?: string;
    args?: string[];
    blockedUrlPattern?: string[];
    allowedUrlPattern?: string[];
    allowUnrestrictedPaths?: boolean;
    navigationTimeout?: number;
}, args?: Partial<ParsedArguments>): Promise<void>;
export declare function getMockRequest(options?: {
    url?: string;
    method?: string;
    response?: HTTPResponse;
    failure?: HTTPRequest['failure'];
    resourceType?: string;
    hasPostData?: boolean;
    postData?: string;
    fetchPostData?: Promise<string>;
    stableId?: number;
    navigationRequest?: boolean;
    frame?: Frame;
    redirectChain?: HTTPRequest[];
    headers?: Record<string, string>;
}): HTTPRequest;
export declare function getMockResponse(options?: {
    status?: number;
    headers?: Record<string, string>;
}): HTTPResponse;
export declare function html(strings: TemplateStringsArray, ...values: unknown[]): string;
export declare function stabilizeStructuredContent(content: unknown): string;
export declare function stabilizeResponseOutput(text: unknown): string;
export declare function getMockAggregatedIssue(): sinon.SinonStubbedInstance<DevTools.AggregatedIssue>;
export declare function getMockBrowser(options?: {
    process?: ChildProcess | null;
    wsEndpoint?: string;
}): Browser;
export declare const CLI_PATH: string;
export declare function runCli(args: string[], sessionId?: string, options?: {
    cwd?: string;
}): Promise<{
    status: number | null;
    stdout: string;
    stderr: string;
}>;
export declare function assertDaemonIsNotRunning(sessionId?: string): Promise<void>;
/**
 * Stops the daemon in-process. Use it for test cleanup: it does not spawn
 * a CLI process, which takes about a second per call.
 */
export declare function stopDaemonForCleanup(sessionId: string): Promise<void>;
/**
 * Creates a new CLI session ID for one test and stops its daemon after the
 * test. Each test gets its own session, so tests can run concurrently.
 */
export declare function createCliSession(t: TestContext): string;
export declare function assertDaemonIsRunning(sessionId?: string): Promise<void>;
export declare function waitExecutionFor(func: () => Promise<void>, timeout: number): Promise<void>;
export declare function createTempDir(prefix?: string, baseDir?: string): {
    path: string;
    [Symbol.dispose]: () => void;
};
export declare function createTempFile(content: string, fileName: string, baseDir?: string): {
    path: string;
    [Symbol.dispose]: () => void;
};
