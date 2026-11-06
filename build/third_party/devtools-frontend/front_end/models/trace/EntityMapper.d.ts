import type * as Platform from '../../core/platform/platform.js';
import type * as Protocol from '../../generated/protocol.js';
import * as Handlers from './handlers/handlers.js';
import type { ParsedTrace } from './ModelImpl.js';
import type * as Types from './types/types.js';
export declare class EntityMapper {
    #private;
    constructor(parsedTrace: ParsedTrace);
    static getOrCreate(parsedTrace: ParsedTrace): EntityMapper;
    /**
     * Returns an entity for a given event if any.
     */
    entityForEvent(event: Types.Events.Event): Handlers.Helpers.Entity | null;
    /**
     * Returns trace events that correspond with a given entity if any.
     */
    eventsForEntity(entity: Handlers.Helpers.Entity): Types.Events.Event[];
    firstPartyEntity(): Handlers.Helpers.Entity | null;
    thirdPartyEvents(): Types.Events.Event[];
    mappings(): Handlers.Helpers.EntityMappings;
    /**
     * This updates entity mapping given a callFrame and sourceURL (newly resolved),
     * updating both eventsByEntity and entityByEvent. The call frame provides us the
     * URL and sourcemap source location that events map to. This describes the exact events we
     * want to update. We then update the events with the new sourceURL.
     *
     * compiledURLs -> the actual file's url (e.g. my-big-bundle.min.js)
     * sourceURLs -> the resolved urls (e.g. react.development.js, my-app.ts)
     * @param callFrame
     * @param sourceURL
     */
    updateSourceMapEntities(callFrame: Protocol.Runtime.CallFrame, sourceURL: string): void;
    updateExtensionEntitiesWithName(executionContextNamesByOrigin: Map<Platform.DevToolsPath.UrlString, string>): void;
}
