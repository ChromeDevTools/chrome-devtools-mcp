import type { Brand } from './Brand.js';
export type Seconds = Brand<number, 'Seconds'>;
export type MilliSeconds = Brand<number, 'MilliSeconds'>;
export type MicroSeconds = Brand<number, 'MicroSeconds'>;
export declare function milliSecondsToSeconds(x: MilliSeconds): Seconds;
export declare function microSecondsToMilliSeconds(x: MicroSeconds): MilliSeconds;
