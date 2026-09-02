/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {z} from 'zod';
import type {GlobalMeta} from 'zod';

export type FileVerificationOption =
  | true
  | {
      local?: boolean;
      remote?: boolean;
    };

declare module 'zod' {
  export interface ZodTypeDef {
    meta?: GlobalMeta;
  }
  export interface GlobalMeta {
    verifyFile?: FileVerificationOption;
  }
  export interface ZodType {
    meta(meta: GlobalMeta): this;
    meta(): GlobalMeta | undefined;
  }
}

function metaImpl(this: z.ZodType, meta: GlobalMeta): z.ZodType;
function metaImpl(this: z.ZodType): GlobalMeta | undefined;
function metaImpl(
  this: z.ZodType,
  meta?: GlobalMeta,
): z.ZodType | GlobalMeta | undefined {
  if (meta === undefined) {
    return this._def.meta;
  }
  this._def.meta = {...this._def.meta, ...meta};
  return this;
}
// We can remove this polyfill once we update zod to v4.
z.ZodType.prototype.meta = metaImpl;

export function getZodMeta<Key extends keyof GlobalMeta>(
  schema: z.ZodType,
  key: Key,
): GlobalMeta[Key] | undefined;
export function getZodMeta(schema: z.ZodType): GlobalMeta | undefined;
export function getZodMeta<Key extends keyof GlobalMeta>(
  schema: z.ZodType,
  key?: Key,
): GlobalMeta | GlobalMeta[Key] | undefined {
  let current: z.ZodType | undefined = schema;
  let collected: GlobalMeta | undefined;
  while (current) {
    const meta = current.meta();
    if (meta !== undefined) {
      if (key !== undefined) {
        if (meta[key] !== undefined) {
          return meta[key];
        }
      } else {
        collected = {...meta, ...collected};
      }
    }
    if (
      'innerType' in current._def &&
      current._def.innerType instanceof z.ZodType
    ) {
      current = current._def.innerType;
    } else if (
      'schema' in current._def &&
      current._def.schema instanceof z.ZodType
    ) {
      current = current._def.schema;
    } else if (
      'type' in current._def &&
      current._def.type instanceof z.ZodType
    ) {
      current = current._def.type;
    } else {
      break;
    }
  }
  return collected;
}

export function getFileVerificationOption(
  schema: z.ZodType,
): FileVerificationOption | undefined {
  return getZodMeta(schema, 'verifyFile');
}

export {z as zod};
export type * from 'zod';
