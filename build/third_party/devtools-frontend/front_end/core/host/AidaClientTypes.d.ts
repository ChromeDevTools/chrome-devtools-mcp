export declare enum Role {
    /** Provide this role when giving a function call response  */
    ROLE_UNSPECIFIED = 0,
    /** Tags the content came from the user */
    USER = 1,
    /** Tags the content came from the LLM */
    MODEL = 2
}
export declare const enum Rating {
    SENTIMENT_UNSPECIFIED = "SENTIMENT_UNSPECIFIED",
    POSITIVE = "POSITIVE",
    NEGATIVE = "NEGATIVE"
}
/**
 * A `Content` represents a single turn message.
 */
export interface Content {
    parts: Part[];
    /** The producer of the content. */
    role: Role;
}
export interface FunctionResponsePart {
    functionResponse: {
        name: string;
        response: Record<string, unknown>;
    };
}
export type Part = {
    text: string;
} | {
    functionCall: AidaFunctionCall;
} | FunctionResponsePart | {
    /** Inline media bytes. */
    inlineData: MediaBlob;
};
export declare const enum ParametersTypes {
    STRING = 1,
    NUMBER = 2,
    INTEGER = 3,
    BOOLEAN = 4,
    ARRAY = 5,
    OBJECT = 6
}
interface BaseFunctionParam {
    description: string;
    nullable?: boolean;
}
export interface FunctionPrimitiveParams extends BaseFunctionParam {
    type: ParametersTypes.BOOLEAN | ParametersTypes.INTEGER | ParametersTypes.STRING;
}
export interface FunctionArrayParam extends BaseFunctionParam {
    type: ParametersTypes.ARRAY;
    items: FunctionPrimitiveParams;
}
export interface FunctionObjectParam<T extends string | number | symbol = string> extends BaseFunctionParam {
    type: ParametersTypes.OBJECT;
    properties: Record<T, FunctionPrimitiveParams | FunctionArrayParam>;
    required: T[];
}
/**
 * More about function declaration can be read at
 * https://ai.google.dev/gemini-api/docs/function-calling
 */
export interface FunctionDeclaration<T extends string | number | symbol = string> {
    name: string;
    /**
     * A description for the LLM to understand what the specific function will do once called.
     */
    description: string;
    parameters: FunctionObjectParam<T>;
}
/** Raw media bytes. **/
export interface MediaBlob {
    mimeType: string;
    data: string;
}
export declare enum FunctionalityType {
    FUNCTIONALITY_TYPE_UNSPECIFIED = 0,
    CHAT = 1,
    EXPLAIN_ERROR = 2,
    AGENTIC_CHAT = 5
}
/** See: cs/aida.proto (google3). **/
export declare enum ClientFeature {
    CLIENT_FEATURE_UNSPECIFIED = 0,
    CHROME_CONSOLE_INSIGHTS = 1,
    CHROME_STYLING_AGENT = 2,
    CHROME_NETWORK_AGENT = 7,
    CHROME_PERFORMANCE_ANNOTATIONS_AGENT = 20,
    CHROME_FILE_AGENT = 9,
    CHROME_PATCH_AGENT = 12,
    CHROME_PERFORMANCE_FULL_AGENT = 24,
    CHROME_CONTEXT_SELECTION_AGENT = 25,
    CHROME_ACCESSIBILITY_AGENT = 26,
    CHROME_CONVERSATION_SUMMARY_AGENT = 27,
    CHROME_STORAGE_AGENT = 28,
    CHROME_DEVTOOLS_V2_AGENT = 29
}
export declare enum UserTier {
    USER_TIER_UNSPECIFIED = 0,
    TESTERS = 1,
    BETA = 2,
    PUBLIC = 3
}
/** Googlers: see the Aida `retrieval` proto; this type is based on that. **/
export interface RequestFactMetadata {
    /**
     * A description of where the fact comes from.
     */
    source: string;
    /**
     * Optional: a score to give this fact. Used because
     * if there are more facts than space in the context window,
     * higher scoring facts will be prioritized.
     */
    score?: number;
}
export interface RequestFact {
    /**
     * Content of the fact.
     */
    text: string;
    metadata: RequestFactMetadata;
}
export type RpcGlobalId = string | number;
export interface RequestMetadata {
    string_session_id?: string;
    user_tier?: UserTier;
    disable_user_content_logging: boolean;
    client_version: string;
}
export interface ConversationOptions {
    temperature?: number;
    model_id?: string;
}
export interface DoConversationRequest {
    client: string;
    current_message: Content;
    preamble?: string;
    historical_contexts?: Content[];
    function_declarations?: FunctionDeclaration[];
    facts?: RequestFact[];
    options?: ConversationOptions;
    metadata: RequestMetadata;
    functionality_type?: FunctionalityType;
    client_feature?: ClientFeature;
}
export interface CompleteCodeOptions {
    temperature?: number;
    model_id?: string;
    inference_language?: AidaInferenceLanguage;
    stop_sequences?: string[];
}
export interface GenerateCodeOptions {
    temperature?: number;
    model_id?: string;
    inference_language?: AidaInferenceLanguage;
    expect_code_output?: boolean;
}
export interface ContextFile {
    path: string;
    full_content: string;
    selected_content?: string;
    programming_language: AidaInferenceLanguage;
}
export declare enum EditType {
    EDIT_TYPE_UNSPECIFIED = 0,
    ADD = 1,
    DELETE = 2,
    PASTE = 3,
    UNDO = 4,
    REDO = 5,
    ACCEPT_COMPLETION = 6
}
export declare enum Reason {
    UNKNOWN = 0,
    CURRENTLY_OPEN = 1,
    RECENTLY_OPENED = 2,
    RECENTLY_EDITED = 3,
    COLOCATED = 4,
    RELATED_FILE = 5
}
export interface AdditionalFile {
    path: string;
    content: string;
    included_reason: Reason;
}
export interface CompletionRequest {
    client: string;
    prefix: string;
    suffix?: string;
    options?: CompleteCodeOptions;
    metadata: RequestMetadata;
    last_user_action?: EditType;
    additional_files?: AdditionalFile[];
}
export declare enum UseCase {
    USE_CASE_UNSPECIFIED = 0,
    CODE_GENERATION = 1,
    CODE_TRANSFORMATION = 2
}
export interface GenerateCodeRequest {
    client: string;
    preamble: string;
    current_message: Content;
    options?: GenerateCodeOptions;
    context_files?: ContextFile[];
    use_case: UseCase;
    metadata: RequestMetadata;
    client_feature?: ClientFeature;
}
export interface DoConversationClientEvent {
    user_feedback: {
        sentiment?: Rating;
        user_input?: {
            comment?: string;
        };
    };
}
export interface UserImpression {
    sample: {
        sample_id?: number;
    };
    latency: {
        duration: {
            seconds: number;
            nanos: number;
        };
    };
}
export interface UserAcceptance {
    sample: {
        sample_id?: number;
    };
}
export interface AidaRegisterClientEvent {
    corresponding_aida_rpc_global_id: RpcGlobalId;
    disable_user_content_logging: boolean;
    do_conversation_client_event?: DoConversationClientEvent;
    complete_code_client_event?: {
        user_acceptance: UserAcceptance;
    } | {
        user_impression: UserImpression;
    };
    generate_code_client_event?: {
        user_acceptance: UserAcceptance;
    } | {
        user_impression: UserImpression;
    };
}
export declare enum RecitationAction {
    ACTION_UNSPECIFIED = "ACTION_UNSPECIFIED",
    CITE = "CITE",
    BLOCK = "BLOCK",
    NO_ACTION = "NO_ACTION",
    EXEMPT_FOUND_IN_PROMPT = "EXEMPT_FOUND_IN_PROMPT"
}
export declare enum CitationSourceType {
    CITATION_SOURCE_TYPE_UNSPECIFIED = "CITATION_SOURCE_TYPE_UNSPECIFIED",
    TRAINING_DATA = "TRAINING_DATA",
    WORLD_FACTS = "WORLD_FACTS",
    LOCAL_FACTS = "LOCAL_FACTS",
    INDIRECT = "INDIRECT"
}
export interface Citation {
    startIndex?: number;
    endIndex?: number;
    uri?: string;
    sourceType?: CitationSourceType;
    repository?: string;
}
export interface AttributionMetadata {
    attributionAction: RecitationAction;
    citations: Citation[];
}
export interface AidaFunctionCall {
    name: string;
    args: Record<string, unknown>;
    thoughtSignature?: string;
}
export interface FactualityFact {
    sourceUri?: string;
}
export interface FactualityMetadata {
    facts: FactualityFact[];
}
export interface InferenceOptionMetadata {
    modelId: string;
}
export interface ResponseMetadata {
    rpcGlobalId?: RpcGlobalId;
    attributionMetadata?: AttributionMetadata;
    factualityMetadata?: FactualityMetadata;
    inferenceOptionMetadata?: InferenceOptionMetadata;
}
export interface DoConversationResponse {
    explanation: string;
    metadata: ResponseMetadata;
    functionCalls?: [AidaFunctionCall, ...AidaFunctionCall[]];
    completed: boolean;
}
export interface CompletionResponse {
    generatedSamples: GenerationSample[];
    metadata: ResponseMetadata;
}
export interface GenerateCodeResponse {
    samples: GenerationSample[];
    metadata: ResponseMetadata;
}
export interface GenerationSample {
    generationString: string;
    score: number;
    sampleId?: number;
    attributionMetadata?: AttributionMetadata;
}
export declare const enum AidaAccessPreconditions {
    AVAILABLE = "available",
    NO_ACCOUNT_EMAIL = "no-account-email",
    NO_INTERNET = "no-internet",
    SYNC_IS_PAUSED = "sync-is-paused"
}
export declare const enum AidaInferenceLanguage {
    CPP = "CPP",
    PYTHON = "PYTHON",
    KOTLIN = "KOTLIN",
    JAVA = "JAVA",
    JAVASCRIPT = "JAVASCRIPT",
    GO = "GO",
    TYPESCRIPT = "TYPESCRIPT",
    HTML = "HTML",
    BASH = "BASH",
    CSS = "CSS",
    DART = "DART",
    JSON = "JSON",
    MARKDOWN = "MARKDOWN",
    VUE = "VUE",
    XML = "XML",
    UNKNOWN = "UNKNOWN"
}
export interface AidaChunkResponse {
    metadata?: ResponseMetadata;
    textChunk?: {
        text: string;
    };
    codeChunk?: {
        code: string;
        inferenceLanguage: AidaInferenceLanguage;
    };
    functionCallChunk?: {
        functionCall: AidaFunctionCall;
    };
    error?: string;
}
export declare function debugLog(...log: unknown[]): void;
export {};
