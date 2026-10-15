// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
// Lifted from Lighthouse: https://github.com/GoogleChrome/lighthouse/blob/36cac182a6c637b1671c57326d7c0241633d0076/shared/statistics.js
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
// The exact double values for the max and min scores possible in each range.
const MIN_PASSING_SCORE = 0.90000000000000002220446049250313080847263336181640625;
const MAX_AVERAGE_SCORE = 0.899999999999999911182158029987476766109466552734375;
const MIN_AVERAGE_SCORE = 0.5;
const MAX_FAILING_SCORE = 0.499999999999999944488848768742172978818416595458984375;
/**
 * Approximates the Gauss error function, the probability that a random variable
 * from the standard normal distribution lies within [-x, x]. Moved from
 * traceviewer.b.math.erf, based on Abramowitz and Stegun, formula 7.1.26.
 */
function erf(x) {
    // erf(-x) = -erf(x);
    const sign = Math.sign(x);
    x = Math.abs(x);
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const t = 1 / (1 + p * x);
    const y = t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5))));
    return sign * (1 - y * Math.exp(-x * x));
}
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
export function getLogNormalScore({ median, p10 }, value) {
    // Required for the log-normal distribution.
    if (median <= 0) {
        throw new Error('median must be greater than zero');
    }
    if (p10 <= 0) {
        throw new Error('p10 must be greater than zero');
    }
    // Not strictly required, but if p10 > median, it flips around and becomes the p90 point.
    if (p10 >= median) {
        throw new Error('p10 must be less than the median');
    }
    // Non-positive values aren't in the distribution, so always 1.
    if (value <= 0) {
        return 1;
    }
    // Closest double to `erfc-1(1/5)`.
    const INVERSE_ERFC_ONE_FIFTH = 0.9061938024368232;
    // Shape (σ) is `|log(p10/median) / (sqrt(2)*erfc^-1(1/5))|` and
    // standardizedX is `1/2 erfc(log(value/median) / (sqrt(2)*σ))`, so simplify a bit.
    const xRatio = Math.max(Number.MIN_VALUE, value / median); // value and median are > 0, so is ratio.
    const xLogRatio = Math.log(xRatio);
    const p10Ratio = Math.max(Number.MIN_VALUE, p10 / median); // p10 and median are > 0, so is ratio.
    const p10LogRatio = -Math.log(p10Ratio); // negate to keep σ positive.
    const standardizedX = xLogRatio * INVERSE_ERFC_ONE_FIFTH / p10LogRatio;
    const complementaryPercentile = (1 - erf(standardizedX)) / 2;
    // Clamp to avoid floating-point out-of-bounds issues and keep score in expected range.
    let score;
    if (value <= p10) {
        // Passing. Clamp to [0.9, 1].
        score = Math.max(MIN_PASSING_SCORE, Math.min(1, complementaryPercentile));
    }
    else if (value <= median) {
        // Average. Clamp to [0.5, 0.9).
        score = Math.max(MIN_AVERAGE_SCORE, Math.min(MAX_AVERAGE_SCORE, complementaryPercentile));
    }
    else {
        // Failing. Clamp to [0, 0.5).
        score = Math.max(0, Math.min(MAX_FAILING_SCORE, complementaryPercentile));
    }
    return score;
}
/**
 * Interpolates the y value at a point x on the line defined by (x0, y0) and (x1, y1)
 */
export function linearInterpolation(x0, y0, x1, y1, x) {
    const slope = (y1 - y0) / (x1 - x0);
    return y0 + (x - x0) * slope;
}
//# sourceMappingURL=Statistics.js.map