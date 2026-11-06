/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import util from 'node:util';

import type {BrowserContext, CookieData} from '../third_party/index.js';
import {logger, redactUrlForLogging} from './logger.js';
import {isLocalhost} from './url.js';

export type ExecFileFn = (
  file: string,
  args: string[],
  options: {timeout: number; maxBuffer?: number},
) => Promise<{stdout: string; stderr: string}>;

export interface AuthenticateOptions {
  browserContext: BrowserContext;
  url: string;
  authHelperCommand?: string;
  execFileAsync?: ExecFileFn;
}

const execFilePromise = util.promisify(childProcess.execFile);

const defaultExecFileAsync: ExecFileFn = async (file, args, options) => {
  const result = await execFilePromise(file, args, options);
  return {
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    stderr: typeof result.stderr === 'string' ? result.stderr : '',
  };
};

/**
 * Validate that an auth helper command contains required placeholders.
 */
export function validateAuthHelperCommand(command: string): string {
  const trimmed = command.trim();
  if (!trimmed) {
    throw new Error('--auth-helper command must not be empty.');
  }
  if (!trimmed.includes('{cookieJar}') || !trimmed.includes('{url}')) {
    throw new Error(
      '--auth-helper command must include {cookieJar} and {url} placeholders.',
    );
  }
  return trimmed;
}

/**
 * Build the executable and arguments for an auth helper invocation.
 */
export function buildAuthHelperArgs(
  command: string,
  cookieJarPath: string,
  url: string,
): {executable: string; args: string[]} {
  const tokens = validateAuthHelperCommand(command).split(/\s+/);
  const executable = tokens[0];
  if (!executable) {
    throw new Error('--auth-helper command must specify an executable.');
  }

  const args = tokens
    .slice(1)
    .map(arg =>
      arg.replaceAll('{cookieJar}', cookieJarPath).replaceAll('{url}', url),
    );

  return {executable, args};
}

/**
 * Parse cookies from cookie jar JSON content written by the auth helper.
 *
 * The cookie jar file must contain a JSON array of URL entries:
 * ```json
 * [
 *   {
 *     "URL": "https://login.example.com",
 *     "Cookies": [
 *       {
 *         "Name": "SESSION",
 *         "Value": "token-value",
 *         "Domain": "example.com",
 *         "Path": "/",
 *         "Secure": true,
 *         "HttpOnly": true
 *       }
 *     ]
 *   }
 * ]
 * ```
 * If a cookie omits `Domain`, the hostname from the parent `URL` is used.
 * If a cookie omits `Path`, `/` is used.
 */
export function parseCookieJar(rawContent: string): CookieData[] {
  let entries: unknown;
  try {
    entries = JSON.parse(rawContent);
  } catch {
    return [];
  }
  if (!Array.isArray(entries)) {
    return [];
  }

  const cookies: CookieData[] = [];
  for (const entry of entries) {
    let fallbackDomain = '';
    if (typeof entry?.URL === 'string') {
      try {
        fallbackDomain = new URL(entry.URL).hostname;
      } catch {
        fallbackDomain = '';
      }
    }
    if (!Array.isArray(entry?.Cookies)) {
      continue;
    }
    for (const cookie of entry.Cookies) {
      const domain = cookie?.Domain || fallbackDomain;
      if (!cookie?.Name || typeof cookie?.Value !== 'string' || !domain) {
        continue;
      }
      cookies.push({
        name: String(cookie.Name),
        value: cookie.Value,
        domain: String(domain),
        path: cookie.Path ? String(cookie.Path) : '/',
        secure: typeof cookie.Secure === 'boolean' ? cookie.Secure : undefined,
        httpOnly:
          typeof cookie.HttpOnly === 'boolean' ? cookie.HttpOnly : undefined,
      });
    }
  }

  return cookies;
}

const authenticatedHostsByContext = new WeakMap<
  BrowserContext,
  Map<string, Promise<void>>
>();

/**
 * Authenticate the browser context for the given URL using the auth helper.
 */
export async function authenticateBrowserContext(
  options: AuthenticateOptions,
): Promise<void> {
  const command = options.authHelperCommand;
  if (!command) {
    return;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(options.url);
  } catch {
    return;
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return;
  }

  if (isLocalhost(options.url)) {
    return;
  }

  const hostKey = parsedUrl.origin;
  let hostMap = authenticatedHostsByContext.get(options.browserContext);
  if (!hostMap) {
    hostMap = new Map();
    authenticatedHostsByContext.set(options.browserContext, hostMap);
  }

  const existing = hostMap.get(hostKey);
  if (existing) {
    await existing;
    return;
  }

  const authTask = (async () => {
    const tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'chrome-devtools-mcp-auth-'),
    );
    await fs.promises.chmod(tempDir, 0o700);

    try {
      const cookieJarPath = path.join(tempDir, 'cookies.json');
      const {executable, args} = buildAuthHelperArgs(
        command,
        cookieJarPath,
        options.url,
      );
      const execFn = options.execFileAsync ?? defaultExecFileAsync;
      await execFn(executable, args, {
        timeout: 30_000,
        maxBuffer: 50 * 1024 * 1024,
      });

      let rawJar = '';
      try {
        rawJar = await fs.promises.readFile(cookieJarPath, 'utf8');
      } catch {
        // Auth helper exited without writing a cookie jar file.
      }

      const cookies = parseCookieJar(rawJar);
      if (cookies.length > 0) {
        await options.browserContext.setCookie(...cookies);
      }
    } catch (error) {
      hostMap.delete(hostKey);
      const rawMessage = error instanceof Error ? error.message : String(error);
      const safeMessage = rawMessage.replaceAll(
        options.url,
        redactUrlForLogging(options.url),
      );
      logger?.(`Auth helper failed for ${parsedUrl.origin}: ${safeMessage}`);
    } finally {
      try {
        await fs.promises.rm(tempDir, {recursive: true, force: true});
      } catch {
        // Ignore temporary directory cleanup failure.
      }
    }
  })();

  hostMap.set(hostKey, authTask);
  await authTask;
}
