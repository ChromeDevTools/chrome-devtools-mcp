import * as Common from '../common/common.js';
import { AidaAccessPreconditions, type AidaRegisterClientEvent, ClientFeature, type CompletionRequest, type CompletionResponse, type DoConversationRequest, type DoConversationResponse, type GenerateCodeRequest, type GenerateCodeResponse, UserTier } from './AidaClientTypes.js';
import type { AidaClientResult } from './InspectorFrontendHostAPI.js';
export * from './AidaClientTypes.js';
export declare const CLIENT_NAME = "CHROME_DEVTOOLS";
export declare const SERVICE_NAME = "aidaService";
export declare abstract class AidaClientError extends Error {
    name: string;
}
export declare class AidaUnknownError extends AidaClientError {
    name: string;
}
export declare class AidaAbortError extends AidaClientError {
    name: string;
}
export declare class AidaBlockError extends AidaClientError {
    name: string;
}
export declare class AidaQuotaError extends AidaClientError {
    name: string;
}
export declare class AidaPayloadTooLargeError extends AidaClientError {
    name: string;
}
export declare class AidaPermissionDeniedError extends AidaClientError {
    name: string;
}
export declare class AidaTimeoutError extends AidaClientError {
    name: string;
}
export declare class AidaInvalidJsonResponseError extends AidaClientError {
    name: string;
}
export declare class AidaClient {
    #private;
    static buildConsoleInsightsRequest(input: string): DoConversationRequest;
    static checkAccessPreconditions(): Promise<AidaAccessPreconditions>;
    doConversation(request: DoConversationRequest, options?: {
        signal?: AbortSignal;
    }): AsyncGenerator<DoConversationResponse, void, void>;
    registerClientEvent(clientEvent: AidaRegisterClientEvent): Promise<AidaClientResult>;
    completeCode(request: CompletionRequest): Promise<CompletionResponse | null>;
    generateCode(request: GenerateCodeRequest, options?: {
        signal?: AbortSignal;
    }): Promise<GenerateCodeResponse>;
}
export declare function convertToUserTierEnum(userTier: string | undefined): UserTier;
export declare function getClientFeatureName(feature: ClientFeature): string;
export declare class HostConfigTracker extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    #private;
    get aidaAvailability(): AidaAccessPreconditions | undefined;
    static instance({ forceNew }?: {
        forceNew: boolean;
    }): HostConfigTracker;
    dispose(): void;
    static removeInstance(): void;
    addEventListener(eventType: Events, listener: Common.EventTarget.EventListener<EventTypes, Events>): Common.EventTarget.EventDescriptor<EventTypes>;
    removeEventListener(eventType: Events, listener: Common.EventTarget.EventListener<EventTypes, Events>): void;
    pollAidaAvailability(): Promise<void>;
}
export declare const enum Events {
    AIDA_AVAILABILITY_CHANGED = "aidaAvailabilityChanged"
}
export interface EventTypes {
    [Events.AIDA_AVAILABILITY_CHANGED]: AidaAccessPreconditions;
}
export declare function isQuotaError(...inputs: Array<string | undefined>): boolean;
export declare function isPayloadTooLargeError(...inputs: Array<string | undefined>): boolean;
/**
 * Maps AIDA-specific errors, DispatchHttpRequestErrors, strings, and generic
 * Errors to dedicated AidaClientError subclasses.
 */
export declare function mapError(err: unknown, detail?: string): AidaClientError;
