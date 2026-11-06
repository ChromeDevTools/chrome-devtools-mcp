import type * as Handlers from '../handlers/handlers.js';
import type * as Types from '../types/types.js';
export interface Data {
    zeroTime: Types.Timing.Micro;
    spanTime: Types.Timing.Micro;
    frames: readonly Frame[];
}
export interface Frame {
    screenshotEvent: Types.Events.LegacySyntheticScreenshot | Types.Events.Screenshot;
    index: number;
}
export type HandlersWithFilmStrip = Handlers.Types.HandlersWithMeta<{
    Screenshots: typeof Handlers.ModelHandlers.Screenshots;
}>;
export type HandlerDataWithScreenshots = Handlers.Types.EnabledHandlerDataWithMeta<{
    Screenshots: typeof Handlers.ModelHandlers.Screenshots;
}>;
export declare function fromHandlerData(data: HandlerDataWithScreenshots, customZeroTime?: Types.Timing.Micro): Data;
export declare function frameClosestToTimestamp(filmStrip: Data, searchTimestamp: Types.Timing.Micro): Frame | null;
