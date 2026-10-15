// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
// Reference proto definition
// google3/google/gca/aicode/v1main/prediction_service.proto
// revision 45 2026-03-06
/**
 * Type contains the list of OpenAPI data types.
 */
export var Type;
(function (Type) {
    Type[Type["TYPE_UNSPECIFIED"] = 0] = "TYPE_UNSPECIFIED";
    Type[Type["STRING"] = 1] = "STRING";
    Type[Type["NUMBER"] = 2] = "NUMBER";
    Type[Type["INTEGER"] = 3] = "INTEGER";
    Type[Type["BOOLEAN"] = 4] = "BOOLEAN";
    Type[Type["ARRAY"] = 5] = "ARRAY";
    Type[Type["OBJECT"] = 6] = "OBJECT";
    Type[Type["NULL"] = 7] = "NULL";
})(Type || (Type = {}));
/**
 * The category of a rating.
 */
export var HarmCategory;
(function (HarmCategory) {
    HarmCategory[HarmCategory["HARM_CATEGORY_UNSPECIFIED"] = 0] = "HARM_CATEGORY_UNSPECIFIED";
    HarmCategory[HarmCategory["HARM_CATEGORY_HARASSMENT"] = 7] = "HARM_CATEGORY_HARASSMENT";
    HarmCategory[HarmCategory["HARM_CATEGORY_HATE_SPEECH"] = 8] = "HARM_CATEGORY_HATE_SPEECH";
    HarmCategory[HarmCategory["HARM_CATEGORY_SEXUALLY_EXPLICIT"] = 9] = "HARM_CATEGORY_SEXUALLY_EXPLICIT";
    HarmCategory[HarmCategory["HARM_CATEGORY_DANGEROUS_CONTENT"] = 10] = "HARM_CATEGORY_DANGEROUS_CONTENT";
})(HarmCategory || (HarmCategory = {}));
/**
 * The probability that a piece of content is harmful.
 */
export var HarmProbability;
(function (HarmProbability) {
    HarmProbability[HarmProbability["HARM_PROBABILITY_UNSPECIFIED"] = 0] = "HARM_PROBABILITY_UNSPECIFIED";
    HarmProbability[HarmProbability["NEGLIGIBLE"] = 1] = "NEGLIGIBLE";
    HarmProbability[HarmProbability["LOW"] = 2] = "LOW";
    HarmProbability[HarmProbability["MEDIUM"] = 3] = "MEDIUM";
    HarmProbability[HarmProbability["HIGH"] = 4] = "HIGH";
})(HarmProbability || (HarmProbability = {}));
/**
 * Block at and beyond a specified harm probability.
 */
export var HarmBlockThreshold;
(function (HarmBlockThreshold) {
    HarmBlockThreshold[HarmBlockThreshold["HARM_BLOCK_THRESHOLD_UNSPECIFIED"] = 0] = "HARM_BLOCK_THRESHOLD_UNSPECIFIED";
    HarmBlockThreshold[HarmBlockThreshold["BLOCK_LOW_AND_ABOVE"] = 1] = "BLOCK_LOW_AND_ABOVE";
    HarmBlockThreshold[HarmBlockThreshold["BLOCK_MEDIUM_AND_ABOVE"] = 2] = "BLOCK_MEDIUM_AND_ABOVE";
    HarmBlockThreshold[HarmBlockThreshold["BLOCK_ONLY_HIGH"] = 3] = "BLOCK_ONLY_HIGH";
    HarmBlockThreshold[HarmBlockThreshold["BLOCK_NONE"] = 4] = "BLOCK_NONE";
    HarmBlockThreshold[HarmBlockThreshold["OFF"] = 5] = "OFF";
})(HarmBlockThreshold || (HarmBlockThreshold = {}));
export var HarmBlockMethod;
(function (HarmBlockMethod) {
    HarmBlockMethod[HarmBlockMethod["HARM_BLOCK_METHOD_UNSPECIFIED"] = 0] = "HARM_BLOCK_METHOD_UNSPECIFIED";
    HarmBlockMethod[HarmBlockMethod["SEVERITY"] = 1] = "SEVERITY";
    HarmBlockMethod[HarmBlockMethod["PROBABILITY"] = 2] = "PROBABILITY";
})(HarmBlockMethod || (HarmBlockMethod = {}));
/**
 * Defines the reason why the model stopped generating tokens.
 */
export var FinishReason;
(function (FinishReason) {
    FinishReason[FinishReason["FINISH_REASON_UNSPECIFIED"] = 0] = "FINISH_REASON_UNSPECIFIED";
    FinishReason[FinishReason["STOP"] = 1] = "STOP";
    FinishReason[FinishReason["MAX_TOKENS"] = 2] = "MAX_TOKENS";
    FinishReason[FinishReason["SAFETY"] = 3] = "SAFETY";
    FinishReason[FinishReason["RECITATION"] = 4] = "RECITATION";
    FinishReason[FinishReason["OTHER"] = 5] = "OTHER";
    FinishReason[FinishReason["BLOCKLIST"] = 6] = "BLOCKLIST";
    FinishReason[FinishReason["PROHIBITED_CONTENT"] = 7] = "PROHIBITED_CONTENT";
    FinishReason[FinishReason["SPII"] = 8] = "SPII";
    FinishReason[FinishReason["MALFORMED_FUNCTION_CALL"] = 9] = "MALFORMED_FUNCTION_CALL";
    FinishReason[FinishReason["IMAGE_SAFETY"] = 10] = "IMAGE_SAFETY";
    FinishReason[FinishReason["IMAGE_PROHIBITED_CONTENT"] = 11] = "IMAGE_PROHIBITED_CONTENT";
    FinishReason[FinishReason["IMAGE_RECITATION"] = 12] = "IMAGE_RECITATION";
    FinishReason[FinishReason["IMAGE_OTHER"] = 13] = "IMAGE_OTHER";
    FinishReason[FinishReason["UNEXPECTED_TOOL_CALL"] = 14] = "UNEXPECTED_TOOL_CALL";
    FinishReason[FinishReason["NO_IMAGE"] = 15] = "NO_IMAGE";
})(FinishReason || (FinishReason = {}));
/**
 * The suggestion method used.
 */
export var Method;
(function (Method) {
    Method[Method["METHOD_UNSPECIFIED"] = 0] = "METHOD_UNSPECIFIED";
    Method[Method["GENERATE_CODE"] = 1] = "GENERATE_CODE";
    Method[Method["COMPLETE_CODE"] = 2] = "COMPLETE_CODE";
    Method[Method["TRANSFORM_CODE"] = 3] = "TRANSFORM_CODE";
    Method[Method["CHAT"] = 4] = "CHAT";
})(Method || (Method = {}));
/**
 * The status of the suggestion received.
 */
export var SuggestionStatus;
(function (SuggestionStatus) {
    SuggestionStatus[SuggestionStatus["STATUS_UNSPECIFIED"] = 0] = "STATUS_UNSPECIFIED";
    SuggestionStatus[SuggestionStatus["NO_ERROR"] = 1] = "NO_ERROR";
    SuggestionStatus[SuggestionStatus["ERROR"] = 2] = "ERROR";
    SuggestionStatus[SuggestionStatus["CANCELLED"] = 3] = "CANCELLED";
    SuggestionStatus[SuggestionStatus["EMPTY"] = 4] = "EMPTY";
})(SuggestionStatus || (SuggestionStatus = {}));
/**
 * The type of interaction.
 */
export var InteractionType;
(function (InteractionType) {
    InteractionType[InteractionType["INTERACTION_TYPE_UNSPECIFIED"] = 0] = "INTERACTION_TYPE_UNSPECIFIED";
    InteractionType[InteractionType["THUMBS_UP"] = 1] = "THUMBS_UP";
    InteractionType[InteractionType["THUMBS_DOWN"] = 2] = "THUMBS_DOWN";
    InteractionType[InteractionType["ACCEPT"] = 3] = "ACCEPT";
    InteractionType[InteractionType["ACCEPT_PARTIALLY"] = 4] = "ACCEPT_PARTIALLY";
    InteractionType[InteractionType["REJECT"] = 5] = "REJECT";
    InteractionType[InteractionType["COPY"] = 6] = "COPY";
})(InteractionType || (InteractionType = {}));
export var InclusionReason;
(function (InclusionReason) {
    InclusionReason[InclusionReason["INCLUSION_REASON_UNSPECIFIED"] = 0] = "INCLUSION_REASON_UNSPECIFIED";
    InclusionReason[InclusionReason["ACTIVE"] = 1] = "ACTIVE";
    InclusionReason[InclusionReason["OPEN"] = 2] = "OPEN";
    InclusionReason[InclusionReason["RECENTLY_CLOSED"] = 3] = "RECENTLY_CLOSED";
    InclusionReason[InclusionReason["RECENTLY_EDITED"] = 4] = "RECENTLY_EDITED";
    InclusionReason[InclusionReason["COLOCATED"] = 5] = "COLOCATED";
    InclusionReason[InclusionReason["RELATED"] = 6] = "RELATED";
    InclusionReason[InclusionReason["USER_SELECTED"] = 7] = "USER_SELECTED";
})(InclusionReason || (InclusionReason = {}));
/**
 * A list of reasons why content may have been blocked.
 */
export var BlockReason;
(function (BlockReason) {
    BlockReason[BlockReason["BLOCKED_REASON_UNSPECIFIED"] = 0] = "BLOCKED_REASON_UNSPECIFIED";
    BlockReason[BlockReason["SAFETY"] = 1] = "SAFETY";
    BlockReason[BlockReason["OTHER"] = 2] = "OTHER";
    BlockReason[BlockReason["BLOCKLIST"] = 3] = "BLOCKLIST";
    BlockReason[BlockReason["PROHIBITED_CONTENT"] = 4] = "PROHIBITED_CONTENT";
    BlockReason[BlockReason["IMAGE_SAFETY"] = 5] = "IMAGE_SAFETY";
})(BlockReason || (BlockReason = {}));
/**
 * Supported programming languages for the generated code.
 */
export var Language;
(function (Language) {
    Language[Language["LANGUAGE_UNSPECIFIED"] = 0] = "LANGUAGE_UNSPECIFIED";
    Language[Language["PYTHON"] = 1] = "PYTHON";
})(Language || (Language = {}));
/**
 * Enumeration of possible outcomes of the code execution.
 */
export var Outcome;
(function (Outcome) {
    Outcome[Outcome["OUTCOME_UNSPECIFIED"] = 0] = "OUTCOME_UNSPECIFIED";
    Outcome[Outcome["OUTCOME_OK"] = 1] = "OUTCOME_OK";
    Outcome[Outcome["OUTCOME_FAILED"] = 2] = "OUTCOME_FAILED";
    Outcome[Outcome["OUTCOME_DEADLINE_EXCEEDED"] = 3] = "OUTCOME_DEADLINE_EXCEEDED";
})(Outcome || (Outcome = {}));
/**
 * Defines the execution behavior for function calling.
 */
export var Mode;
(function (Mode) {
    Mode[Mode["MODE_UNSPECIFIED"] = 0] = "MODE_UNSPECIFIED";
    Mode[Mode["AUTO"] = 1] = "AUTO";
    Mode[Mode["ANY"] = 2] = "ANY";
    Mode[Mode["NONE"] = 3] = "NONE";
})(Mode || (Mode = {}));
//# sourceMappingURL=GcaTypes.js.map