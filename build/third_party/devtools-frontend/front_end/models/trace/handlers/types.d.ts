import type * as Types from './../types/types.js';
import type * as ModelHandlers from './ModelHandlers.js';
export type FinalizeOptions = Types.Configuration.ParseOptions & {
    allTraceEvents: readonly Types.Events.Event[];
};
export interface Handler {
    reset(): void;
    handleEvent(data: object): void;
    finalize(options?: FinalizeOptions): Promise<void>;
    data(): unknown;
    deps?(): HandlerName[];
    handleUserConfig?(config: Types.Configuration.Configuration): void;
}
export type HandlerName = keyof typeof ModelHandlers;
/**
 * This type maps Handler names to the return type of their data
 * function. So, for example, if we are given an object with a key of 'foo'
 * and a value which is a TraceHandler containing a data() function that
 * returns a string, this type will be { foo: string }.
 *
 * This allows us to model the behavior of the TraceProcessor in the model,
 * which takes an object with Handlers as part of its config, and
 * which ultimately returns an object keyed off the names of the
 * Handlers, and with values that are derived from each
 * Handler's data function.
 *
 * So, concretely, we provide a Handler for calculating the #time
 * bounds of a trace called TraceBounds, whose data() function returns a
 * TraceWindow. The HandlerData, therefore, would determine that the
 * TraceProcessor would contain a key called 'TraceBounds' whose value is
 * a TraceWindow.
 **/
export type EnabledHandlerDataWithMeta<T extends Record<string, Handler>> = {
    Meta: Readonly<ReturnType<typeof ModelHandlers['Meta']['data']>>;
} & {
    [K in keyof T]: Readonly<ReturnType<T[K]['data']>>;
};
export type HandlersWithMeta<T extends Record<string, Handler>> = {
    Meta: typeof ModelHandlers.Meta;
} & {
    [K in keyof T]: T[K];
};
/**
 * Represents the final data from all of the handlers. If you instantiate a
 * TraceProcessor with a subset of handlers, you should instead use
 * `EnabledHandlerDataWithMeta<>`.
 **/
export type HandlerData = Readonly<EnabledHandlerDataWithMeta<typeof ModelHandlers>>;
type DeepWriteable<T> = {
    -readonly [P in keyof T]: DeepWriteable<T[P]>;
};
export type HandlerDataMutable = DeepWriteable<HandlerData>;
export type Handlers = typeof ModelHandlers;
export {};
