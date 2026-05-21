/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {logger} from '../logger.js';
import {
  Client,
  StreamableHTTPClientTransport,
  type CallToolResult,
} from '../third_party/index.js';
import {VERSION} from '../version.js';

const REMOTE_CLIENT_NAME = 'chrome-devtools-cli-remote';

export interface RemoteOptions {
  url: URL;
  headers?: Record<string, string>;
  insecure?: boolean;
}

interface RemoteInvocation extends RemoteOptions {
  tool: string;
  args: Record<string, unknown>;
}

/**
 * Sticky session storage path. Keying on a hash of the full URL (host + port +
 * pathname) means multiple remotes on the same machine each get their own
 * session and a host:port collision across schemes (http vs. https) cannot
 * cross-contaminate.
 */
export function getRemoteSessionFilePath(url: URL): string {
  const cacheRoot =
    process.env['XDG_CACHE_HOME'] ||
    path.join(os.homedir(), os.platform() === 'darwin' ? '.cache' : '.cache');
  const dir = path.join(cacheRoot, 'chrome-devtools-mcp', 'remote');
  // Hash the URL minus search/hash since query params are typically not part of
  // the session identity.
  const key = `${url.protocol}//${url.host}${url.pathname}`;
  const hash = createHash('sha256').update(key).digest('hex').slice(0, 16);
  return path.join(dir, `${hash}.session`);
}

export function loadStickySessionId(url: URL): string | undefined {
  const file = getRemoteSessionFilePath(url);
  try {
    const content = fs.readFileSync(file, 'utf-8').trim();
    return content || undefined;
  } catch {
    return undefined;
  }
}

export function saveStickySessionId(url: URL, sessionId: string): void {
  const file = getRemoteSessionFilePath(url);
  try {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    // Mode 0600 — session IDs are bearer-equivalent on the wire and should
    // not be readable by other local users.
    fs.writeFileSync(file, sessionId, {mode: 0o600});
  } catch (err) {
    logger('Failed to persist remote session id:', err);
  }
}

export function clearStickySession(url: URL): void {
  const file = getRemoteSessionFilePath(url);
  try {
    fs.unlinkSync(file);
  } catch {
    // ignore — already gone is fine
  }
}

/**
 * Apply the --insecure switch by disabling Node's TLS certificate verification
 * for this process. Node prints its own stderr warning when this is set, which
 * is intentional — the user asked for an insecure connection.
 */
function applyInsecureTlsIfRequested(insecure: boolean | undefined): void {
  if (insecure) {
    process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
  }
}

interface ConnectResult {
  client: Client;
  transport: StreamableHTTPClientTransport;
}

async function connect(
  opts: RemoteOptions,
  sessionId: string | undefined,
): Promise<ConnectResult> {
  applyInsecureTlsIfRequested(opts.insecure);
  const transport = new StreamableHTTPClientTransport(opts.url, {
    sessionId,
    requestInit: opts.headers ? {headers: opts.headers} : undefined,
  });
  const client = new Client(
    {name: REMOTE_CLIENT_NAME, version: VERSION},
    {capabilities: {}},
  );
  await client.connect(transport);
  return {client, transport};
}

/**
 * Cleanly tear down a remote connection. terminateSession() sends the MCP
 * DELETE so the server frees its McpContext instead of waiting for the idle
 * reaper — important when the CLI is the only client of a long-lived session.
 *
 * `force` controls whether to send DELETE: between CLI invocations we want the
 * session to STAY ALIVE on the server (that is the entire point of sticky
 * sessions), so the default is to skip DELETE and just close the local
 * transport. Pass `force: true` for the explicit `stop` subcommand.
 */
async function disconnect(
  client: Client,
  transport: StreamableHTTPClientTransport,
  force: boolean,
): Promise<void> {
  if (force) {
    await transport.terminateSession().catch(() => undefined);
  }
  await client.close().catch(() => undefined);
  await transport.close().catch(() => undefined);
}

/**
 * Did the SDK reject because the server doesn't know our session? When
 * Client.connect() sees a sticky sessionId pre-set on the transport it skips
 * the initialize handshake (treating it as a reconnect) — so a server restart
 * surfaces as a 404 on the first real call. Detect that and re-run with a
 * fresh initialize.
 */
function isSessionNotFound(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const code = (err as {code?: unknown}).code;
  return code === 404;
}

async function callOnce(
  opts: RemoteInvocation,
  sticky: string | undefined,
): Promise<{result: CallToolResult; assignedSessionId?: string}> {
  const {client, transport} = await connect(opts, sticky);
  try {
    const result = (await client.callTool({
      name: opts.tool,
      arguments: opts.args,
    })) as CallToolResult;
    return {result, assignedSessionId: transport.sessionId};
  } finally {
    await disconnect(client, transport, /* force */ false);
  }
}

export async function invokeRemoteTool(
  opts: RemoteInvocation,
): Promise<CallToolResult> {
  const sticky = loadStickySessionId(opts.url);
  let outcome: Awaited<ReturnType<typeof callOnce>>;
  try {
    outcome = await callOnce(opts, sticky);
  } catch (err) {
    if (sticky && isSessionNotFound(err)) {
      // Sticky pointed at a session the server no longer has (typical after a
      // server restart). Wipe and reinitialize from scratch — the user's tab
      // state on the server is lost, but the command itself still succeeds.
      clearStickySession(opts.url);
      outcome = await callOnce(opts, undefined);
    } else {
      throw err;
    }
  }
  if (outcome.assignedSessionId && outcome.assignedSessionId !== sticky) {
    saveStickySessionId(opts.url, outcome.assignedSessionId);
  }
  return outcome.result;
}

/**
 * Explicitly terminate the sticky session on the server and remove the local
 * pointer. Used by the `stop` subcommand under --remote.
 */
export async function stopRemoteSession(opts: RemoteOptions): Promise<void> {
  const sticky = loadStickySessionId(opts.url);
  if (!sticky) {
    return;
  }
  try {
    const {client, transport} = await connect(opts, sticky);
    await disconnect(client, transport, /* force */ true);
  } catch (err) {
    logger(
      'stopRemoteSession: server unreachable, dropping local pointer',
      err,
    );
  } finally {
    clearStickySession(opts.url);
  }
}

export interface RemoteHealth {
  ok: boolean;
  status: number;
  body: unknown;
}

/**
 * GET <baseUrl>/health where baseUrl is derived from the --remote URL. The MCP
 * endpoint is conventionally /mcp; replace it with /health and keep the rest.
 */
export async function fetchRemoteHealth(
  opts: RemoteOptions,
): Promise<RemoteHealth> {
  applyInsecureTlsIfRequested(opts.insecure);
  const healthUrl = new URL(opts.url.toString());
  healthUrl.pathname = healthUrl.pathname.replace(/\/mcp\/?$/, '/health');
  if (healthUrl.pathname === opts.url.pathname) {
    // URL did not end in /mcp — assume the user passed a base URL and append.
    healthUrl.pathname = healthUrl.pathname.replace(/\/?$/, '/health');
  }
  const res = await fetch(healthUrl, {
    headers: opts.headers,
  });
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => undefined);
  }
  return {ok: res.ok, status: res.status, body};
}

/**
 * Parse a CLI --header value. Accepts both `Name: value` and `Name=value`
 * forms. Throws on a missing separator so a typo surfaces immediately rather
 * than silently dropping auth.
 */
export function parseHeaderFlag(raw: string): [string, string] {
  const colon = raw.indexOf(':');
  const eq = raw.indexOf('=');
  let sepIdx: number;
  if (colon >= 0 && (eq < 0 || colon < eq)) {
    sepIdx = colon;
  } else if (eq >= 0) {
    sepIdx = eq;
  } else {
    throw new Error(
      `Invalid --header value ${JSON.stringify(raw)}; expected "Name: value" or "Name=value"`,
    );
  }
  const name = raw.slice(0, sepIdx).trim();
  const value = raw.slice(sepIdx + 1).trim();
  if (!name) {
    throw new Error(
      `Invalid --header value ${JSON.stringify(raw)}; empty header name`,
    );
  }
  return [name, value];
}

export function parseHeaderFlags(
  values: readonly string[] | undefined,
): Record<string, string> | undefined {
  if (!values || values.length === 0) {
    return undefined;
  }
  const headers: Record<string, string> = {};
  for (const v of values) {
    const [name, value] = parseHeaderFlag(v);
    headers[name] = value;
  }
  return headers;
}
