import * as Protocol from '../../generated/protocol.js';
import * as Common from '../common/common.js';
import * as Platform from '../platform/platform.js';
import { FrontendMessageType } from './ConsoleModelTypes.js';
import { RemoteObject } from './RemoteObject.js';
import { type ExecutionContext, RuntimeModel } from './RuntimeModel.js';
import { SDKModel } from './SDKModel.js';
import { type Target } from './Target.js';
import type { TargetManager } from './TargetManager.js';
export { FrontendMessageType } from './ConsoleModelTypes.js';
export declare class ConsoleModel extends SDKModel<EventTypes> {
    #private;
    constructor(target: Target);
    private initTarget;
    targetRemoved(target: Target): void;
    evaluateCommandInConsole(executionContext: ExecutionContext, originatingMessage: ConsoleMessage, expression: string, useCommandLineAPI: boolean): Promise<void>;
    addCommandMessage(executionContext: ExecutionContext, text: string): ConsoleMessage;
    addMessage(msg: ConsoleMessage): void;
    private exceptionThrown;
    private exceptionRevoked;
    private consoleAPICalled;
    private queryObjectRequested;
    private clearIfNecessary;
    private primaryPageChanged;
    private consoleProfileStarted;
    private consoleProfileFinished;
    private addConsoleProfileMessage;
    private incrementErrorWarningCount;
    messages(): ConsoleMessage[];
    static allMessagesUnordered(targetManager: TargetManager): ConsoleMessage[];
    static requestClearMessages(targetManager: TargetManager): void;
    private clear;
    errors(): number;
    static allErrors(targetManager: TargetManager): number;
    warnings(): number;
    static allWarnings(targetManager: TargetManager): number;
    violations(): number;
    saveToTempVariable(currentExecutionContext: ExecutionContext | null, remoteObject: RemoteObject | null): Promise<void>;
}
export declare enum Events {
    ConsoleCleared = "ConsoleCleared",
    MessageAdded = "MessageAdded",
    MessageUpdated = "MessageUpdated",
    CommandEvaluated = "CommandEvaluated"
}
export interface CommandEvaluatedEvent {
    result: RemoteObject;
    commandMessage: ConsoleMessage;
    exceptionDetails?: Protocol.Runtime.ExceptionDetails | undefined;
}
export interface EventTypes {
    [Events.ConsoleCleared]: void;
    [Events.MessageAdded]: ConsoleMessage;
    [Events.MessageUpdated]: ConsoleMessage;
    [Events.CommandEvaluated]: CommandEvaluatedEvent;
}
export interface AffectedResources {
    requestId?: Protocol.Network.RequestId;
    issueId?: Protocol.Audits.IssueId;
}
export interface ConsoleMessageDetails {
    type?: MessageType;
    url?: Platform.DevToolsPath.UrlString;
    line?: number;
    column?: number;
    parameters?: Array<string | RemoteObject | Protocol.Runtime.RemoteObject>;
    stackTrace?: Protocol.Runtime.StackTrace;
    timestamp?: number;
    executionContextId?: number;
    scriptId?: Protocol.Runtime.ScriptId;
    workerId?: string;
    context?: string;
    affectedResources?: AffectedResources;
    category?: Protocol.Log.LogEntryCategory;
    exceptionDetails?: Protocol.Runtime.ExceptionDetails;
}
export declare class ConsoleMessage {
    #private;
    source: MessageSource;
    level: Protocol.Log.LogEntryLevel | null;
    messageText: string;
    readonly type: MessageType;
    url: Platform.DevToolsPath.UrlString | undefined;
    line: number;
    column: number;
    parameters: Array<string | RemoteObject | Protocol.Runtime.RemoteObject> | undefined;
    stackTrace: Protocol.Runtime.StackTrace | undefined;
    timestamp: number;
    scriptId?: Protocol.Runtime.ScriptId;
    workerId?: string;
    context?: string;
    category?: Protocol.Log.LogEntryCategory;
    readonly exceptionDetails?: Protocol.Runtime.ExceptionDetails;
    /**
     * The parent frame of the `console.log` call of logpoints or conditional breakpoints
     * if they called `console.*` explicitly. The parent frame is where V8 paused
     * and consequently where the logpoint is set.
     *
     * Is `null` for page console.logs, commands, command results, etc.
     */
    readonly stackFrameWithBreakpoint: Protocol.Runtime.CallFrame | null;
    constructor(runtimeModel: RuntimeModel | null, source: MessageSource, level: Protocol.Log.LogEntryLevel | null, messageText: string, details?: ConsoleMessageDetails);
    getAffectedResources(): AffectedResources | undefined;
    setPageLoadSequenceNumber(pageLoadSequenceNumber: number): void;
    static fromException(runtimeModel: RuntimeModel, exceptionDetails: Protocol.Runtime.ExceptionDetails, messageType?: Protocol.Runtime.ConsoleAPICalledEventType | FrontendMessageType, timestamp?: number, forceUrl?: Platform.DevToolsPath.UrlString, affectedResources?: AffectedResources): ConsoleMessage;
    runtimeModel(): RuntimeModel | null;
    target(): Target | null;
    setOriginatingMessage(originatingMessage: ConsoleMessage): void;
    originatingMessage(): ConsoleMessage | null;
    setExecutionContextId(executionContextId: number): void;
    getExecutionContextId(): number;
    getExceptionId(): number | undefined;
    setExceptionId(exceptionId: number): void;
    isGroupMessage(): boolean;
    isGroupStartMessage(): boolean;
    isErrorOrWarning(): boolean;
    isGroupable(): boolean;
    groupCategoryKey(): string;
    isEqual(msg: ConsoleMessage | null): boolean;
    get originatesFromLogpoint(): boolean;
    /** @returns true, iff this was a console.* call in a conditional breakpoint */
    get originatesFromConditionalBreakpoint(): boolean;
}
export type MessageSource = Protocol.Log.LogEntrySource | Common.Console.FrontendMessageSource;
export type MessageLevel = Protocol.Log.LogEntryLevel;
export type MessageType = Protocol.Runtime.ConsoleAPICalledEventType | FrontendMessageType;
export declare const MessageSourceDisplayName: Map<MessageSource, string>;
