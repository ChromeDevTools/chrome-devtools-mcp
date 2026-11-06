// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as AIDA from './AidaClientTypes.js';
import * as GCA from './GcaTypes.js';
function createBaseGcaRequest(request, contents, experience) {
    const gcaRequest = { contents, aicode: { experience } };
    mapCommonAidaRequestFields(request, gcaRequest);
    buildLabels(request, gcaRequest);
    if ('preamble' in request && request.preamble) {
        gcaRequest.systemInstruction = {
            role: 'user',
            parts: [{ text: request.preamble }],
        };
    }
    return gcaRequest;
}
export function aidaDoConversationRequestToGcaRequest(request) {
    try {
        const contents = [];
        if (request.facts) {
            contents.push(convertAidaFactsToGcaContent(request.facts));
        }
        if (request.historical_contexts) {
            contents.push(...(request.historical_contexts).map(convertAidaContentToGcaContent));
        }
        contents.push(convertAidaContentToGcaContent(request.current_message));
        const gcaRequest = createBaseGcaRequest(request, contents, 'chat_console_insights');
        if (request.function_declarations) {
            gcaRequest.tools = [{
                    functionDeclarations: (request.function_declarations).map(fd => ({
                        name: fd.name,
                        description: fd.description,
                        parameters: convertAidaParamToGcaSchema(fd.parameters),
                    })),
                }];
        }
        AIDA.debugLog('Translation succeeded:', JSON.stringify(request), JSON.stringify(gcaRequest));
        return gcaRequest;
    }
    catch (e) {
        AIDA.debugLog('Translation error:', JSON.stringify(request), e);
        throw e;
    }
}
function mapCommonAidaRequestFields(aidaRequest, gcaRequest) {
    if (aidaRequest.options?.model_id) {
        gcaRequest.model = aidaRequest.options.model_id;
    }
    if (aidaRequest.options?.temperature !== undefined) {
        gcaRequest.generationConfig = {
            ...gcaRequest.generationConfig,
            temperature: aidaRequest.options.temperature,
        };
    }
}
export function gcaResponseToAidaDoConversationResponse(response) {
    const functionCalls = [];
    if (response.candidates?.[0].content?.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.functionCall) {
                const functionCall = {
                    name: part.functionCall.name,
                    args: part.functionCall.args || {},
                };
                if (part.thoughtSignature) {
                    functionCall.thoughtSignature = part.thoughtSignature;
                }
                functionCalls.push(functionCall);
            }
        }
    }
    return {
        explanation: extractTextFromGcaParts(response.candidates[0].content?.parts),
        metadata: {
            rpcGlobalId: response.responseId,
        },
        functionCalls: functionCalls.length > 0 ? functionCalls :
            undefined,
        completed: true,
    };
}
function extractTextFromGcaParts(parts) {
    if (!parts) {
        return '';
    }
    return parts.map(p => p.text || '').join('');
}
export function aidaEventToGcaTelemetryRequest(clientEvent) {
    try {
        const feedbackMetrics = [];
        const responseId = String(clientEvent.corresponding_aida_rpc_global_id);
        const eventTime = new Date().toISOString();
        if (clientEvent.do_conversation_client_event) {
            const feedback = clientEvent.do_conversation_client_event.user_feedback;
            if (feedback.sentiment) {
                let interaction = GCA.InteractionType.INTERACTION_TYPE_UNSPECIFIED;
                if (feedback.sentiment === "POSITIVE" /* AIDA.Rating.POSITIVE */) {
                    interaction = GCA.InteractionType.THUMBS_UP;
                }
                else if (feedback.sentiment === "NEGATIVE" /* AIDA.Rating.NEGATIVE */) {
                    interaction = GCA.InteractionType.THUMBS_DOWN;
                }
                feedbackMetrics.push({
                    eventTime,
                    responseId,
                    suggestionInteraction: { interaction },
                });
            }
        }
        feedbackMetrics.push(...convertCodeTelemetry(clientEvent.complete_code_client_event, GCA.Method.COMPLETE_CODE, responseId, eventTime));
        feedbackMetrics.push(...convertCodeTelemetry(clientEvent.generate_code_client_event, GCA.Method.GENERATE_CODE, responseId, eventTime));
        const gcaTelemetryRequest = {
            feedbackMetrics,
        };
        AIDA.debugLog('Translation succeeded:', JSON.stringify(clientEvent), JSON.stringify(gcaTelemetryRequest));
        return gcaTelemetryRequest;
    }
    catch (e) {
        AIDA.debugLog('Translation error:', JSON.stringify(clientEvent), e);
        throw e;
    }
}
/* eslint-disable @typescript-eslint/naming-convention */
function convertCodeTelemetry(event, method, responseId, eventTime) {
    if (!event) {
        return [];
    }
    if ('user_impression' in event && event.user_impression) {
        const impression = event.user_impression;
        return [{
                eventTime,
                responseId,
                suggestionOffered: {
                    method,
                    status: GCA.SuggestionStatus.NO_ERROR,
                    responseLatency: `${impression.latency.duration.seconds + impression.latency.duration.nanos / 1e9}s`,
                },
            }];
    }
    if ('user_acceptance' in event && event.user_acceptance) {
        const acceptance = event.user_acceptance;
        return [{
                eventTime,
                responseId,
                suggestionInteraction: {
                    interaction: GCA.InteractionType.ACCEPT,
                    candidateIndex: acceptance.sample.sample_id,
                },
            }];
    }
    return [];
}
/* eslint-enable @typescript-eslint/naming-convention */
export function aidaCompletionRequestToGcaRequest(request) {
    try {
        let additionalFiles = (request.additional_files ?? []).map(f => ({
            fileUri: f.path,
            inclusionReason: [AidaReasonToGcaInclusionReason[f.included_reason]],
            segments: [{ content: f.content, isSelected: false }],
        }));
        const inEditorFile = inFileEditRequestToSourceFile(request);
        if (inEditorFile) {
            additionalFiles = [inEditorFile, ...additionalFiles];
        }
        const gcaRequest = createBaseGcaRequest(request, [], 'complete_code');
        gcaRequest.aicode.files = additionalFiles;
        if (request.options?.stop_sequences) {
            gcaRequest.generationConfig = {
                ...gcaRequest.generationConfig,
                stopSequences: request.options.stop_sequences,
            };
        }
        AIDA.debugLog('Translation succeeded:', JSON.stringify(request), JSON.stringify(gcaRequest));
        return gcaRequest;
    }
    catch (e) {
        AIDA.debugLog('Translation error:', JSON.stringify(request), e);
        throw e;
    }
}
function inFileEditRequestToSourceFile(request) {
    const sourceFile = {
        inclusionReason: [GCA.InclusionReason.ACTIVE],
        fileUri: 'devtools-code-completion',
        segments: [
            {
                content: request.prefix,
                isSelected: false,
            },
            {
                content: '',
                isSelected: true, // Cursor position
            },
        ],
    };
    if (request.suffix) {
        sourceFile.segments?.push({
            content: request.suffix,
            isSelected: false,
        });
    }
    return sourceFile;
}
/**
 * Sanitizes a label value to conform to the GCP label value regex constraint:
 * `[\p{Ll}\p{Lo}\p{N}_-]{0,63}`
 *
 * This converts the value to lowercase, replaces any character that is not a
 * lowercase letter, digit, underscore, or hyphen with an underscore, and
 * truncates the value to 63 characters.
 */
function sanitizeLabelValue(value) {
    return value.toLowerCase().replace(/[^\p{Ll}\p{Lo}\p{N}_-]/gu, '_').substring(0, 63);
}
/* eslint-disable @typescript-eslint/naming-convention */
function buildLabels(request, gcaRequest) {
    const labels = {};
    if (request.client) {
        labels['client'] = request.client;
    }
    if ('functionality_type' in request && request.functionality_type !== undefined) {
        labels['functionality_type'] = AIDA.FunctionalityType[request.functionality_type];
    }
    if ('client_feature' in request && request.client_feature !== undefined) {
        labels['client_feature'] = AIDA.ClientFeature[request.client_feature];
    }
    if ('last_user_action' in request && request.last_user_action !== undefined) {
        labels['last_user_action'] = AIDA.EditType[request.last_user_action];
    }
    if ('use_case' in request && request.use_case !== undefined) {
        labels['use_case'] = AIDA.UseCase[request.use_case];
    }
    if (request.metadata.string_session_id) {
        labels['session_id'] = request.metadata.string_session_id;
    }
    const options = request.options;
    if (options?.inference_language) {
        labels['inference_language'] = options.inference_language;
    }
    if (options?.expect_code_output !== undefined) {
        labels['expect_code_output'] = String(options.expect_code_output);
    }
    if (request.metadata.disable_user_content_logging !== undefined) {
        labels['disable_user_content_logging'] = String(request.metadata.disable_user_content_logging);
    }
    if (request.metadata.client_version) {
        labels['client_version'] = request.metadata.client_version;
    }
    if (Object.keys(labels).length > 0) {
        const sanitizedLabels = {};
        for (const [key, value] of Object.entries(labels)) {
            sanitizedLabels[key] = sanitizeLabelValue(value);
        }
        gcaRequest.labels = sanitizedLabels;
    }
}
/* eslint-enable @typescript-eslint/naming-convention */
const AidaReasonToGcaInclusionReason = {
    [AIDA.Reason.UNKNOWN]: GCA.InclusionReason.INCLUSION_REASON_UNSPECIFIED,
    [AIDA.Reason.CURRENTLY_OPEN]: GCA.InclusionReason.OPEN,
    // Intentional mapping due to type mismatch
    // TODO(liviurau): find a way to validate this mapping
    [AIDA.Reason.RECENTLY_OPENED]: GCA.InclusionReason.RECENTLY_CLOSED,
    [AIDA.Reason.RECENTLY_EDITED]: GCA.InclusionReason.RECENTLY_EDITED,
    [AIDA.Reason.COLOCATED]: GCA.InclusionReason.COLOCATED,
    [AIDA.Reason.RELATED_FILE]: GCA.InclusionReason.RELATED,
};
export function gcaResponseToAidaCompletionResponse(response) {
    try {
        const { samples, metadata } = gcaResponseToAidaSamplesAndMetadata(response);
        const aidaResponse = {
            generatedSamples: samples,
            metadata,
        };
        AIDA.debugLog('Translation succeeded:', JSON.stringify(response), JSON.stringify(aidaResponse));
        return aidaResponse;
    }
    catch (e) {
        AIDA.debugLog('Translation error', JSON.stringify(response), e);
        throw e;
    }
}
function gcaResponseToAidaSamplesAndMetadata(response) {
    return {
        samples: (response.candidates ?? []).map(gcaCandidateToAidaGenerationSample),
        metadata: {
            rpcGlobalId: response.responseId,
        },
    };
}
export function aidaGenerateCodeRequestToGcaRequest(request) {
    try {
        const gcaRequest = createBaseGcaRequest(request, [convertAidaContentToGcaContent(request.current_message)], 'generate_code');
        if (request.context_files) {
            gcaRequest.aicode.files = (request.context_files).map(f => ({
                fileUri: f.path,
                programmingLanguage: f.programming_language,
            }));
        }
        AIDA.debugLog('Translation succeeded:', JSON.stringify(request), JSON.stringify(gcaRequest));
        return gcaRequest;
    }
    catch (e) {
        AIDA.debugLog('Translation error', JSON.stringify(request), e);
        throw e;
    }
}
export function gcaResponseToAidaGenerateCodeResponse(response) {
    try {
        const aidaResponse = gcaResponseToAidaSamplesAndMetadata(response);
        AIDA.debugLog('Translation succeeded:', JSON.stringify(response), JSON.stringify(aidaResponse));
        return aidaResponse;
    }
    catch (e) {
        AIDA.debugLog('translation error', JSON.stringify(response), e);
        throw e;
    }
}
function gcaCandidateToAidaGenerationSample(candidate) {
    const generationSample = {
        generationString: extractTextFromGcaParts(candidate.content?.parts),
        score: 0,
        sampleId: candidate.index,
    };
    if (candidate.citationMetadata) {
        generationSample.attributionMetadata = {
            attributionAction: AIDA.RecitationAction.CITE,
            citations: (candidate.citationMetadata.citations ?? []).map(c => ({
                startIndex: c.startIndex,
                endIndex: c.endIndex,
                uri: c.uri,
            })),
        };
    }
    return generationSample;
}
function convertAidaFactsToGcaContent(facts) {
    return {
        role: 'user',
        parts: facts.map(fact => {
            return { text: `[source: ${fact.metadata.source}] ${fact.text}` };
        }),
    };
}
function convertAidaContentToGcaContent(content) {
    // TODO(liviurau): decide how to map AIDA.Role.SYSTEM
    // currently it will default to 'user'
    let role = 'user';
    if (content.role === AIDA.Role.MODEL) {
        role = 'model';
    }
    return {
        role,
        parts: (content.parts ?? []).map(convertAidaPartToGcaPart),
    };
}
function convertAidaPartToGcaPart(part) {
    if ('text' in part) {
        return { text: part.text };
    }
    if ('functionCall' in part) {
        const gcaPart = {
            functionCall: {
                name: part.functionCall.name,
                args: part.functionCall.args,
            },
        };
        if (part.functionCall.thoughtSignature) {
            gcaPart.thoughtSignature = part.functionCall.thoughtSignature;
        }
        return gcaPart;
    }
    if ('functionResponse' in part) {
        const fResponse = {};
        if ('result' in part.functionResponse.response) {
            fResponse.output = part.functionResponse.response['result'];
        }
        else if ('output' in part.functionResponse.response) {
            fResponse.output = part.functionResponse.response['output'];
        }
        else if (!('error' in part.functionResponse.response)) {
            fResponse.output = part.functionResponse.response;
        }
        if ('error' in part.functionResponse.response) {
            fResponse.error = part.functionResponse.response['error'];
        }
        return {
            functionResponse: {
                name: part.functionResponse.name,
                response: fResponse,
            },
        };
    }
    if ('inlineData' in part) {
        return {
            inlineData: {
                mimeType: part.inlineData.mimeType,
                data: part.inlineData.data,
            },
        };
    }
    return {};
}
function convertAidaParamToGcaSchema(param) {
    const schema = {
        type: param.type,
        description: param.description,
    };
    if (param.nullable) {
        schema.nullable = param.nullable;
    }
    if (param.type === 5 /* AIDA.ParametersTypes.ARRAY */ && param.items) {
        schema.items = convertAidaParamToGcaSchema(param.items);
    }
    else if (param.type === 6 /* AIDA.ParametersTypes.OBJECT */ && param.properties) {
        schema.properties = {};
        for (const [key, value] of Object.entries(param.properties)) {
            schema.properties[key] = convertAidaParamToGcaSchema(value);
        }
        schema.required = (param.required ?? []).map(r => r.toString());
    }
    return schema;
}
export function gcaChunkResponseToAidaChunkResponse(response) {
    try {
        if (response.error) {
            throw new Error(JSON.stringify(response.error));
        }
        const candidate = response.candidates?.[0];
        const parts = candidate?.content?.parts || [];
        const metadata = {
            rpcGlobalId: response.responseId,
            inferenceOptionMetadata: { modelId: response.modelVersion },
        };
        if (candidate?.citationMetadata?.citations) {
            metadata.attributionMetadata = {
                attributionAction: AIDA.RecitationAction.CITE,
                citations: candidate.citationMetadata.citations.map(c => ({
                    startIndex: c.startIndex,
                    endIndex: c.endIndex,
                    uri: c.uri,
                })),
            };
        }
        const chunks = parts.map(part => {
            const aidaChunkResponse = { metadata };
            if (part.text !== undefined) {
                aidaChunkResponse.textChunk = {
                    text: extractTextFromGcaParts(parts),
                };
            }
            if (part.functionCall) {
                aidaChunkResponse.functionCallChunk = {
                    functionCall: {
                        name: part.functionCall.name,
                        args: part.functionCall.args || {},
                    },
                };
                if (part.thoughtSignature) {
                    aidaChunkResponse.functionCallChunk.functionCall.thoughtSignature = part.thoughtSignature;
                }
            }
            if (part.executableCode) {
                aidaChunkResponse.codeChunk = {
                    code: part.executableCode.code,
                    inferenceLanguage: part.executableCode.language ? "PYTHON" /* AIDA.AidaInferenceLanguage.PYTHON */ : "UNKNOWN" /* AIDA.AidaInferenceLanguage.UNKNOWN */,
                };
            }
            return aidaChunkResponse;
        });
        AIDA.debugLog('Translation succeeded:', JSON.stringify(response), JSON.stringify(chunks));
        return chunks;
    }
    catch (e) {
        AIDA.debugLog('Translation error', JSON.stringify(response), e);
        throw e;
    }
}
//# sourceMappingURL=AidaGcaTranslation.js.map