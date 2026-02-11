/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const LATENCY_BUCKETS = [50, 100, 250, 500, 1000, 2500, 5000, 10000];

export function bucketizeLatency(latencyMs: number): number {
  for (const bucket of LATENCY_BUCKETS) {
    if (latencyMs <= bucket) {
      return bucket;
    }
  }
  return LATENCY_BUCKETS[LATENCY_BUCKETS.length - 1];
}
