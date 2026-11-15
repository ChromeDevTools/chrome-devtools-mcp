/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';

import type {CookieData} from '../third_party/browser.js';
import {zod} from '../third_party/index.js';

const cookiesSchema = zod.array(
  zod.object({
    name: zod.string(),
    value: zod.string(),
    domain: zod.string().min(1),
    path: zod.string().optional(),
    secure: zod.boolean().optional(),
    httpOnly: zod.boolean().optional(),
    sameSite: zod.enum(['Strict', 'Lax', 'None', 'Default']).optional(),
    expires: zod.number().optional(),
    priority: zod.enum(['Low', 'Medium', 'High']).optional(),
    sourceScheme: zod.enum(['Unset', 'NonSecure', 'Secure']).optional(),
    partitionKey: zod
      .string()
      .or(
        zod.object({
          sourceOrigin: zod.string(),
          hasCrossSiteAncestor: zod.boolean().optional(),
        }),
      )
      .optional(),
  }),
);

export async function readCookiesFile(filePath: string): Promise<CookieData[]> {
  let contents: string;
  try {
    contents = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    const code =
      error instanceof Error && 'code' in error ? ` (${error.code})` : '';
    throw new Error(`Unable to read cookies file "${filePath}"${code}.`);
  }

  let data: unknown;
  try {
    data = JSON.parse(contents.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error(`Cookies file "${filePath}" must contain valid JSON.`);
  }
  const result = cookiesSchema.safeParse(data);
  if (!result.success) {
    throw new Error(
      `Cookies file "${filePath}" must contain a Puppeteer CookieData array.`,
    );
  }
  return result.data;
}
