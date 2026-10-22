import { type AidaRegisterClientEvent, type CompletionRequest, type CompletionResponse, type DoConversationRequest, type GenerateCodeRequest, type GenerateCodeResponse } from './AidaClientTypes.js';
import type { AidaClientResult } from './InspectorFrontendHostAPI.js';
export declare class GcaClient {
    #private;
    enabled(): boolean | undefined;
    conversationRequest(request: DoConversationRequest, streamId: number, options?: {
        signal?: AbortSignal;
    }): Promise<void>;
    registerClientEvent(clientEvent: AidaRegisterClientEvent): Promise<AidaClientResult>;
    completeCode(request: CompletionRequest): Promise<CompletionResponse>;
    generateCode(request: GenerateCodeRequest, options?: {
        signal?: AbortSignal;
    }): Promise<GenerateCodeResponse>;
}
