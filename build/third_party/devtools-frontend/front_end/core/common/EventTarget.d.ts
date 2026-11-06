import type * as Platform from '../platform/platform.js';
export interface EventDescriptor<Events = any, T extends keyof Events = any> {
    eventTarget: EventTarget<Events>;
    eventType: T;
    thisObject?: Object;
    listener: EventListener<Events, T>;
}
export declare function removeEventListeners(eventList: EventDescriptor[]): void;
export type GenericEvents = Record<string, any>;
export type EventPayloadToRestParameters<Events, T extends keyof Events> = Events[T] extends void ? [] : [Events[T]];
export type EventListener<Events, T extends keyof Events> = (arg0: EventTargetEvent<Events[T], Events>) => void;
export interface EventTarget<Events> {
    addEventListener<T extends keyof Events>(eventType: T, listener: EventListener<Events, T>, thisObject?: Object): EventDescriptor<Events, T>;
    once<T extends keyof Events>(eventType: T): Promise<Events[T]>;
    removeEventListener<T extends keyof Events>(eventType: T, listener: EventListener<Events, T>, thisObject?: Object): void;
    hasEventListeners(eventType: keyof Events): boolean;
    dispatchEventToListeners<T extends keyof Events>(eventType: Platform.TypeScriptUtilities.NoUnion<T>, ...[eventData]: EventPayloadToRestParameters<Events, T>): void;
}
export interface EventTargetEvent<T, Events = any> {
    data: T;
    source?: EventTarget<Events>;
}
