import type * as Handlers from '../handlers/handlers.js';
import * as Types from '../types/types.js';
export declare abstract class TraceFilter {
    abstract accept(_event: Types.Events.Event, handlerData?: Handlers.Types.HandlerData): boolean;
}
export declare class VisibleEventsFilter extends TraceFilter {
    private readonly visibleTypes;
    constructor(visibleTypes: string[]);
    accept(event: Types.Events.Event): boolean;
    static eventType(event: Types.Events.Event): Types.Events.Name;
}
export declare class InvisibleEventsFilter extends TraceFilter {
    #private;
    constructor(invisibleTypes: Types.Events.Name[]);
    accept(event: Types.Events.Event): boolean;
}
export declare class ExclusiveNameFilter extends TraceFilter {
    #private;
    constructor(excludeNames: Types.Events.Name[]);
    accept(event: Types.Events.Event): boolean;
}
