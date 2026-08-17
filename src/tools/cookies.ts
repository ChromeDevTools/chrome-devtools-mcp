/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {CDPSession, Protocol} from '../third_party/index.js';

import {zod} from '../third_party/index.js';
import {
  deleteSecrets,
  placeholderHint,
  resolvePlaceholders,
} from '../utils/secrets.js';

import {ToolCategory} from './categories.js';
import type {ContextPage} from './ToolDefinition.js';
import {definePageTool} from './ToolDefinition.js';

/**
 * Runs `action` on a CDP session that is always detached again afterwards.
 */
async function withCdpSession<T>(
  page: ContextPage,
  action: (session: CDPSession) => Promise<T>,
): Promise<T> {
  const session = await page.pptrPage.createCDPSession();
  try {
    return await action(session);
  } finally {
    await session.detach().catch(() => undefined);
  }
}

/**
 * Matches a cookie against a domain filter on domain-label boundaries, so
 * "example.com" matches "example.com" and "www.example.com" but never
 * "notexample.com" or "example.com.evil.test". A substring match here would
 * make clear_cookies delete cookies the caller did not ask for.
 */
function matchesDomain(
  cookie: Protocol.Network.Cookie,
  domain: string | undefined,
): boolean {
  if (!domain) {
    return true;
  }
  // Cookie domains may carry a leading dot meaning "and subdomains".
  const cookieDomain = cookie.domain.toLowerCase().replace(/^\./, '');
  const filter = domain.toLowerCase().replace(/^\./, '');
  return cookieDomain === filter || cookieDomain.endsWith(`.${filter}`);
}

/**
 * Describes a cookie WITHOUT exposing its value, so cookie values never end up
 * in the model context. The full cookie, including values, is written to the
 * file instead.
 */
function describeCookie(cookie: Protocol.Network.Cookie): string {
  const parts = [`${cookie.name} (domain=${cookie.domain}`];
  if (cookie.path) {
    parts.push(`path=${cookie.path}`);
  }
  if (cookie.expires && cookie.expires > 0) {
    parts.push(`expires=${new Date(cookie.expires * 1000).toISOString()}`);
  } else {
    parts.push('session');
  }
  if (cookie.httpOnly) {
    parts.push('httpOnly');
  }
  if (cookie.secure) {
    parts.push('secure');
  }
  if (cookie.sameSite) {
    parts.push(`sameSite=${cookie.sameSite}`);
  }
  return parts.join(', ') + ')';
}

export const getCookies = definePageTool({
  name: 'get_cookies',
  description: `Gets all cookies stored in the browser's default context and writes them, including their values, to a JSON file. The tool reports only which cookies were found (name, domain, and security metadata); cookie values are never returned inline and only exist in the file.`,
  annotations: {
    category: ToolCategory.NETWORK,
    readOnlyHint: true,
  },
  schema: {
    filePath: zod
      .string()
      .describe(
        'The absolute or relative path to a .json file to write the cookies (including their values) to.',
      ),
    domain: zod
      .string()
      .optional()
      .describe(
        'Only return cookies for this domain and its subdomains, e.g. "example.com" also matches "www.example.com" (case-insensitive). When omitted, returns all cookies.',
      ),
  },
  blockedByDialog: false,
  verifyFilesSchema: {
    filePath: true,
  },
  handler: async (request, response, context) => {
    let {cookies} = await withCdpSession(request.page, session =>
      session.send('Storage.getCookies'),
    );

    cookies = cookies.filter(cookie =>
      matchesDomain(cookie, request.params.domain),
    );

    const data = new TextEncoder().encode(JSON.stringify(cookies, null, 2));
    const file = await context.saveFile(data, request.params.filePath, '.json');

    if (cookies.length === 0) {
      response.appendResponseLine(`No cookies found. Wrote ${file.filename}.`);
      return;
    }

    response.appendResponseLine(
      `Found ${cookies.length} cookie(s); values written to ${file.filename}.`,
    );
    for (const cookie of cookies) {
      response.appendResponseLine(describeCookie(cookie));
    }
  },
});

export const setCookie = definePageTool({
  name: 'set_cookie',
  description: `Sets a cookie in the browser. Either 'url' or 'domain' must be given. Use this to restore a session, toggle a feature flag, or reproduce a state that depends on a specific cookie.`,
  annotations: {
    category: ToolCategory.NETWORK,
    readOnlyHint: false,
  },
  schema: {
    name: zod.string().describe('The name of the cookie.'),
    value: zod
      .string()
      .describe(
        `The value of the cookie. A cookie value is often a session token, and this parameter is recorded in the conversation transcript, so prefer a placeholder. ${placeholderHint}`,
      ),
    url: zod
      .string()
      .optional()
      .describe(
        'The request URI to associate the cookie with, which sets its domain and path. Either this or "domain" is required.',
      ),
    domain: zod
      .string()
      .optional()
      .describe(
        'The cookie domain, e.g. "example.com" or ".example.com" to include subdomains. Either this or "url" is required.',
      ),
    path: zod
      .string()
      .optional()
      .describe('The cookie path. Defaults to "/" when a domain is given.'),
    expires: zod
      .number()
      .optional()
      .describe(
        'Expiry as seconds since the UNIX epoch. Omit to create a session cookie that is dropped when the browser closes.',
      ),
    httpOnly: zod
      .boolean()
      .optional()
      .describe('Whether the cookie is inaccessible to JavaScript.'),
    secure: zod
      .boolean()
      .optional()
      .describe('Whether the cookie is only sent over HTTPS.'),
    sameSite: zod
      .enum(['Strict', 'Lax', 'None'])
      .optional()
      .describe('The SameSite policy. "None" requires secure to be true.'),
  },
  blockedByDialog: false,
  verifyFilesSchema: {},
  handler: async (request, response) => {
    const {name, url, domain, path, expires, httpOnly, secure, sameSite} =
      request.params;

    // Resolved here so a session token never has to be passed to this tool.
    const secret = await resolvePlaceholders(request.params.value);
    const value = secret.value;

    if (!url && !domain) {
      throw new Error(
        `Either 'url' or 'domain' is required to set a cookie, so the browser knows where it applies.`,
      );
    }

    const {success} = await withCdpSession(request.page, session =>
      session.send('Network.setCookie', {
        name,
        value,
        url,
        domain,
        path: path ?? (domain ? '/' : undefined),
        expires,
        httpOnly,
        secure,
        sameSite,
      }),
    );

    if (!success) {
      throw new Error(
        `The browser rejected the cookie "${name}". Check that the domain matches the page, and that secure is set when sameSite is "None".`,
      );
    }

    await deleteSecrets(secret.consume);

    // The value is deliberately not echoed back.
    response.appendResponseLine(
      `Set cookie ${name} for ${url ?? domain}${path ? ` (path=${path})` : ''}.`,
    );
  },
});

export const clearCookies = definePageTool({
  name: 'clear_cookies',
  description: `Deletes cookies from the browser. Pass 'name' and/or 'domain' to delete matching cookies, or 'all' to clear every cookie in the browser. Use this to return to a signed-out or first-visit state.`,
  annotations: {
    category: ToolCategory.NETWORK,
    readOnlyHint: false,
  },
  schema: {
    domain: zod
      .string()
      .optional()
      .describe(
        'Only delete cookies for this domain and its subdomains, e.g. "example.com" also matches "www.example.com" but not "notexample.com" (case-insensitive).',
      ),
    name: zod
      .string()
      .optional()
      .describe('Only delete cookies with this exact name.'),
    all: zod
      .boolean()
      .optional()
      .describe(
        'Set to true to delete EVERY cookie in the browser. This signs the user out of every site, so it is required when no other filter is given, to make a full wipe explicit.',
      ),
  },
  blockedByDialog: false,
  verifyFilesSchema: {},
  handler: async (request, response) => {
    const {domain, name, all} = request.params;

    if (!domain && !name && !all) {
      throw new Error(
        `Refusing to clear every cookie implicitly. Pass 'domain' and/or 'name' to delete specific cookies, or 'all: true' to deliberately sign the user out of every site.`,
      );
    }

    await withCdpSession(request.page, async session => {
      const {cookies} = await session.send('Storage.getCookies');
      const matching = cookies.filter(
        cookie =>
          matchesDomain(cookie, domain) && (!name || cookie.name === name),
      );

      if (matching.length === 0) {
        response.appendResponseLine('No matching cookies found.');
        return;
      }

      for (const cookie of matching) {
        await session.send('Network.deleteCookies', {
          name: cookie.name,
          domain: cookie.domain,
          path: cookie.path,
          // Without the partition key a partitioned (CHIPS) cookie is not
          // matched and would silently survive the delete.
          partitionKey: cookie.partitionKey,
        });
      }

      response.appendResponseLine(`Deleted ${matching.length} cookie(s):`);
      for (const cookie of matching) {
        response.appendResponseLine(`${cookie.name} (domain=${cookie.domain})`);
      }
    });
  },
});
