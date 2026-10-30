import * as Host from '../../../core/host/host.js';
import type * as Platform from '../../../core/platform/platform.js';
import * as SDK from '../../../core/sdk/sdk.js';
import type * as TextUtils from '../../../core/text_utils/text_utils.js';
import type * as Protocol from '../../../generated/protocol.js';
import type * as LHModel from '../../lighthouse/lighthouse.js';
import type * as Trace from '../../trace/trace.js';
import type * as Workspace from '../../workspace/workspace.js';
import type { AlwaysAllowedTools } from '../AlwaysAllowedTools.js';
import { type ContextHandlerResult, type DataHandlerResult, PermissionDecision, PermissionPrompt } from '../tools/Tool.js';
type UrlString = Platform.DevToolsPath.UrlString;
/**
 * The types of event in the response stream that `AiConversation#run()`
 * yields to the AI assistance panel. The same events, minus a few, are saved
 * as the conversation history and replayed when a saved conversation opens.
 *
 * ## Order of events in one run
 *
 * ```
 * USER_QUERY                    (AiConversation, first run of a query only)
 * CONTEXT*                      (agent's handleContextDetails())
 * repeated for each model request, up to MAX_STEPS:
 *   QUERYING
 *   one of:
 *     ANSWER (complete: false)*, ANSWER (complete: true)   text-only reply; the run ends
 *     ANSWER (complete: false)*, [ANSWER (complete: true)],
 *       <tool call events>+                                one or more function calls, optionally with text
 *     ERROR                                                the run ends
 * ```
 *
 * When a model response contains several function calls,
 * `AiAgent#runFunctionCalls()` runs them one after another, so each call's
 * events finish before the next call's events start. A denied call does not
 * stop the calls after it, and neither does a failed call: an unknown tool
 * name or an error thrown by the handler becomes an error result for that
 * call.
 *
 * An `ERROR` can also follow the tool call events, for example when the user
 * aborts, the page navigates cross-origin, or the run reaches `MAX_STEPS`.
 * The remaining calls in that model response do not run after an abort or a
 * cross-origin navigation.
 *
 * ## Events for one tool call
 *
 * `AiAgent#callFunction()` yields these. All events for one call carry the
 * same `callId`.
 *
 * ```
 * TITLE?, THOUGHT?              from the tool's displayInfoFromArgs()
 * if the tool needs approval:
 *   ACTION {code}               code only, shown above the approval prompt;
 *                               skipped if displayInfoFromArgs() has no action
 *   SIDE_EFFECT                 the panel shows the prompt and calls confirm()
 *   if denied: ACTION {code, output, canceled: true}, and the call ends
 * ACTION {code, output, widgets, toolName}   result or error
 * ```
 *
 * If the tool switches context instead of returning a result, there is no
 * result `ACTION`. `AiAgent#runFunctionCalls()` yields `CONTEXT_CHANGE` and
 * the run ends, and `AiConversation` starts a new run with the agent for the
 * new context. The remaining calls in that model response do not run.
 *
 * ## Model history for function calls
 *
 * This is the history sent to the model, separate from the saved history
 * below. `AiAgent#runFunctionCalls()` stores the model's explanation text and
 * every function call in a response as one `MODEL` turn. The next request
 * carries one `functionResponse` per call, in the same order. A denied call
 * gets a response that says it did not run. After a context change, each call
 * that did not run gets a "Not executed" response.
 *
 * ## Saved history
 *
 * `AiConversation` saves every event except `CONTEXT_CHANGE` and partial
 * `ANSWER`s. `AiConversation#serialize()` removes `confirm`, images and
 * widgets, and redacts the `ACTION` output of tools annotated with
 * `REDACT_FROM_HISTORY`. Saved data has no version field, so new fields must
 * be optional.
 *
 * ## How the panel renders events
 *
 * `AiAssistancePanel#consumeResponseStream()` builds one chat message per
 * `USER_QUERY` and one step per tool call:
 * - `QUERYING` starts a new step with a spinner. The panel shows the step only
 *   if it is the first part of the message. Otherwise, the step stays hidden
 *   until a tool call fills it in.
 * - `TITLE`, `THOUGHT`, `ACTION` and `SIDE_EFFECT` update the step for their
 *   `callId`. Events saved before `callId` existed update the current step.
 * - `ANSWER` adds the answer text. `ERROR` sets the message error.
 */
export declare const enum ResponseType {
    CONTEXT = "context",
    TITLE = "title",
    THOUGHT = "thought",
    ACTION = "action",
    SIDE_EFFECT = "side-effect",
    SUGGESTIONS = "suggestions",
    ANSWER = "answer",
    ERROR = "error",
    QUERYING = "querying",
    USER_QUERY = "user-query",
    CONTEXT_CHANGE = "context-change"
}
export declare const enum ErrorType {
    UNKNOWN = "unknown",
    ABORT = "abort",
    MAX_STEPS = "max-steps",
    BLOCK = "block",
    CROSS_ORIGIN = "cross-origin",
    QUOTA = "quota",
    PAYLOAD_TOO_LARGE = "payload-too-large"
}
export declare const enum MultimodalInputType {
    SCREENSHOT = "screenshot",
    UPLOADED_IMAGE = "uploaded-image"
}
export interface MultimodalInput {
    input: Host.AidaClient.Part;
    type: MultimodalInputType;
    id: string;
}
export interface AnswerResponse {
    type: ResponseType.ANSWER;
    text: string;
    complete: boolean;
    rpcId?: Host.AidaClient.RpcGlobalId;
    suggestions?: [string, ...string[]];
    widgets?: AiWidget[];
}
/**
 * No agent yields this event. The panel still handles it by attaching the
 * suggestions to the last answer.
 */
export interface SuggestionsResponse {
    type: ResponseType.SUGGESTIONS;
    suggestions: [string, ...string[]];
}
export interface ErrorResponse {
    type: ResponseType.ERROR;
    error: ErrorType;
}
export interface ContextDetail {
    title: string;
    text: string;
    codeLang?: string;
}
/**
 * Describes the context sent with the user's query, such as the selected
 * element. The agent's `handleContextDetails()` yields it before the first
 * model request. The panel shows it as a completed "Analyzing data" step.
 */
export interface ContextResponse {
    type: ResponseType.CONTEXT;
    details: [ContextDetail, ...ContextDetail[]];
    widgets?: AiWidget[];
}
/**
 * Identifies the tool call that an event belongs to. `AiAgent#callFunction()`
 * generates one per call and sets it on every event for that call. Only the
 * UI reads it; the agent never sends it to the model.
 *
 * Conversations saved before this field existed do not have it. The panel
 * applies events without a `callId` to the current step.
 */
interface ToolCallEvent {
    callId?: string;
}
/**
 * The heading of a tool call's step, from `displayInfoFromArgs().title`.
 */
export interface TitleResponse extends ToolCallEvent {
    type: ResponseType.TITLE;
    title: string;
    /**
     * No agent sets this field.
     */
    rpcId?: Host.AidaClient.RpcGlobalId;
}
/**
 * Explanation text for a tool call's step, from
 * `displayInfoFromArgs().thought`. The panel marks the step as completed when
 * it receives a thought, even though the tool has not run yet.
 */
export interface ThoughtResponse extends ToolCallEvent {
    type: ResponseType.THOUGHT;
    thought: string;
    /**
     * No agent sets this field.
     */
    rpcId?: Host.AidaClient.RpcGlobalId;
}
/**
 * Asks the user to approve a tool call that has side effects. The agent waits
 * until `confirm()` is called. If `displayInfoFromArgs()` returns an
 * `action`, the agent yields it in a code-only `ACTION` just before this
 * event.
 */
export interface SideEffectResponse extends ToolCallEvent {
    type: ResponseType.SIDE_EFFECT;
    description: string | null;
    /**
     * No agent sets this field. The code comes from the preceding `ACTION`.
     */
    code?: string;
    confirm: (decision: PermissionDecision) => void;
    permissionPrompt?: PermissionPrompt;
    permissionTitle?: string;
}
/**
 * Yielded when a tool selects a new context, for example a network request.
 * `AiConversation` switches to the agent for that context and starts a new
 * run. `AiConversation` does not save this event in the history.
 */
export interface ContextChangeResponse {
    type: ResponseType.CONTEXT_CHANGE;
    /**
     * Information to pass down what was selected
     * Use to make the LLM understand the the user
     * already selected something.
     */
    description: string;
    context: ConversationContext<unknown>;
    widgets?: AiWidget[];
    /**
     * The name of the tool that triggered this context change. Used by the panel
     * to emit UI telemetry.
     */
    toolName?: string;
}
interface SerializedSideEffectResponse extends Omit<SideEffectResponse, 'confirm'> {
}
/**
 * The code and result of a tool call. A call yields one or two:
 * - Calls that need approval and have code first yield a code-only `ACTION`
 *   (no `output`), so the panel can show the code above the approval prompt.
 * - Every call that runs, fails or is denied ends with an `ACTION` that has
 *   an `output`.
 */
export interface ActionResponse extends ToolCallEvent {
    type: ResponseType.ACTION;
    /**
     * The text shown in the step's code box, from
     * `displayInfoFromArgs().action`. It is real code only for tools that run
     * code, such as `executeJavaScript`. For other tools it is a readable form of
     * the call.
     */
    code?: string;
    /**
     * The tool's result, error message, or the denial message. Missing on the
     * code-only `ACTION` that precedes an approval prompt.
     */
    output?: string;
    /**
     * True if the user denied the call, so the tool did not run.
     */
    canceled: boolean;
    widgets?: AiWidget[];
    /**
     * The name of the tool. Set on the result `ACTION` but not on the code-only
     * or denied `ACTION`. `AiConversation#serialize()` uses it to redact the
     * output of tools annotated with `REDACT_FROM_HISTORY`.
     */
    toolName?: string;
    /**
     * Skills newly loaded by a `learnSkills` call. Used by the panel to emit
     * `ai-v2-learn-skill` visual logging events.
     */
    loadedSkills?: string[];
}
/**
 * Yielded before each model request. The panel starts a new step for it.
 */
export interface QueryingResponse {
    type: ResponseType.QUERYING;
}
/**
 * The user's query. Yielded by `AiConversation`, not by the agent, before
 * the first run for the query. The panel starts a new chat message for it.
 */
export interface UserQuery {
    type: ResponseType.USER_QUERY;
    query: string;
    imageInput?: Host.AidaClient.Part;
    imageId?: string;
}
export type ResponseData = AnswerResponse | SuggestionsResponse | ErrorResponse | ActionResponse | SideEffectResponse | ThoughtResponse | TitleResponse | QueryingResponse | ContextResponse | UserQuery | ContextChangeResponse;
export type SerializedResponseData = AnswerResponse | SuggestionsResponse | ErrorResponse | ActionResponse | SerializedSideEffectResponse | ThoughtResponse | TitleResponse | QueryingResponse | ContextResponse | UserQuery;
export type FunctionCallResponseData = TitleResponse | ThoughtResponse | ActionResponse | SideEffectResponse | SuggestionsResponse | ContextChangeResponse;
export interface BuildRequestOptions {
    text: string;
}
export interface RequestOptions {
    temperature?: number;
    modelId?: string;
}
export type AllowedOriginResult = {
    origin: SDK.SecurityOrigin.SecurityOrigin | undefined;
} | {
    blocked: true;
};
export interface AgentOptions {
    aidaClient: Host.AidaClient.AidaClient;
    serverSideLoggingAllowed?: boolean;
    sessionId?: string;
    confirmSideEffectForTest?: typeof Promise.withResolvers;
    onInspectElement?: () => Promise<SDK.DOMModel.DOMNode | null>;
    history?: Host.AidaClient.Content[];
    allowedOrigin?: () => AllowedOriginResult;
    lighthouseRecording?: (overrides?: LHModel.RunTypes.RunOverrides) => Promise<LHModel.RunTypes.RunResult>;
    targetManager?: SDK.TargetManager.TargetManager;
    alwaysAllowedTools?: AlwaysAllowedTools;
}
export interface ParsedAnswer {
    answer: string;
    suggestions?: [string, ...string[]];
}
export type ParsedResponse = ParsedAnswer;
export declare const MAX_STEPS = 20;
export interface ConversationSuggestion {
    title: string;
    jslogContext?: string;
}
/** At least one. */
export type ConversationSuggestions = [ConversationSuggestion, ...ConversationSuggestion[]];
export type ConversationContextJslog = 'ai-context-dom-node' | 'ai-context-network-request' | 'ai-context-file' | 'ai-context-performance-trace' | 'ai-context-accessibility' | 'ai-context-storage';
export declare abstract class ConversationContext<T> {
    abstract readonly jslogContext: ConversationContextJslog;
    abstract getItem(): T;
    abstract getTitle(): string;
    /**
     * Returns true if the server-side logging is enabled when this context is active.
     * Currently only used for AI v2.
     */
    isLoggingEnabled(): boolean;
    /**
     * Returns the security origin that owns this context data.
     *
     * The AI Assistance panel locks each conversation to the origin of the initial
     * context. If the user selects a context with a different origin, DevTools
     * blocks access to prevent unauthorized cross-origin data exposure.
     *
     * Subclasses must implement this method. If a context is detached, invalid,
     * or anonymous, the method must return a unique opaque origin
     * (`SDK.SecurityOrigin.SecurityOrigin.createUniqueOpaque()`).
     *
     * @returns The {@link SDK.SecurityOrigin.SecurityOrigin} that owns this context.
     */
    abstract getOrigin(): SDK.SecurityOrigin.SecurityOrigin;
    /**
     * Checks whether this context can participate in a conversation locked to `establishedOrigin`.
     *
     * Evaluation rules:
     * 1. Returns `false` if this context origin is opaque. Opaque contexts can never
     *    participate in AI conversations.
     * 2. Returns `true` if `establishedOrigin` is `undefined` (conversation is not yet locked).
     * 3. Returns `true` if this context origin is same-origin with `establishedOrigin`.
     *
     * @param establishedOrigin The locked origin of the current conversation, or `undefined`
     * if the conversation has not made its first query.
     */
    isOriginAllowed(establishedOrigin: SDK.SecurityOrigin.SecurityOrigin | undefined): boolean;
    /**
     * This method is called at the start of `AiAgent.run`.
     * It will be overridden in subclasses to fetch data related to the context item.
     */
    refresh(): Promise<void>;
    getSuggestions(): Promise<ConversationSuggestions | undefined>;
    /**
     * Returns a detailed description of the context item for inclusion in the AI model prompt.
     * Currently only used by AiAgent2.
     */
    getPromptDetails(): Promise<string | null>;
    /**
     * Returns a list of context details to display to the user in the UI.
     * Currently only used by AiAgent2.
     */
    getUserFacingDetails(): Promise<[ContextDetail, ...ContextDetail[]] | null>;
    /**
     * Returns initial UI widgets to display in the conversation context header
     * when this context is active (e.g. Core Web Vitals summary for a performance trace).
     * Used by PerformanceAgent and AiAgent2.
     */
    getWidgets(): Promise<AiWidget[]>;
}
export interface ComputedStyleAiWidget {
    name: 'COMPUTED_STYLES';
    data: {
        computedStyles: Map<string, string>;
        backendNodeId: Protocol.DOM.BackendNodeId;
        matchedCascade: SDK.CSSMatchedStyles.CSSMatchedStyles;
        properties: string[];
    };
}
export interface CoreVitalsAiWidget {
    name: 'CORE_VITALS';
    data: {
        insightSetKey: string;
        parsedTrace: Trace.TraceModel.ParsedTrace;
    };
}
export interface StylePropertiesAiWidget {
    name: 'STYLE_PROPERTIES';
    data: {
        backendNodeId: Protocol.DOM.BackendNodeId;
        selector?: string;
    };
}
export interface DomTreeAiWidget {
    name: 'DOM_TREE';
    data: {
        root: SDK.DOMModel.DOMNodeSnapshot;
        title: Platform.UIString.LocalizedString;
        accessibleRevealLabel: Platform.UIString.LocalizedString;
        networkRequest?: {
            url: string;
            size: number;
            resourceType: Protocol.Network.ResourceType;
            mimeType: string;
            imageContent?: TextUtils.ContentData.ContentData;
        };
    };
}
export interface PerformanceTraceAiWidget {
    name: 'PERFORMANCE_TRACE';
    data: {
        parsedTrace: Trace.TraceModel.ParsedTrace;
    };
}
export interface PerfInsightAiWidget {
    name: 'PERF_INSIGHT';
    data: {
        insight: Trace.Insights.Types.InsightKeys;
        insightData: Trace.Insights.Types.InsightModel;
    };
}
export interface TimelineRangeSummaryAiWidget {
    name: 'TIMELINE_RANGE_SUMMARY';
    data: {
        bounds: Trace.Types.Timing.TraceWindowMicro;
        parsedTrace: Trace.TraceModel.ParsedTrace;
        track: 'main';
    };
}
export interface BottomUpTreeAiWidget {
    name: 'BOTTOM_UP_TREE';
    data: {
        bounds: Trace.Types.Timing.TraceWindowMicro;
        parsedTrace: Trace.TraceModel.ParsedTrace;
    };
}
export interface SourceFileAiWidget {
    name: 'SOURCE_FILE';
    data: {
        uiSourceCode: Workspace.UISourceCode.UISourceCode;
    };
}
export interface SourceFilesListAiWidget {
    name: 'SOURCE_FILES_LIST';
    data: {
        uiSourceCodes: Workspace.UISourceCode.UISourceCode[];
    };
}
export interface NetworkRequestsListAiWidget {
    name: 'NETWORK_REQUESTS_LIST';
    data: {
        requests: SDK.NetworkRequest.NetworkRequest[];
    };
}
export interface NetworkTrackAiWidget {
    name: 'NETWORK_TRACK';
    data: {
        parsedTrace: Trace.TraceModel.ParsedTrace;
        bounds: Trace.Types.Timing.TraceWindowMicro;
    };
}
export interface LighthouseReportAiWidget {
    name: 'LIGHTHOUSE_REPORT';
    data: {
        report: LHModel.ReporterTypes.ReportJSON;
        snapshotReport?: boolean;
    };
}
export interface TimelineEventSummaryAiWidget {
    name: 'TIMELINE_EVENT_SUMMARY';
    data: {
        event: Trace.Types.Events.Event;
        parsedTrace: Trace.TraceModel.ParsedTrace;
    };
}
export interface NetworkRequestGeneralHeadersAiWidget {
    name: 'NETWORK_REQUEST_GENERAL_HEADERS';
    data: {
        request: SDK.NetworkRequest.NetworkRequest;
    };
}
export interface SourceCodeAiWidget {
    name: 'SOURCE_CODE';
    data: {
        url: UrlString;
        code: string;
        line?: number;
        column?: number;
    };
}
export interface StorageBreakdownAiWidget {
    name: 'STORAGE_BREAKDOWN';
    data: {
        totalUsageBytes: number;
        totalQuotaBytes: number;
        usageBreakdown: Array<{
            storageType: string;
            bytes: number;
        }>;
    };
}
export type AiWidget = ComputedStyleAiWidget | CoreVitalsAiWidget | StylePropertiesAiWidget | DomTreeAiWidget | PerformanceTraceAiWidget | PerfInsightAiWidget | TimelineRangeSummaryAiWidget | BottomUpTreeAiWidget | SourceFileAiWidget | LighthouseReportAiWidget | TimelineEventSummaryAiWidget | NetworkRequestGeneralHeadersAiWidget | SourceCodeAiWidget | SourceFilesListAiWidget | NetworkRequestsListAiWidget | NetworkTrackAiWidget | StorageBreakdownAiWidget;
/**
 * @deprecated Used for v1 agents. Once v2 is shipped, this can be removed.
 * Use `DataHandlerResult` or `ContextHandlerResult` from `Tool.js` instead.
 */
export type ToolResult<ResultType> = DataHandlerResult<ResultType> | ContextHandlerResult;
export interface FunctionHandlerOptions {
    /**
     * Shows that the user approved
     * the execution if it was required
     */
    approved?: boolean;
    signal?: AbortSignal;
}
export interface FunctionDeclaration<Args extends Record<string, unknown>, ReturnType> {
    /**
     * Description of function, this is send to the LLM
     * to explain what will the function do.
     */
    description: string | (() => string);
    /**
     * JSON schema like representation of the parameters
     * the function needs to be called with.
     * Provide description to all parameters as this is
     * send to the LLM.
     */
    parameters: Host.AidaClient.FunctionObjectParam<keyof Args>;
    /**
     * Returns the text the UI shows for a call to this function. The agent
     * calls it before the handler runs.
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
    displayInfoFromArgs?: (args: Args) => {
        title?: string;
        thought?: string;
        action?: string;
        suggestions?: [string, ...string[]];
    };
    /**
     * Choices the permission prompt offers when the handler returns
     * `requiresApproval`. Behaves as `ALLOW_ONCE` when unset.
     */
    permissionPrompt?: PermissionPrompt;
    /**
     * Title of the permission prompt, e.g. "Allow reading cookie values?".
     */
    permissionTitle?: string;
    /**
     * Function implementation that the LLM will try to execute,
     */
    handler(args: Args, options?: FunctionHandlerOptions): Promise<ToolResult<ReturnType>>;
}
/**
 * AiAgent is a base class for implementing an interaction with AIDA
 * that involves one or more requests being sent to AIDA optionally
 * utilizing function calling.
 *
 * TODO: missing a test that action code is yielded before the
 * confirmation dialog.
 */
export declare abstract class AiAgent<T> {
    #private;
    /**
     * WARNING: preamble defined in code is only used when userTier is
     * TESTERS. Otherwise, a server-side preamble is used (see
     * chrome_preambles.gcl).
     */
    abstract readonly preamble: string | undefined;
    abstract readonly options: RequestOptions;
    abstract readonly clientFeature: Host.AidaClient.ClientFeature;
    abstract readonly userTier: string | undefined;
    abstract handleContextDetails(select: ConversationContext<T> | null): AsyncGenerator<ContextResponse, void, void>;
    readonly confirmSideEffect: typeof Promise.withResolvers;
    /**
     * `context` does not change during `AiAgent.run()`, ensuring that calls to JS
     * have the correct `context`. We don't want element selection by the user to
     * change the `context` during an `AiAgent.run()`.
     */
    protected context?: ConversationContext<T>;
    constructor(opts: AgentOptions);
    enhanceQuery(query: string, selected: ConversationContext<T> | null, multimodalInputType?: MultimodalInputType): Promise<string>;
    currentFacts(): ReadonlySet<Host.AidaClient.RequestFact>;
    get history(): Host.AidaClient.Content[];
    get targetManager(): SDK.TargetManager.TargetManager;
    /**
     * Add a fact which will be sent for any subsequent requests.
     * Returns the new list of all facts.
     * Facts are never automatically removed.
     */
    addFact(fact: Host.AidaClient.RequestFact): ReadonlySet<Host.AidaClient.RequestFact>;
    removeFact(fact: Host.AidaClient.RequestFact): boolean;
    clearFacts(): void;
    /**
     * Clears any subclass-specific caches. This is called when a run encounters
     * an error (e.g., cross-origin navigation, abort, or execution error) to
     * prevent unvalidated cached data from being replayed in subsequent runs.
     */
    clearCache(): void;
    /**
     * Disables server-side logging for the remainder of this agent instance's lifetime.
     *
     * Logging deactivation is irreversible for the session. Conversation history
     * accumulates across turns; re-enabling logging later would leak sensitive
     * data from prior turns to AIDA.
     */
    protected disableServerSideLogging(): void;
    /**
     * Preamble features appended to the `client_version` in metadata.
     * This is required ONLY for the Styling Agent for legacy reasons to serve
     * different server-side preambles based on the Chrome version.
     * Other agents should NOT set or override this.
     * If you are curious about this, look for `do_conversation_handler.cc` in
     * Google3 or chat to @jacktfranklin.
     */
    preambleFeatures(): string[];
    buildRequest(part: Host.AidaClient.Part | Host.AidaClient.Part[], role: Host.AidaClient.Role.USER | Host.AidaClient.Role.ROLE_UNSPECIFIED): Host.AidaClient.DoConversationRequest;
    get sessionId(): string;
    /**
     * The AI has instructions to emit structured suggestions in their response. This
     * function parses for that.
     *
     * Note: currently only StylingAgent and PerformanceAgent utilize this, but
     * eventually all agents should support this.
     */
    parseTextResponseForSuggestions(text: string): ParsedResponse;
    /**
     * Parses a streaming text response into a
     * though/action/title/answer/suggestions component.
     */
    parseTextResponse(response: string): ParsedResponse;
    /**
     * Parses the text of a response that is still streaming. Only the `answer`
     * of the result is shown, as a partial answer. By default, partial answers
     * use the same parsing as completed answers.
     *
     * This hook exists so that `AiAgent2` (AI V2) can parse follow-up
     * suggestions differently without changing the V1 agents. Remove it once
     * AI V2 ships and the V1 agents are removed. b/568697679 explores getting
     * suggestions from a function call instead of parsing them from text,
     * which would remove the need for this parsing.
     */
    protected parsePartialTextResponse(response: string): ParsedResponse;
    protected finalizeAnswer(answer: AnswerResponse): Promise<AnswerResponse>;
    /**
     * Declare a function that the AI model can call.
     * @param name The name of the function
     * @param declaration the function declaration. Currently functions must:
     * 1. Return an object of serializable key/value pairs. You cannot return
     *    anything other than a plain JavaScript object that can be serialized.
     * 2. Take one parameter which is an object that can have
     *    multiple keys and values. For example, rather than a function being called
     *    with two args, `foo` and `bar`, you should instead have the function be
     *    called with one object with `foo` and `bar` keys.
     */
    protected declareFunction<Args extends Record<string, unknown>, ReturnType = unknown>(name: string, declaration: FunctionDeclaration<Args, ReturnType>): void;
    protected clearDeclaredFunctions(): void;
    /**
     * Executed immediately after the current context is populated with the selected
     * context and before the request is built.
     */
    protected preRun(): Promise<void>;
    run(initialQuery: string, options: {
        selected: ConversationContext<T> | null;
        signal?: AbortSignal;
    }, multimodalInput?: MultimodalInput): AsyncGenerator<ResponseData, void, void>;
}
/**
 * Parses `suggestions` as a JSON array and returns its non-empty string items,
 * with whitespace collapsed and each item truncated to `MAX_SUGGESTION_LENGTH`.
 * Returns `undefined` if the value is not an array or no items remain.
 * Throws if `suggestions` is not valid JSON.
 */
export declare function sanitizeSuggestions(suggestions: string): [string, ...string[]] | undefined;
/**
 * Maps AIDA-specific client error instances to user-facing ErrorType enums.
 * This handles AIDA API failure modes such as quota exhaustion or blockages.
 * Other application-level errors (like CROSS_ORIGIN or MAX_STEPS) are handled separately.
 */
export declare function aidaErrorToErrorType(err: unknown): ErrorType;
export {};
