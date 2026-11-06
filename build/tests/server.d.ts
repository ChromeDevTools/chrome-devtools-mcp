/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { type IncomingMessage, type ServerResponse } from 'node:http';
export declare class TestServer {
    #private;
    static randomPort(): number;
    constructor(port: number);
    get baseUrl(): string;
    getRoute(path: string): string;
    addHtmlRoute(path: string, htmlContent: string): void;
    addRoute(path: string, handler: (req: IncomingMessage, res: ServerResponse) => void): void;
    reset(): void;
    start(): Promise<void>;
    stop(): Promise<void>;
}
export declare function serverHooks(): TestServer;
