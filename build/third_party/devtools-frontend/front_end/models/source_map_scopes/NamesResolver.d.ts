import * as SDK from '../../core/sdk/sdk.js';
import * as TextUtils from '../../core/text_utils/text_utils.js';
import * as Protocol from '../../generated/protocol.js';
import type * as Bindings from '../bindings/bindings.js';
import * as Formatter from '../formatter/formatter.js';
export declare function getTextFor(contentProvider: TextUtils.ContentProvider.ContentProvider): Promise<TextUtils.Text.Text | null>;
export declare class IdentifierPositions {
    name: string;
    positions: Array<{
        lineNumber: number;
        columnNumber: number;
    }>;
    constructor(name: string, positions?: Array<{
        lineNumber: number;
        columnNumber: number;
    }>);
    addPosition(lineNumber: number, columnNumber: number): void;
}
export declare function findScopeChainForDebuggerScope(scope: SDK.DebuggerModel.ScopeChainEntry): Promise<Formatter.FormatterWorkerPool.ScopeTreeNode[]>;
export declare const scopeIdentifiers: (script: SDK.Script.Script, scope: Formatter.FormatterWorkerPool.ScopeTreeNode, ancestorScopes: Formatter.FormatterWorkerPool.ScopeTreeNode[]) => Promise<{
    freeVariables: IdentifierPositions[];
    boundVariables: IdentifierPositions[];
} | null>;
export declare const resolveScopeChain: (callFrame: SDK.DebuggerModel.CallFrame, debuggerWorkspaceBinding: Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding) => Promise<SDK.DebuggerModel.ScopeChainEntry[]>;
/**
 * @returns An array of scopes (from inner-most to outer-most) with their original name -> compiled name or binding expression mappings.
 */
export declare const allVariablesInCallFrame: (callFrame: SDK.DebuggerModel.CallFrame, debuggerWorkspaceBinding: Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding) => Promise<Formatter.FormatterWorkerPool.ScopeVariableMapping[]>;
/**
 * @returns An array of scopes (from inner-most to outer-most) with their original name -> compiled name or binding expression mappings.
 */
export declare const allVariablesAtPosition: (location: SDK.DebuggerModel.Location, debuggerWorkspaceBinding: Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding) => Promise<Formatter.FormatterWorkerPool.ScopeVariableMapping[]>;
export declare const resolveThisObject: (callFrame: SDK.DebuggerModel.CallFrame, debuggerWorkspaceBinding: Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding) => Promise<SDK.RemoteObject.RemoteObject | null>;
export declare const resolveScopeInObject: (scope: SDK.DebuggerModel.ScopeChainEntry, debuggerWorkspaceBinding: Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding) => SDK.RemoteObject.RemoteObject;
export declare class RemoteObject extends SDK.RemoteObject.RemoteObject {
    #private;
    private readonly scope;
    private readonly object;
    constructor(scope: SDK.DebuggerModel.ScopeChainEntry, debuggerWorkspaceBinding: Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding);
    customPreview(): Protocol.Runtime.CustomPreview | null;
    get objectId(): Protocol.Runtime.RemoteObjectId | undefined;
    get type(): string;
    get subtype(): string | undefined;
    get value(): typeof this.object.value;
    get description(): string | undefined;
    get hasChildren(): boolean;
    get preview(): Protocol.Runtime.ObjectPreview | undefined;
    arrayLength(): number;
    getOwnProperties(generatePreview: boolean): Promise<SDK.RemoteObject.GetPropertiesResult>;
    getAllProperties(accessorPropertiesOnly: boolean, generatePreview: boolean): Promise<SDK.RemoteObject.GetPropertiesResult>;
    setPropertyValue(argumentName: string | Protocol.Runtime.CallArgument, value: string): Promise<string | undefined>;
    deleteProperty(name: Protocol.Runtime.CallArgument): Promise<string | undefined>;
    callFunction<T, U>(functionDeclaration: (this: U, ...args: any[]) => T, args?: Protocol.Runtime.CallArgument[]): Promise<SDK.RemoteObject.CallFunctionResult>;
    callFunctionJSON<T, U>(functionDeclaration: (this: U, ...args: any[]) => T, args?: Protocol.Runtime.CallArgument[]): Promise<T | null>;
    release(): void;
    debuggerModel(): SDK.DebuggerModel.DebuggerModel;
    runtimeModel(): SDK.RuntimeModel.RuntimeModel;
    isNode(): boolean;
}
export declare function resolveProfileFrameFunctionName({ scriptId, lineNumber, columnNumber }: Partial<Protocol.Runtime.CallFrame>, target: SDK.Target.Target | null, debuggerWorkspaceBinding: Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding): Promise<string | null>;
export declare const getScopeResolvedForTest: () => (...arg0: unknown[]) => void;
export declare const setScopeResolvedForTest: (scope: (...arg0: unknown[]) => void) => void;
