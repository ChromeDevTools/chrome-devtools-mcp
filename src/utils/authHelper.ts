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
 * Split a command string into arguments.
 * Supports single quotes, double quotes, and backslash escapes.
 */
export function tokenizeCommand(command: string): string[] {
  const tokens: string[] = [];
  let currentToken = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let hasToken = false;

  for (let index = 0; index < command.length; index++) {
    const char = command[index];
    if (inSingleQuote) {
      if (char === "'") {
        inSingleQuote = false;
      } else {
        currentToken += char;
      }
    } else if (inDoubleQuote) {
      if (char === '\\') {
        if (index + 1 < command.length) {
          index++;
          const nextChar = command[index];
          if (nextChar === '"' || nextChar === '\\') {
            currentToken += nextChar;
          } else {
            currentToken += '\\' + nextChar;
          }
        } else {
          throw new Error('Invalid --auth-helper command: trailing backslash.');
        }
      } else if (char === '"') {
        inDoubleQuote = false;
      } else {
        currentToken += char;
      }
    } else if (char === "'") {
      inSingleQuote = true;
      hasToken = true;
    } else if (char === '"') {
      inDoubleQuote = true;
      hasToken = true;
    } else if (char === '\\') {
      if (index + 1 < command.length) {
        index++;
        currentToken += command[index];
        hasToken = true;
      } else {
        throw new Error('Invalid --auth-helper command: trailing backslash.');
      }
    } else if (/\s/.test(char)) {
      if (hasToken) {
        tokens.push(currentToken);
        currentToken = '';
        hasToken = false;
      }
    } else {
      currentToken += char;
      hasToken = true;
    }
  }

  if (inSingleQuote || inDoubleQuote) {
    throw new Error('Invalid --auth-helper command: unclosed quote.');
  }

  if (hasToken) {
    tokens.push(currentToken);
  }

  return tokens;
}

/**
 * Validate that an auth helper command specifies an executable.
 */
export function validateAuthHelperCommand(command: string): string {
  const trimmed = command.trim();
  if (trimmed.length === 0) {
    throw new Error('--auth-helper command must not be empty.');
  }

  const tokens = tokenizeCommand(trimmed);
  const executable = tokens[0];
  if (executable === undefined || executable.length === 0) {
    throw new Error('--auth-helper command must specify an executable.');
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
  const tokens = tokenizeCommand(command);
  const executable = tokens[0];
  if (executable === undefined || executable.length === 0) {
    throw new Error('--auth-helper command must specify an executable.');
  }

  const rawArgs = tokens.slice(1);
  let hasCookieJarPlaceholder = false;
  let hasUrlPlaceholder = false;
  const args: string[] = [];

  for (const rawArg of rawArgs) {
    let replaced = rawArg;
    if (replaced.includes('{cookieJar}')) {
      hasCookieJarPlaceholder = true;
      replaced = replaced.replaceAll('{cookieJar}', cookieJarPath);
    }
    if (replaced.includes('{url}')) {
      hasUrlPlaceholder = true;
      replaced = replaced.replaceAll('{url}', url);
    }
    args.push(replaced);
  }

  if (!hasCookieJarPlaceholder) {
    args.push('-cookie-jar', cookieJarPath);
  }
  if (!hasUrlPlaceholder) {
    args.push('-url', url);
  }

  return {executable, args};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse cookies from cookie jar JSON content.
 */
export function parseCookieJar(rawContent: string): CookieData[] {
  const trimmed = rawContent.trim();
  if (trimmed.length === 0) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const cookies: CookieData[] = [];

  for (const item of parsed) {
    if (!isRecord(item)) {
      continue;
    }

    // Format 1: URL-keyed entries with Cookies array.
    if (typeof item['URL'] === 'string' && Array.isArray(item['Cookies'])) {
      const entryUrl = item['URL'];
      let fallbackDomain: string | undefined;
      try {
        fallbackDomain = new URL(entryUrl).hostname;
      } catch {
        fallbackDomain = undefined;
      }

      for (const rawCookie of item['Cookies']) {
        if (!isRecord(rawCookie)) {
          continue;
        }

        if (
          typeof rawCookie['Name'] !== 'string' ||
          rawCookie['Name'].length === 0 ||
          typeof rawCookie['Value'] !== 'string'
        ) {
          continue;
        }

        if (
          typeof rawCookie['MaxAge'] === 'number' &&
          rawCookie['MaxAge'] < 0
        ) {
          continue;
        }

        let expires: number | undefined;
        if (
          typeof rawCookie['Expires'] === 'string' &&
          rawCookie['Expires'].length > 0 &&
          rawCookie['Expires'] !== '0001-01-01T00:00:00Z'
        ) {
          const expiresMs = Date.parse(rawCookie['Expires']);
          if (!Number.isNaN(expiresMs)) {
            if (expiresMs <= Date.now()) {
              continue;
            }
            expires = Math.floor(expiresMs / 1000);
          }
        }

        let domain: string | undefined;
        if (
          typeof rawCookie['Domain'] === 'string' &&
          rawCookie['Domain'].length > 0
        ) {
          domain = rawCookie['Domain'];
        } else {
          domain = fallbackDomain;
        }

        if (domain === undefined || domain.length === 0) {
          continue;
        }

        const path =
          typeof rawCookie['Path'] === 'string' && rawCookie['Path'].length > 0
            ? rawCookie['Path']
            : '/';

        const cookie: CookieData = {
          name: rawCookie['Name'],
          value: rawCookie['Value'],
          domain,
          path,
        };

        if (expires !== undefined) {
          cookie.expires = expires;
        }
        if (typeof rawCookie['Secure'] === 'boolean') {
          cookie.secure = rawCookie['Secure'];
        }
        if (typeof rawCookie['HttpOnly'] === 'boolean') {
          cookie.httpOnly = rawCookie['HttpOnly'];
        }

        if (typeof rawCookie['SameSite'] === 'number') {
          if (rawCookie['SameSite'] === 2) {
            cookie.sameSite = 'Lax';
          } else if (rawCookie['SameSite'] === 3) {
            cookie.sameSite = 'Strict';
          } else if (rawCookie['SameSite'] === 4) {
            cookie.sameSite = 'None';
          }
        } else if (typeof rawCookie['SameSite'] === 'string') {
          const sameSiteLower = rawCookie['SameSite'].toLowerCase();
          if (sameSiteLower === 'lax') {
            cookie.sameSite = 'Lax';
          } else if (sameSiteLower === 'strict') {
            cookie.sameSite = 'Strict';
          } else if (sameSiteLower === 'none') {
            cookie.sameSite = 'None';
          }
        }

        cookies.push(cookie);
      }
      continue;
    }

    // Format 2: Flat cookie entries.
    if (
      typeof item['name'] === 'string' &&
      item['name'].length > 0 &&
      typeof item['value'] === 'string'
    ) {
      let domain: string | undefined;
      if (typeof item['domain'] === 'string' && item['domain'].length > 0) {
        domain = item['domain'];
      } else if (typeof item['url'] === 'string' && item['url'].length > 0) {
        try {
          domain = new URL(item['url']).hostname;
        } catch {
          domain = undefined;
        }
      }

      if (domain === undefined || domain.length === 0) {
        continue;
      }

      let expires: number | undefined;
      if (typeof item['expires'] === 'number') {
        if (item['expires'] * 1000 <= Date.now()) {
          continue;
        }
        expires = item['expires'];
      }

      const path =
        typeof item['path'] === 'string' && item['path'].length > 0
          ? item['path']
          : '/';

      const cookie: CookieData = {
        name: item['name'],
        value: item['value'],
        domain,
        path,
      };

      if (expires !== undefined) {
        cookie.expires = expires;
      }
      if (typeof item['secure'] === 'boolean') {
        cookie.secure = item['secure'];
      }
      if (typeof item['httpOnly'] === 'boolean') {
        cookie.httpOnly = item['httpOnly'];
      }

      if (typeof item['sameSite'] === 'string') {
        const sameSiteLower = item['sameSite'].toLowerCase();
        if (sameSiteLower === 'lax') {
          cookie.sameSite = 'Lax';
        } else if (sameSiteLower === 'strict') {
          cookie.sameSite = 'Strict';
        } else if (sameSiteLower === 'none') {
          cookie.sameSite = 'None';
        }
      }

      cookies.push(cookie);
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
