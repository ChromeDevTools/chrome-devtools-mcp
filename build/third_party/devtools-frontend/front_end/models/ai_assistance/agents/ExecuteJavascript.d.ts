import * as Root from '../../../core/root/root.js';
import * as SDK from '../../../core/sdk/sdk.js';
import type * as Protocol from '../../../generated/protocol.js';
import type { ChangeManager } from '../ChangeManager.js';
import type { DataHandlerResult } from '../tools/Tool.js';
import type { AgentOptions as BaseAgentOptions, FunctionHandlerOptions } from './AiAgent.js';
export type CreateExtensionScopeFunction = (changes: ChangeManager) => {
    install(): Promise<void>;
    uninstall(): Promise<void>;
};
export interface ExecuteJsAgentOptions extends BaseAgentOptions {
    changeManager?: ChangeManager;
    createExtensionScope?: CreateExtensionScopeFunction;
    execJs?: typeof executeJsCode;
}
/**
 * Creates or retrieves the DevTools AI Assistance isolated world for the given frame.
 *
 * Page.createIsolatedWorld is idempotent per frame when given a fixed worldName.
 * If an isolated world with FREESTYLER_WORLD_NAME already exists on the frame,
 * CDP returns its existing executionContextId rather than re-creating the world.
 */
export declare function getOrCreateIsolatedWorld(target: SDK.Target.Target, frameId: Protocol.Page.FrameId): Promise<SDK.RuntimeModel.ExecutionContext>;
export declare function executeJsCode(functionDeclaration: string, options: {
    contextNode: SDK.DOMModel.DOMNode | null;
    throwOnSideEffect?: boolean;
}): Promise<string>;
export interface JavascriptExecutorOptions {
    readonly executionMode: Root.Runtime.HostConfigFreestylerExecutionMode;
    readonly getContextNode: () => SDK.DOMModel.DOMNode | null;
    readonly createExtensionScope: (changes: ChangeManager) => {
        install(): Promise<void>;
        uninstall(): Promise<void>;
    };
    readonly changes: ChangeManager;
}
export declare class JavascriptExecutor {
    #private;
    constructor(options: JavascriptExecutorOptions, execJs?: typeof executeJsCode);
    executeAction(action: string, options?: FunctionHandlerOptions): Promise<DataHandlerResult<unknown>>;
    generateObservation(action: string, { throwOnSideEffect, }: {
        throwOnSideEffect: boolean;
    }): Promise<{
        observation: string;
        sideEffect: boolean;
        canceled: boolean;
    }>;
}
