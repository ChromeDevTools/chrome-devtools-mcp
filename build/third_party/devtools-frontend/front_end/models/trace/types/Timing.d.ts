export type Micro = number & {
    _tag: 'MicroSeconds';
};
export declare function Micro(value: number): Micro;
export type Milli = number & {
    _tag: 'MilliSeconds';
};
export declare function Milli(value: number): Milli;
export type Seconds = number & {
    _tag: 'Seconds';
};
export declare function Seconds(value: number): Seconds;
export interface TraceWindow<TimeFormat extends Micro | Milli> {
    min: TimeFormat;
    max: TimeFormat;
    range: TimeFormat;
}
/** See front_end/models/trace/helpers/Timing.ts for helpful utility functions like traceWindowFromMicroSeconds **/
export type TraceWindowMicro = TraceWindow<Micro>;
export type TraceWindowMilli = TraceWindow<Milli>;
