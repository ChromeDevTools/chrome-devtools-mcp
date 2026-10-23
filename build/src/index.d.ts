/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type fs from 'node:fs';
import { BrowserManager } from './BrowserManager.js';
import { type ParsedArguments } from './config/mcp-options.js';
import { ServerConfig } from './config/ServerConfig.js';
import { type CallToolResult, McpServer as SdkMcpServer, type Transport } from './third_party/index.js';
export interface McpServerOptions {
    browserManager: BrowserManager;
    logFile?: fs.WriteStream;
}
export declare class McpServer {
    #private;
    readonly server: SdkMcpServer;
    private constructor();
    connect(transport: Transport): Promise<void>;
    callTool(name: string, args?: Record<string, unknown>): Promise<CallToolResult>;
    /**
     * Applies a new config to the running server. Only reloadable options are
     * applied, all other options keep the value the server was started with.
     * Tools are updated in place and only tools whose listing changed notify
     * the client, which results in at most one `tools/list_changed`
     * notification.
     */
    applyConfig(config: ServerConfig): Promise<void>;
    /**
     * Watches the config file and applies its changes to the running server.
     */
    watchConfig(): void;
    /**
     * Closes the MCP connection and disposes internal context/listeners.
     */
    close(): Promise<void>;
    [Symbol.dispose](): void;
    [Symbol.asyncDispose](): Promise<void>;
    static from(config: ServerConfig, options: McpServerOptions): Promise<McpServer>;
}
/**
 * Creates and initializes a Chrome DevTools MCP server instance.
 *
 * Maintained as a public API for backwards compatibility because external
 * consumers and integrations rely on `createMcpServer()`. For new code,
 * prefer using `McpServer.from(config, options)`.
 */
export declare function createMcpServer(serverArgs: ParsedArguments, options: {
    logFile?: fs.WriteStream;
}): Promise<{
    server: SdkMcpServer;
}>;
