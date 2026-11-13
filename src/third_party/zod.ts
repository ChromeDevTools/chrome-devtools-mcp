/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Export all Zod types, but only the runtime values used in this repository so
// that bundlers tree-shake unused exports (such as the 64 locale tables).
export type * from 'zod';
export {
  array,
  boolean,
  coerce,
  enum,
  lazy,
  literal,
  NEVER,
  number,
  object,
  record,
  string,
  toJSONSchema,
  union,
  unknown,
  url,
  ZodError,
} from 'zod';
