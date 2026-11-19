/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';

import type {CookieData} from '../third_party/browser.js';
import {zod} from '../third_party/index.js';

import {parseJsonFile} from './json.js';

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

function formatIssuePath(
  path: ReadonlyArray<string | number | symbol>,
): string {
  return path
    .map((key, index) =>
      typeof key === 'number'
        ? `[${key}]`
        : index === 0
          ? String(key)
          : `.${String(key)}`,
    )
    .join('');
}

export async function readCookiesFile(filePath: string): Promise<CookieData[]> {
  let contents: string;
  try {
    contents = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    const code =
      error instanceof Error && 'code' in error ? ` (${error.code})` : '';
    throw new Error(`Unable to read cookies file "${filePath}"${code}.`);
  }

  const data = parseJsonFile(
    contents,
    `Cookies file "${filePath}" must contain valid JSON.`,
  );
  const result = cookiesSchema.safeParse(data);
  if (!result.success) {
    // The path names the invalid entry and field, never a cookie value.
    const [issue] = result.error.issues;
    const location = issue?.path.length
      ? ` Invalid value at ${formatIssuePath(issue.path)}.`
      : '';
    throw new Error(
      `Cookies file "${filePath}" must contain a Puppeteer CookieData array.${location}`,
    );
  }
  return result.data;
}
