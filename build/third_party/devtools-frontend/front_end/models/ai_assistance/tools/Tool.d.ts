import type * as Host from '../../../core/host/host.js';
import type * as SDK from '../../../core/sdk/sdk.js';
import type * as LHModel from '../../lighthouse/lighthouse.js';
import type * as Trace from '../../trace/trace.js';
import type { AiWidget, ConversationContext, FunctionHandlerOptions } from '../agents/AiAgent.js';
import type { executeJsCode } from '../agents/ExecuteJavascript.js';
import type { ChangeManager } from '../ChangeManager.js';
import type { PerformanceTraceContext } from '../contexts/PerformanceTraceContext.js';
/**
 * Result indicating an error occurred during tool execution.
 */
export interface ToolErrorResult {
    error: string;
}
/**
 * Result indicating user approval is required before running the tool.
 */
export interface ToolApprovalResult {
    requiresApproval: true;
    description: string | null;
}
/**
 * Result produced by a DataTool (`DataTool`). Contains a structured data payload (`result`)
 * returned to answer the AI query without altering the conversation's active focus target.
 * May optionally include UI widgets to render in the panel.
 */
export interface ToolDataResult<DataType> {
    result: DataType;
    widgets?: AiWidget[];
    /**
     * Skills newly activated by this tool execution. Used to emit UI telemetry.
     */
    loadedSkills?: string[];
}
/**
 * Result produced by a ContextTool (`ContextTool`). Switches or introduces a new active focal entity
 * (`context`) into the conversation session (e.g., attaching a performance trace or selecting a DOM node)
 * along with a human-readable `description` explaining the context switch and optional UI widgets.
 */
export interface ToolContextResult<ContextType = unknown> {
    context: ConversationContext<ContextType>;
    description: string;
    widgets?: AiWidget[];
}
/**
 * Union for tools that produce data output (`DataTool`).
 */
export type DataHandlerResult<DataType> = ToolDataResult<DataType> | ToolApprovalResult | ToolErrorResult;
/**
 * Union for tools that switch or return conversation context (`ContextTool`).
 */
export type ContextHandlerResult<ContextType = unknown> = ToolContextResult<ContextType> | ToolApprovalResult | ToolErrorResult;
/**
 * Base capability interface for all tool contexts.
 * This interface is intentionally empty: tools must explicitly declare any
 * capabilities they require (e.g. `TargetCapability`, `PerformanceTraceCapability`)
 * rather than relying on implicitly provided context.
 */
export interface BaseToolCapability {
}
/**
 * Capability for tools that need to execute JavaScript code on the inspected page.
 */
export interface PageExecutionCapability {
    /**
     * Function to execute JavaScript code in the page context.
     */
    execJs: typeof executeJsCode;
    /**
     * Returns the DOM node that acts as the execution context (i.e. `$0` inside the execution context)
     * for running JavaScript.
     */
    getExecutionContextNode(): SDK.DOMModel.DOMNode | null;
}
/**
 * Capability for tools that need to manage and apply style mutations to the page.
 */
export interface StyleMutationCapability {
    /**
     * The change manager for tracking and applying style changes.
     */
    changeManager: ChangeManager;
    /**
     * Creates an extension scope for applying changes, ensuring they can be uninstalled when done.
     */
    createExtensionScope(changes: ChangeManager): {
        install(): Promise<void>;
        uninstall(): Promise<void>;
    };
}
/**
 * Capability for tools that need access to the current SDK Target of the inspected page.
 */
export interface TargetCapability {
    /**
     * Returns the primary SDK Target for the inspected page.
     *
     * WARNING: This method does not perform a security origin check. When a conversation
     * is locked to an iframe or subframe origin, this still returns the primary page target
     * so tools can resolve DOM nodes and frame hierarchies across frames.
     *
     * Tools that consume this target must independently validate the security origin of
     * any resolved entities (e.g. via `node.securityOrigin()`) against `getOriginLock()`.
     */
    getTarget(): SDK.Target.Target | null;
}
/**
 * Origin-locking state for AI Assistance:
 * - `ESTABLISHED_ORIGIN`: The conversation is bound to a specific origin. Operations are
 *   limited to this origin.
 * - `BLOCKED_BY_NAVIGATION`: An unapproved cross-origin navigation occurred during the
 *   active run. Origin-restricted operations are blocked and must return an error.
 * - `UNINITIALIZED`: No origin lock has been established yet. Operations requiring a locked
 *   origin must return an error.
 */
export type OriginLockState = {
    status: 'ESTABLISHED_ORIGIN';
    origin: SDK.SecurityOrigin.SecurityOrigin;
} | {
    status: 'BLOCKED_BY_NAVIGATION';
} | {
    status: 'UNINITIALIZED';
};
/**
 * Capability for tools that enforce conversation origin boundaries.
 */
export interface OriginLockCapability {
    /**
     * Returns the current origin-locking state for the active conversation.
     */
    getOriginLock(): OriginLockState;
}
/**
 * Checks whether a target origin matches the established conversation origin lock.
 * Returns `false` if the lock is not established, either origin is opaque, or the
 * target origin does not match the established origin.
 */
export declare function isOriginAllowedByLock(originLock: OriginLockState, targetOrigin: SDK.SecurityOrigin.SecurityOrigin | null | undefined): boolean;
/**
 * Resolves the conversation's established origin from the origin lock state.
 * Returns an error object if origin access is blocked by navigation, the lock
 * is uninitialized, or the established origin is opaque.
 */
export declare function resolveOriginFromLock(originLock: OriginLockState): {
    origin: SDK.SecurityOrigin.SecurityOrigin;
} | {
    error: string;
};
/**
 * Capability for tools that need to inspect an active Lighthouse report from context.
 */
export interface LighthouseReportCapability {
    getLighthouseReport(): LHModel.ReporterTypes.ReportJSON | null;
}
/**
 * Capability for tools that trigger new Lighthouse audit runs.
 */
export interface LighthouseRecordingCapability {
    runLighthouse(overrides?: LHModel.RunTypes.RunOverrides): Promise<LHModel.RunTypes.RunResult>;
}
/**
 * Capability for tools that need access to the active performance trace context.
 */
export interface PerformanceTraceCapability {
    getPerformanceTraceContext(): PerformanceTraceContext | null;
}
/**
 * Capability for tools that need to record performance traces.
 */
export interface PerformanceRecordingCapability {
    performanceRecordAndReload?: () => Promise<Trace.TraceModel.ParsedTrace>;
}
/**
 * Unified context interface providing all capabilities available in the project.
 * Used by the agent to pass a complete context to any tool type-safely.
 */
export type AllToolsCapabilities = BaseToolCapability & PageExecutionCapability & StyleMutationCapability & TargetCapability & OriginLockCapability & LighthouseReportCapability & LighthouseRecordingCapability & PerformanceRecordingCapability & PerformanceTraceCapability & ServerLoggingCapability;
/**
 * Base argument type for AI Tools.
 */
export type ToolArgs = Record<string, unknown>;
export declare const MAX_FUNCTION_RESULT_BYTE_LENGTH: number;
export declare const enum ToolName {
    EXECUTE_JAVASCRIPT = "executeJavaScript",
    GET_STYLES = "getStyles",
    LIST_NETWORK_REQUESTS = "listNetworkRequests",
    GET_NETWORK_REQUEST_DETAILS = "getNetworkRequestDetails",
    GET_LIGHTHOUSE_AUDITS = "getLighthouseAudits",
    RESOLVE_DEVTOOLS_NODE_PATH = "resolveDevtoolsNodePath",
    GET_ELEMENT_ACCESSIBILITY_DETAILS = "getElementAccessibilityDetails",
    RECORD_PERFORMANCE_TRACE = "recordPerformanceTrace",
    LIST_PAGE_ORIGINS = "listPageOrigins",
    LIST_STORAGE_KEYS = "listStorageKeys",
    GET_STORAGE_VALUES = "getStorageValues",
    LIST_COOKIES = "listCookies",
    GET_COOKIE_VALUES = "getCookieValues",
    GET_TRACE_EVENT_BY_KEY = "getTraceEventByKey",
    SELECT_TRACE_EVENT_BY_KEY = "selectTraceEventByKey",
    LIST_SOURCES = "listSources",
    GET_SOURCE_CONTENT = "getSourceContent",
    GET_TRACE_MAIN_THREAD_SUMMARY = "getTraceMainThreadSummary",
    GET_TRACE_NETWORK_SUMMARY = "getTraceNetworkSummary",
    RUN_LIGHTHOUSE = "runLighthouse",
    GET_DETAILED_CALL_TREE = "getDetailedCallTree",
    GET_TRACE_FUNCTION_CODE = "getTraceFunctionCode",
    GET_TRACE_RESOURCE_CONTENT = "getTraceResourceContent",
    GET_INSIGHT_DETAILS = "getInsightDetails",
    GET_STORAGE_BREAKDOWN = "getStorageBreakdown"
}
/**
 * Choices the permission prompt offers when a tool asks for approval.
 *
 * The tool still decides whether a given call needs approval by returning a
 * `ToolApprovalResult`. This enum decides what the user can choose and whether
 * a stored "always allow" decision can skip the prompt.
 */
export declare const enum PermissionPrompt {
    /**
     * No permission prompt is shown. Should be used for tools which don't require
     * user permission to run.
     */
    NEVER = "never",
    /**
     * The prompt offers: Skip / Allow Once.
     * A stored "always allow" decision is ignored, so the user is asked on every call.
     */
    ALLOW_ONCE = "allow-once",
    /**
     * The prompt offers: Skip / Always Allow / Allow Once.
     * If the user previously chose "always allow" for this tool, the prompt is skipped.
     */
    ALLOW_ONCE_OR_ALWAYS = "allow-once-or-always"
}
/**
 * The user's answer to a permission prompt.
 */
export declare const enum PermissionDecision {
    /**
     * Don't call the tool.
     */
    REJECT = "reject",
    /**
     * Allow to call the tool.
     */
    ALLOW_ONCE = "allow-once",
    /**
     * Allow to call the tool, and the tool is added to the allowed tools list so
     * future calls do not prompt. Only offered for `PermissionPrompt.ALLOW_ONCE_OR_ALWAYS`.
     */
    ALLOW_ALWAYS = "allow-always"
}
/**
 * Base metadata interface for a Tool.
 * Provides parameter schema and display info formatting for tool argument types.
 *
 * @template ArgsType The expected object schema for tool arguments. Defaults to `ToolArgs`.
 */
export interface BaseTool<ArgsType extends ToolArgs = ToolArgs> {
    readonly name: ToolName;
    readonly description: string;
    /**
     * The permission prompt shown when this tool returns a `ToolApprovalResult`.
     */
    readonly permissionPrompt: PermissionPrompt;
    /**
     * Title of the permission prompt, e.g. "Allow reading cookie values?".
     * Required for tools that require user permission to run.
     */
    readonly permissionTitle?: string;
    /**
     * Short user-facing name of the tool, e.g. "Read cookie values".
     * Shown in the "Allowed tools" list in Settings.
     * Required for tools that require user permission to run.
     */
    readonly displayName?: string;
    /**
     * JSON schema representing the parameters this tool accepts.
     */
    readonly parameters: Host.AidaClient.FunctionObjectParam<keyof ArgsType>;
    /**
     * Converts the tool arguments into the text the UI shows for a call to
     * this tool. The agent calls it before the tool runs.
     *
     * - `title`: the step heading, sent as `TITLE`.
     * - `thought`: optional explanation shown in the step, sent as `THOUGHT`.
     * - `action`: the text shown in the step's code box, sent as
     *   `ACTION.code`. It is real code only for tools that run code, such as
     *   `executeJavaScript`. For other tools it is a readable form of the call,
     *   for example `getInsightDetails('NAVIGATION_0', 'LCPBreakdown')`, and is
     *   never executed.
     * - `suggestions`: `AiAgent` does not use this field.
     */
    readonly displayInfoFromArgs?: (args: ArgsType) => {
        title?: string;
        thought?: string;
        action?: string;
        suggestions?: [string, ...string[]];
    };
    readonly annotations?: ToolAnnotation[];
}
/**
 * Generic tool interface for tools that process inputs and return structured data results.
 *
 * @template ArgsType The expected object schema for tool arguments.
 * @template ReturnType The concrete type of data payload returned in the result.
 * @template CapabilitiesType The capabilities interface required by this tool. Defaults to `BaseToolCapability`.
 */
export interface DataTool<ArgsType extends ToolArgs = ToolArgs, ReturnType = unknown, CapabilitiesType extends BaseToolCapability = BaseToolCapability> extends BaseTool<ArgsType> {
    /**
     * The implementation function called when the AI invokes this tool.
     *
     * @param args The arguments provided by the AI model matching the tool's parameter schema.
     * @param capabilities The context object providing the capabilities requested by `CapabilitiesType`.
     * @param options Additional runtime options for the handler execution.
     */
    handler(args: ArgsType, capabilities: CapabilitiesType, options?: FunctionHandlerOptions): Promise<DataHandlerResult<ReturnType>>;
}
/**
 * Generic tool interface for tools that yield a new `ConversationContext` rather than plain data.
 *
 * @template ArgsType The expected object schema for tool arguments.
 * @template ContextClass The concrete item type wrapped by the returned `ConversationContext`.
 * @template CapabilitiesType The capabilities interface required by this tool. Defaults to `BaseToolCapability`.
 */
export interface ContextTool<ArgsType extends ToolArgs = ToolArgs, ContextClass = unknown, CapabilitiesType extends BaseToolCapability = BaseToolCapability> extends BaseTool<ArgsType> {
    /**
     * The implementation function called when the AI invokes this tool.
     *
     * @param args The arguments provided by the AI model matching the tool's parameter schema.
     * @param capabilities The context object providing the capabilities requested by `CapabilitiesType`.
     * @param options Additional runtime options for the handler execution.
     */
    handler(args: ArgsType, capabilities: CapabilitiesType, options?: FunctionHandlerOptions): Promise<ContextHandlerResult<ContextClass>>;
}
/**
 * Represents any AI Assistance tool: either a `DataTool` (returns data/widgets) or a `ContextTool` (switches active context).
 */
export type Tool<ArgsType extends ToolArgs = ToolArgs, ReturnType = unknown, CapabilitiesType extends BaseToolCapability = BaseToolCapability> = DataTool<ArgsType, ReturnType, CapabilitiesType> | ContextTool<ArgsType, ReturnType, CapabilitiesType>;
/**
 * Capability provided to tools that handle sensitive user data (e.g. cookies or storage values).
 * Calling `disableLogging()` irreversibly disables server-side logging for the remainder of
 * the conversation session to prevent sensitive data from being logged on future turns.
 */
export interface ServerLoggingCapability {
    disableLogging(): void;
}
export declare const enum ToolAnnotation {
    REDACT_FROM_HISTORY = "redact-from-history"
}
