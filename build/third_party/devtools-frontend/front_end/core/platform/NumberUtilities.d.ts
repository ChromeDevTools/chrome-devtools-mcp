export declare const clamp: (num: number, min: number, max: number) => number;
export declare const mod: (m: number, n: number) => number;
export declare const toFixedIfFloating: (value: string) => string;
/**
 * Rounds a number (including float) down.
 */
export declare const floor: (value: number, precision?: number) => number;
/**
 * Computes the great common divisor for two numbers.
 * If the numbers are floats, they will be rounded to an integer.
 */
export declare const greatestCommonDivisor: (a: number, b: number) => number;
export declare const aspectRatio: (width: number, height: number) => string;
export declare const withThousandsSeparator: (num: number) => string;
