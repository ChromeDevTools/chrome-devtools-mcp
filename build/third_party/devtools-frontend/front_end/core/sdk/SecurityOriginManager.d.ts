import { SDKModel } from './SDKModel.js';
export declare class SecurityOriginManager extends SDKModel<EventTypes> {
    #private;
    updateSecurityOrigins(securityOrigins: Set<string>): void;
    securityOrigins(): string[];
    mainSecurityOrigin(): string;
    unreachableMainSecurityOrigin(): string | null;
    setMainSecurityOrigin(securityOrigin: string, unreachableSecurityOrigin: string): void;
}
export declare enum Events {
    SecurityOriginAdded = "SecurityOriginAdded",
    SecurityOriginRemoved = "SecurityOriginRemoved",
    MainSecurityOriginChanged = "MainSecurityOriginChanged"
}
export interface MainSecurityOriginChangedEvent {
    mainSecurityOrigin: string;
    unreachableMainSecurityOrigin: string | null;
}
export interface EventTypes {
    [Events.SecurityOriginAdded]: string;
    [Events.SecurityOriginRemoved]: string;
    [Events.MainSecurityOriginChanged]: MainSecurityOriginChangedEvent;
}
