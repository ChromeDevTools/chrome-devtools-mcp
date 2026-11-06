/**
 * Returns the score (1 - percentile) of `value` in a log-normal distribution
 * specified by the `median` value, at which the score will be 0.5, and a 10th
 * percentile value, at which the score will be 0.9. The score represents the
 * amount of the distribution greater than `value`. All values should be in the
 * same units (e.g. milliseconds). See
 *   https://www.desmos.com/calculator/o98tbeyt1t
 * for an interactive view of the relationship between these parameters and the
 * typical parameterization (location and shape) of the log-normal distribution.
 */
export declare function getLogNormalScore({ median, p10 }: {
    median: number;
    p10: number;
}, value: number): number;
/**
 * Interpolates the y value at a point x on the line defined by (x0, y0) and (x1, y1)
 */
export declare function linearInterpolation(x0: number, y0: number, x1: number, y1: number, x: number): number;
