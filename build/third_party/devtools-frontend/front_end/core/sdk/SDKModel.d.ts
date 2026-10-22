import * as Common from '../common/common.js';
import type { Target } from './Target.js';
export interface RegistrationInfo {
    capabilities: number;
    autostart: boolean;
    early?: boolean;
}
export type SDKModelConstructor<T extends SDKModel = SDKModel> = new (target: Target) => T;
declare const registeredModels: Map<SDKModelConstructor, RegistrationInfo>;
export declare class SDKModel<Events = any> extends Common.ObjectWrapper.ObjectWrapper<Events> {
    #private;
    constructor(target: Target);
    target(): Target;
    /**
     * Override this method to perform tasks that are required to suspend the
     * model and that still need other models in an unsuspended state.
     */
    preSuspendModel(_reason?: string): Promise<void>;
    suspendModel(_reason?: string): Promise<void>;
    resumeModel(): Promise<void>;
    /**
     * Override this method to perform tasks that are required to after resuming
     * the model and that require all models already in an unsuspended state.
     */
    postResumeModel(): Promise<void>;
    dispose(): void;
    static register(modelClass: SDKModelConstructor, registrationInfo: RegistrationInfo): void;
    static get registeredModels(): typeof registeredModels;
}
export {};
