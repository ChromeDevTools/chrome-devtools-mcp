/**
 * Type contains the list of OpenAPI data types.
 */
export declare enum Type {
    TYPE_UNSPECIFIED = 0,
    STRING = 1,
    NUMBER = 2,
    INTEGER = 3,
    BOOLEAN = 4,
    ARRAY = 5,
    OBJECT = 6,
    NULL = 7
}
/**
 * The category of a rating.
 */
export declare enum HarmCategory {
    HARM_CATEGORY_UNSPECIFIED = 0,
    HARM_CATEGORY_HARASSMENT = 7,
    HARM_CATEGORY_HATE_SPEECH = 8,
    HARM_CATEGORY_SEXUALLY_EXPLICIT = 9,
    HARM_CATEGORY_DANGEROUS_CONTENT = 10
}
/**
 * The probability that a piece of content is harmful.
 */
export declare enum HarmProbability {
    HARM_PROBABILITY_UNSPECIFIED = 0,
    NEGLIGIBLE = 1,
    LOW = 2,
    MEDIUM = 3,
    HIGH = 4
}
/**
 * Block at and beyond a specified harm probability.
 */
export declare enum HarmBlockThreshold {
    HARM_BLOCK_THRESHOLD_UNSPECIFIED = 0,
    BLOCK_LOW_AND_ABOVE = 1,
    BLOCK_MEDIUM_AND_ABOVE = 2,
    BLOCK_ONLY_HIGH = 3,
    BLOCK_NONE = 4,
    OFF = 5
}
export declare enum HarmBlockMethod {
    HARM_BLOCK_METHOD_UNSPECIFIED = 0,
    SEVERITY = 1,
    PROBABILITY = 2
}
/**
 * Defines the reason why the model stopped generating tokens.
 */
export declare enum FinishReason {
    FINISH_REASON_UNSPECIFIED = 0,
    STOP = 1,
    MAX_TOKENS = 2,
    SAFETY = 3,
    RECITATION = 4,
    OTHER = 5,
    BLOCKLIST = 6,
    PROHIBITED_CONTENT = 7,
    SPII = 8,
    MALFORMED_FUNCTION_CALL = 9,
    IMAGE_SAFETY = 10,
    IMAGE_PROHIBITED_CONTENT = 11,
    IMAGE_RECITATION = 12,
    IMAGE_OTHER = 13,
    UNEXPECTED_TOOL_CALL = 14,
    NO_IMAGE = 15
}
/**
 * The suggestion method used.
 */
export declare enum Method {
    METHOD_UNSPECIFIED = 0,
    GENERATE_CODE = 1,
    COMPLETE_CODE = 2,
    TRANSFORM_CODE = 3,
    CHAT = 4
}
/**
 * The status of the suggestion received.
 */
export declare enum SuggestionStatus {
    STATUS_UNSPECIFIED = 0,
    NO_ERROR = 1,
    ERROR = 2,
    CANCELLED = 3,
    EMPTY = 4
}
/**
 * The type of interaction.
 */
export declare enum InteractionType {
    INTERACTION_TYPE_UNSPECIFIED = 0,
    THUMBS_UP = 1,
    THUMBS_DOWN = 2,
    ACCEPT = 3,
    ACCEPT_PARTIALLY = 4,
    REJECT = 5,
    COPY = 6
}
export declare enum InclusionReason {
    INCLUSION_REASON_UNSPECIFIED = 0,
    ACTIVE = 1,
    OPEN = 2,
    RECENTLY_CLOSED = 3,
    RECENTLY_EDITED = 4,
    COLOCATED = 5,
    RELATED = 6,
    USER_SELECTED = 7
}
/**
 * A list of reasons why content may have been blocked.
 */
export declare enum BlockReason {
    BLOCKED_REASON_UNSPECIFIED = 0,
    SAFETY = 1,
    OTHER = 2,
    BLOCKLIST = 3,
    PROHIBITED_CONTENT = 4,
    IMAGE_SAFETY = 5
}
/**
 * Supported programming languages for the generated code.
 */
export declare enum Language {
    LANGUAGE_UNSPECIFIED = 0,
    PYTHON = 1
}
/**
 * Enumeration of possible outcomes of the code execution.
 */
export declare enum Outcome {
    OUTCOME_UNSPECIFIED = 0,
    OUTCOME_OK = 1,
    OUTCOME_FAILED = 2,
    OUTCOME_DEADLINE_EXCEEDED = 3
}
/**
 * Defines the execution behavior for function calling.
 */
export declare enum Mode {
    MODE_UNSPECIFIED = 0,
    AUTO = 1,
    ANY = 2,
    NONE = 3
}
export interface GenerateContentRequest {
    model?: string;
    aicode: AiCodeConfig;
    contents: Content[];
    systemInstruction?: Content;
    tools?: Tool[];
    toolConfig?: ToolConfig;
    labels?: Record<string, string>;
    safetySettings?: SafetySetting[];
    generationConfig?: GenerationConfig;
    sessionId?: string;
}
export interface AiCodeConfig {
    experience: string;
    files?: SourceFile[];
}
export interface SourceFile {
    inclusionReason?: InclusionReason[];
    fileUri: string;
    programmingLanguage?: string;
    segments?: FileSegment[];
}
export interface FileSegment {
    content: string;
    isSelected: boolean;
}
export interface FileEdit {
    fileUri: string;
    content: string;
}
export type Role = 'user' | 'model';
export interface Content {
    parts?: Part[];
    role: Role;
}
export interface Part {
    text?: string;
    inlineData?: Blob;
    fileData?: FileData;
    functionCall?: FunctionCall;
    functionResponse?: FunctionResponse;
    executableCode?: ExecutableCode;
    codeExecutionResult?: CodeExecutionResult;
    videoMetadata?: VideoMetadata;
    thought?: boolean;
    thoughtSignature?: string;
}
export interface Blob {
    mimeType: string;
    data: string;
}
export interface FileData {
    mimeType: string;
    fileUri: string;
}
export interface FunctionCall {
    name: string;
    args?: Record<string, unknown>;
    id?: string;
}
export interface FunctionResponse {
    name: string;
    response: Record<string, unknown>;
    id?: string;
}
export interface ExecutableCode {
    language: Language;
    code: string;
}
export interface CodeExecutionResult {
    outcome: Outcome;
    output: string;
}
export interface Tool {
    functionDeclarations?: FunctionDeclaration[];
    googleSearch?: {
        timeRangeFilter?: {
            startTime?: string;
            endTime?: string;
        };
    };
}
export interface FunctionDeclaration {
    name: string;
    description: string;
    parameters?: Schema;
    parametersJsonSchema?: unknown;
    response?: Schema;
    responseJsonSchema?: unknown;
}
export interface Schema {
    type?: Type;
    format?: string;
    description?: string;
    nullable?: boolean;
    enum?: string[];
    items?: Schema;
    properties?: Record<string, Schema>;
    required?: string[];
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    example?: unknown;
}
export interface ToolConfig {
    functionCallingConfig?: FunctionCallingConfig;
}
export interface FunctionCallingConfig {
    mode: Mode;
    allowedFunctionNames?: string[];
}
export interface SafetySetting {
    category: HarmCategory;
    threshold: HarmBlockThreshold;
    method?: HarmBlockMethod;
}
export interface GenerationConfig {
    candidateCount?: number;
    stopSequences?: string[];
    maxOutputTokens?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
    seed?: number;
    responseMimeType?: string;
    responseSchema?: Schema;
    responseJsonSchema?: unknown;
    presencePenalty?: number;
    frequencyPenalty?: number;
    thinkingConfig?: ThinkingConfig;
}
export interface ThinkingConfig {
    includeThoughts?: boolean;
    thinkingBudget?: number;
}
export interface GenerateContentResponse {
    candidates: Candidate[];
    promptFeedback: PromptFeedback;
    usageMetadata: UsageMetadata;
    modelVersion: string;
    responseId: string;
    error?: Record<string, unknown>;
}
export interface Candidate {
    index: number;
    content: Content;
    finishReason: FinishReason;
    safetyRatings: SafetyRating[];
    citationMetadata: CitationMetadata;
    groundingMetadata: GroundingMetadata;
    aicodeOutput: AiCodeOutput;
}
export interface SafetyRating {
    category: HarmCategory;
    probability: HarmProbability;
    blocked: boolean;
}
export interface CitationMetadata {
    citations: Citation[];
}
export interface Citation {
    startIndex: number;
    endIndex: number;
    uri: string;
    license: string;
}
export interface GroundingMetadata {
    webSearchQueries?: string[];
    searchEntryPoint?: {
        renderedContent?: string;
        sdkBlob?: string;
    };
    groundingChunks?: Array<{
        web?: {
            uri?: string;
            title?: string;
        };
    }>;
    groundingSupports?: Array<{
        segment?: {
            partIndex?: number;
            startIndex?: number;
            endIndex?: number;
            text?: string;
        };
        groundingChunkIndices?: number[];
        confidenceScores?: number[];
    }>;
    retrievalMetadata?: {
        googleSearchDynamicRetrievalScore?: number;
    };
}
export interface AiCodeOutput {
    contents: DerivedContent[];
}
export interface DerivedContent {
    startIndex?: number;
    endIndex?: number;
    file?: OutputSourceFile;
    codeBlock?: CodeBlock;
    textBlock?: TextBlock;
    predictionMetadata?: PredictionMetadata;
}
export interface OutputSourceFile {
    fileUri: string;
    content: string;
}
export interface CodeBlock {
    content: string;
    programmingLanguage: string;
}
export interface TextBlock {
    content: string;
}
export interface PredictionMetadata {
    score: number;
    classifierScore: number;
}
export interface PromptFeedback {
    blockReason: BlockReason;
    safetyRatings: SafetyRating[];
    blockReasonMessage: string;
}
export interface UsageMetadata {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
    thoughtsTokenCount: number;
    cachedContentTokenCount: number;
}
export interface VideoMetadata {
    startOffset?: string;
    endOffset?: string;
    fps?: number;
}
export interface SendTelemetryRequest {
    feedbackMetrics: FeedbackMetric[];
}
export interface FeedbackMetric {
    eventTime: string;
    responseId: string;
    suggestionOffered?: SuggestionOffered;
    suggestionInteraction?: SuggestionInteraction;
}
export interface SuggestionOffered {
    method?: Method;
    status?: SuggestionStatus;
    firstMessageLatency?: string;
    responseLatency?: string;
    displayed?: boolean;
    e2eLatency?: string;
    displayDuration?: string;
    programmingLanguage?: string;
}
export interface SuggestionInteraction {
    interaction?: InteractionType;
    acceptedLines?: number;
    acceptedCharacters?: number;
    acceptedCommentLines?: number;
    candidateIndex?: number;
}
