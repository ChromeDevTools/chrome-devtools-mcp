/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const BYTE_UNITS: Readonly<Record<string, number>> = {
  b: 1,
  byte: 1,
  bytes: 1,
  k: 1000,
  kb: 1000,
  kib: 1024,
  m: 1000 * 1000,
  mb: 1000 * 1000,
  mib: 1024 * 1024,
  g: 1000 * 1000 * 1000,
  gb: 1000 * 1000 * 1000,
  gib: 1024 * 1024 * 1024,
  t: 1000 * 1000 * 1000 * 1000,
  tb: 1000 * 1000 * 1000 * 1000,
  tib: 1024 * 1024 * 1024 * 1024,
};

/**
 * Parses a byte size string (e.g. "1M", "1MB", "500KB", "1.5GB", "1024") into bytes.
 */
export function parseByteSize(value: string): number {
  const trimmed = value.trim();
  if (trimmed === '') {
    throw new Error(`Invalid byte size: "${value}"`);
  }

  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?$/);
  if (!match) {
    throw new Error(
      `Invalid byte size format: "${value}". Expected a number or format like "1024", "1M", "1MB", "1G", "1GB".`,
    );
  }

  const numMatch = match[1];
  if (numMatch === undefined) {
    throw new Error(`Invalid byte size: "${value}"`);
  }
  const num = Number(numMatch);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`Invalid byte size: "${value}"`);
  }

  const unitMatch = match[2];
  if (unitMatch === undefined) {
    return Math.round(num);
  }

  const unit = unitMatch.toLowerCase();
  const multiplier = BYTE_UNITS[unit];
  if (multiplier === undefined) {
    throw new Error(
      `Unknown unit "${unitMatch}" in "${value}". Supported units: B, KB, KiB, MB, MiB, GB, GiB, TB, TiB.`,
    );
  }

  return Math.round(num * multiplier);
}
