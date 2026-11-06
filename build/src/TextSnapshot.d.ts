/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { McpPage } from './McpPage.js';
import type { ElementHandle } from './third_party/index.js';
import type { DevToolsData } from './tools/ToolDefinition.js';
import type { TextSnapshotNode } from './types.js';
export declare class TextSnapshot {
    #private;
    static nextSnapshotId: number;
    static resetCounter(): void;
    root: TextSnapshotNode;
    idToNode: Map<string, TextSnapshotNode>;
    snapshotId: string;
    selectedElementUid?: string;
    hasSelectedElement: boolean;
    verbose: boolean;
    constructor(data: {
        root: TextSnapshotNode;
        idToNode: Map<string, TextSnapshotNode>;
        snapshotId: string;
        hasSelectedElement: boolean;
        verbose: boolean;
        selectedElementUid?: string;
    });
    static create(page: McpPage, options?: {
        verbose?: boolean;
        devtoolsData?: DevToolsData;
        extraHandles?: ElementHandle[];
    }): Promise<TextSnapshot>;
    resolveCdpElementId(cdpBackendNodeId: number): string | undefined;
}
