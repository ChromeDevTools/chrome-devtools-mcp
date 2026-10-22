/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { type JSONSchema7 } from '../third_party/index.js';
import { type PageToolFactory } from './ToolDefinition.js';
export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: JSONSchema7;
}
export interface ToolGroup<T extends ToolDefinition> {
    name: string;
    description: string;
    tools: T[];
}
export type ToolGroups = Array<ToolGroup<ToolDefinition>>;
declare global {
    interface Window {
        __dtmcp?: {
            toolGroups?: Array<ToolGroup<ToolDefinition & {
                execute: (args: Record<string, unknown>) => unknown;
            }>>;
            stashedElements?: Element[];
            executeTool?: (toolName: string, args: Record<string, unknown>) => unknown;
        };
    }
}
export declare const listThirdPartyDeveloperTools: PageToolFactory;
export declare const executeThirdPartyDeveloperTool: PageToolFactory;
