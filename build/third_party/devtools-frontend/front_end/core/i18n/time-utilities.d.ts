/**
 * @file Uses Intl.NumberFormat.
 * @see go/cpq:i18n-units-design
 */
import * as Platform from '../platform/platform.js';
export declare function formatMicroSecondsTime(time: Platform.Timing.MicroSeconds): string;
export declare function formatMicroSecondsAsSeconds(time: Platform.Timing.MicroSeconds): string;
export declare function formatMicroSecondsAsMillisFixed(time: Platform.Timing.MicroSeconds): string;
export declare function formatMicroSecondsAsMillisFixedExpanded(time: Platform.Timing.MicroSeconds): string;
/**
 * @param higherResolution if true, the output may show as microsends or as milliseconds with a fractional component
 */
export declare function millisToString(ms: number, higherResolution?: boolean): string;
export declare function preciseMillisToString(ms: number, precision?: number, separator?: string): string;
export declare function preciseSecondsToString(ms: number, precision?: number): string;
export declare function secondsToString(seconds: number, higherResolution?: boolean): string;
