/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ReadonlyServerConfig } from './config/ServerConfig.js';
import type { McpContext } from './McpContext.js';
import { zod, type CallToolResult } from './third_party/index.js';
import { type AnyToolDefinition } from './tools/ToolDefinition.js';
/**
 * Upper bound on how long a tool call may wait to acquire the browser
 * (connect/launch and McpContext initialization). A connect attempt on a
 * half-open socket can hang without ever failing; this bound turns that into
 * a clear error and abandons the attempt so the next call starts fresh.
 *
 * This does not bound the tool's own work. A slow but valid call (a long
 * `wait_for` timeout, an `evaluate_script` awaiting a slow promise, a
 * Lighthouse audit) must finish on its own terms without the browser being
 * closed underneath it. A transport that dies mid-call is detected by the
 * WebSocket keep-alive configured in BrowserManager#connect(), which rejects
 * the in-flight CDP calls and fires `disconnected`.
 */
export declare const TOOL_CALL_TIMEOUT_MS = 60000;
export declare class ToolHandler {
    #private;
    private readonly getContext;
    private readonly abandonPendingBrowserAttemptOnTimeout;
    constructor(tool: AnyToolDefinition, config: ReadonlyServerConfig, getContext: () => Promise<McpContext>, abandonPendingBrowserAttemptOnTimeout: () => void);
    get registeredInputSchema(): zod.ZodObject<zod.ZodRawShape, zod.core.$strict>;
    /**
     * Whether the tool is hidden from the client.
     */
    get disabled(): boolean;
    /**
     * Replaces the tool definition and re-evaluates its status against the
     * current server config. Callers must pause the task runner, so calls that
     * are already waiting run with the new state. Returns true if the tool
     * listing visible to the client changed.
     */
    update(tool: AnyToolDefinition): boolean;
    handle: (rawArgs?: Record<string, unknown>, options?: {
        viaMcp?: boolean;
    }) => Promise<CallToolResult>;
}
