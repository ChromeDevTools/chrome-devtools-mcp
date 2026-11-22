
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);

export interface BitwardenPasswordOptions {
  itemIdOrName: string;
  sessionToken?: string;
  executable?: string;
  timeoutMilliseconds?: number;
}

export async function getBitwardenPassword(
  options: BitwardenPasswordOptions,
): Promise<string> {
  if (!options.itemIdOrName.trim()) {
    throw new Error('Bitwarden item ID or name is required');
  }

  const sessionToken = options.sessionToken ?? process.env.BW_SESSION;
  if (!sessionToken) {
    throw new Error(
      'BW_SESSION is required when retrieving a Bitwarden password',
    );
  }

  const {stdout} = await execFileAsync(
    options.executable ?? 'bw',
    ['get', 'password', options.itemIdOrName],
    {
      encoding: 'utf8',
      timeout: options.timeoutMilliseconds ?? 30_000,
      env: {...process.env, BW_SESSION: sessionToken},
      maxBuffer: 1024 * 1024,
    },
  );
  if (!stdout.trim()) {
    throw new Error('Bitwarden returned an empty password');
  }
  return stdout.trim();
}
