import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import type * as Protocol from '../../generated/protocol.js';
import type * as Platform from '../platform/platform.js';
import { DebuggerModel } from './DebuggerModel.js';
import { HeapProfilerModel } from './HeapProfilerModel.js';
import { RemoteObject, RemoteObjectProperty, type ScopeRef } from './RemoteObject.js';
import { SDKModel } from './SDKModel.js';
import { type Target } from './Target.js';
export declare class RuntimeModel extends SDKModel<EventTypes> {
    #private;
    readonly agent: ProtocolProxyApi.RuntimeApi;
    constructor(target: Target);
    dispose(): void;
    static isSideEffectFailure(response: Protocol.Runtime.EvaluateResponse | EvaluationResult): boolean;
    debuggerModel(): DebuggerModel;
    heapProfilerModel(): HeapProfilerModel;
    executionContexts(): ExecutionContext[];
    setExecutionContextComparator(comparator: (arg0: ExecutionContext, arg1: ExecutionContext) => number): void;
    /**
     * comparator
     */
    executionContextComparator(): (arg0: ExecutionContext, arg1: ExecutionContext) => number;
    defaultExecutionContext(): ExecutionContext | null;
    executionContext(id: number): ExecutionContext | null;
    executionContextCreated(context: Protocol.Runtime.ExecutionContextDescription): void;
    executionContextDestroyed(executionContextId: number): void;
    fireExecutionContextOrderChanged(): void;
    executionContextsCleared(): void;
    createRemoteObject(payload: Protocol.Runtime.RemoteObject): RemoteObject;
    createScopeRemoteObject(payload: Protocol.Runtime.RemoteObject, scopeRef: ScopeRef): RemoteObject;
    createRemoteObjectFromPrimitiveValue(value: string | number | bigint | boolean | undefined): RemoteObject;
    createRemotePropertyFromPrimitiveValue(name: string, value: string | number | boolean): RemoteObjectProperty;
    discardConsoleEntries(): void;
    releaseObjectGroup(objectGroup: string): void;
    releaseEvaluationResult(result: EvaluationResult): void;
    runIfWaitingForDebugger(): void;
    private customFormattersStateChanged;
    compileScript(expression: string, sourceURL: string, persistScript: boolean, executionContextId: Protocol.Runtime.ExecutionContextId): Promise<CompileScriptResult | null>;
    runScript(scriptId: Protocol.Runtime.ScriptId, executionContextId: Protocol.Runtime.ExecutionContextId, objectGroup?: string, silent?: boolean, includeCommandLineAPI?: boolean, returnByValue?: boolean, generatePreview?: boolean, awaitPromise?: boolean): Promise<EvaluationResult>;
    queryObjects(prototype: RemoteObject): Promise<QueryObjectResult>;
    isolateId(): Promise<string>;
    heapUsage(): Promise<{
        usedSize: number;
        totalSize: number;
        embedderHeapUsedSize?: number;
        backingStorageSize?: number;
    } | null>;
    inspectRequested(payload: Protocol.Runtime.RemoteObject, hints: unknown, executionContextId?: number): void;
    addBinding(event: Protocol.Runtime.AddBindingRequest): Promise<Protocol.ProtocolResponseWithError>;
    removeBinding(request: Protocol.Runtime.RemoveBindingRequest): Promise<Protocol.ProtocolResponseWithError>;
    bindingCalled(event: Protocol.Runtime.BindingCalledEvent): void;
    private copyRequested;
    private queryObjectsRequested;
    static simpleTextFromException(exceptionDetails: Protocol.Runtime.ExceptionDetails): string;
    exceptionThrown(timestamp: number, exceptionDetails: Protocol.Runtime.ExceptionDetails): void;
    exceptionRevoked(exceptionId: number): void;
    consoleAPICalled(type: Protocol.Runtime.ConsoleAPICalledEventType, args: Protocol.Runtime.RemoteObject[], executionContextId: number, timestamp: number, stackTrace?: Protocol.Runtime.StackTrace, context?: string): void;
    executionContextIdForScriptId(scriptId: string): number;
    executionContextForStackTrace(stackTrace: Protocol.Runtime.StackTrace): number;
    terminateExecution(): Promise<Protocol.ProtocolResponseWithError>;
    getExceptionDetails(errorObjectId: Protocol.Runtime.RemoteObjectId): Promise<Protocol.Runtime.ExceptionDetails | undefined>;
}
export declare enum Events {
    BindingCalled = "BindingCalled",
    ExecutionContextCreated = "ExecutionContextCreated",
    ExecutionContextDestroyed = "ExecutionContextDestroyed",
    ExecutionContextChanged = "ExecutionContextChanged",
    ExecutionContextOrderChanged = "ExecutionContextOrderChanged",
    ExceptionThrown = "ExceptionThrown",
    ExceptionRevoked = "ExceptionRevoked",
    ConsoleAPICalled = "ConsoleAPICalled",
    QueryObjectRequested = "QueryObjectRequested"
}
export interface ConsoleAPICall {
    type: Protocol.Runtime.ConsoleAPICalledEventType;
    args: Protocol.Runtime.RemoteObject[];
    executionContextId: number;
    timestamp: number;
    stackTrace?: Protocol.Runtime.StackTrace;
    context?: string;
}
export interface ExceptionWithTimestamp {
    timestamp: number;
    details: Protocol.Runtime.ExceptionDetails;
}
export interface QueryObjectRequestedEvent {
    objects: RemoteObject;
    executionContextId?: number;
}
export interface EventTypes {
    [Events.BindingCalled]: Protocol.Runtime.BindingCalledEvent;
    [Events.ExecutionContextCreated]: ExecutionContext;
    [Events.ExecutionContextDestroyed]: ExecutionContext;
    [Events.ExecutionContextChanged]: ExecutionContext;
    [Events.ExecutionContextOrderChanged]: RuntimeModel;
    [Events.ExceptionThrown]: ExceptionWithTimestamp;
    [Events.ExceptionRevoked]: number;
    [Events.ConsoleAPICalled]: ConsoleAPICall;
    [Events.QueryObjectRequested]: QueryObjectRequestedEvent;
}
export declare class ExecutionContext {
    #private;
    id: Protocol.Runtime.ExecutionContextId;
    uniqueId: string;
    name: string;
    origin: Platform.DevToolsPath.UrlString;
    isDefault: boolean;
    runtimeModel: RuntimeModel;
    debuggerModel: DebuggerModel;
    frameId: Protocol.Page.FrameId | undefined;
    constructor(runtimeModel: RuntimeModel, id: Protocol.Runtime.ExecutionContextId, uniqueId: string, name: string, origin: Platform.DevToolsPath.UrlString, isDefault: boolean, frameId?: Protocol.Page.FrameId);
    target(): Target;
    static comparator(a: ExecutionContext, b: ExecutionContext): number;
    evaluateWithSelectedFrameFallback(options: EvaluationOptions, userGesture: boolean, awaitPromise: boolean): Promise<EvaluationResult>;
    globalObject(objectGroup: string, generatePreview: boolean): Promise<EvaluationResult>;
    callFunctionOn(options: CallFunctionOptions): Promise<EvaluationResult>;
    evaluate(options: EvaluationOptions, userGesture: boolean, awaitPromise: boolean): Promise<EvaluationResult>;
    globalLexicalScopeNames(): Promise<string[] | null>;
    label(): string | null;
    setLabel(label: string): void;
}
export type EvaluationResult = {
    object: RemoteObject;
    exceptionDetails?: Protocol.Runtime.ExceptionDetails;
} | {
    error: string;
};
export interface CompileScriptResult {
    scriptId?: string;
    exceptionDetails?: Protocol.Runtime.ExceptionDetails;
}
export interface EvaluationOptions {
    expression: string;
    objectGroup?: string;
    includeCommandLineAPI?: boolean;
    silent?: boolean;
    returnByValue?: boolean;
    generatePreview?: boolean;
    throwOnSideEffect?: boolean;
    timeout?: number;
    disableBreaks?: boolean;
    replMode?: boolean;
    allowUnsafeEvalBlockedByCSP?: boolean;
    contextId?: number;
    /**
     * Index into `CallFrame.scopeChain()` denoting the scope in which the expression is evaluated.
     * Defaults to 0, i.e. the inner-most scope. Only honored by `CallFrame.evaluate`.
     */
    scopeNumber?: number;
}
export interface CallFunctionOptions {
    functionDeclaration: string;
    returnByValue?: boolean;
    throwOnSideEffect?: boolean;
    allowUnsafeEvalBlockedByCSP?: boolean;
    arguments: Protocol.Runtime.CallArgument[];
    userGesture: boolean;
    awaitPromise: boolean;
}
export type QueryObjectResult = {
    objects: RemoteObject;
} | {
    error: string;
};
