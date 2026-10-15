// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Root from '../root/root.js';
import { debugLog, } from './AidaClientTypes.js';
import { aidaCompletionRequestToGcaRequest, aidaDoConversationRequestToGcaRequest, aidaEventToGcaTelemetryRequest, aidaGenerateCodeRequestToGcaRequest, gcaResponseToAidaCompletionResponse, gcaResponseToAidaGenerateCodeResponse, } from './AidaGcaTranslation.js';
import * as DispatchHttpRequestClient from './DispatchHttpRequestClient.js';
const SERVICE_NAME = 'gcaService';
const ENDPOINTS = {
    CONTENT: '/v1beta:generateContent',
    SEND_TELEMETRY: '/v1beta:sendTelemetry',
    STREAM_CONTENT: '/v1beta:streamGenerateContent',
};
export class GcaClient {
    enabled() {
        return Root.Runtime.hostConfig.devToolsUseGcaApi?.enabled;
    }
    async conversationRequest(request, streamId, options) {
        try {
            const gcaRequest = aidaDoConversationRequestToGcaRequest(request);
            const response = await DispatchHttpRequestClient.makeHttpRequest({
                service: SERVICE_NAME,
                path: ENDPOINTS.STREAM_CONTENT,
                method: 'POST',
                body: JSON.stringify(gcaRequest),
                streamId,
            }, options);
            debugLog('GCA conversation request succeeded:', JSON.stringify(request), JSON.stringify(response));
        }
        catch (err) {
            debugLog('GCA request failed:', JSON.stringify(request), err);
            throw err;
        }
    }
    registerClientEvent(clientEvent) {
        const gcaEvent = aidaEventToGcaTelemetryRequest(clientEvent);
        const response = DispatchHttpRequestClient.makeHttpRequest({
            service: SERVICE_NAME,
            path: ENDPOINTS.SEND_TELEMETRY,
            method: 'POST',
            body: JSON.stringify(gcaEvent),
        });
        return response.then(result => {
            debugLog('GCA register event succeeded:', JSON.stringify(gcaEvent), JSON.stringify(result));
            return {};
        }, err => {
            debugLog('GCA register event failed:', JSON.stringify(gcaEvent), err);
            return { error: JSON.stringify(err) };
        });
    }
    async completeCode(request) {
        const gcaRequest = aidaCompletionRequestToGcaRequest(request);
        const result = await this.#requestContent(gcaRequest);
        return gcaResponseToAidaCompletionResponse(result);
    }
    async generateCode(request, options) {
        const gcaRequest = aidaGenerateCodeRequestToGcaRequest(request);
        const result = await this.#requestContent(gcaRequest, options);
        return gcaResponseToAidaGenerateCodeResponse(result);
    }
    async #requestContent(request, options) {
        try {
            const response = await DispatchHttpRequestClient.makeHttpRequest({
                service: SERVICE_NAME,
                path: ENDPOINTS.CONTENT,
                method: 'POST',
                body: JSON.stringify(request),
            }, options);
            debugLog('GCA request succeeded:', JSON.stringify(request), JSON.stringify(response));
            return response;
        }
        catch (err) {
            debugLog('GCA request failed:', JSON.stringify(request), err);
            throw err;
        }
    }
}
//# sourceMappingURL=GcaClient.js.map