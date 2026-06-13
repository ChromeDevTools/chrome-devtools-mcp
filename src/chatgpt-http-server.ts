/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {createHash, randomBytes, randomUUID} from 'node:crypto';
import type fs from 'node:fs';
import http, {
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

import type {ParsedArguments} from './bin/chrome-devtools-mcp-cli-options.js';
import {createMcpServer} from './index.js';
import {logger} from './logger.js';
import {
  isInitializeRequest,
  StreamableHTTPServerTransport,
} from './third_party/index.js';
import {VERSION} from './version.js';

const BEARER_PREFIX = /^Bearer\s+(.+)$/i;
const DEFAULT_ALLOWED_ORIGINS = ['https://chatgpt.com', 'https://chat.openai.com'];
const ACCESS_TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_BODY_BYTES = 1024 * 1024;

type McpServerInstance = Awaited<ReturnType<typeof createMcpServer>>['server'];

interface ChatGptHttpConfig {
  allowedOrigins: string[];
  baseUrl: string;
  loginSecret: string;
  port: number;
  token: string;
}

interface ChatGptServerOptions {
  logFile?: fs.WriteStream;
}

interface RunningSession {
  server: McpServerInstance;
  transport: StreamableHTTPServerTransport;
}

interface PendingAuthCode {
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  resource: string;
  expiresAt: number;
}

interface ClientRegistration {
  redirectUris: Set<string>;
}

interface AccessToken {
  expiresAt: number;
  resource: string;
}

interface JsonResponseHeaders {
  [key: string]: string;
}

interface RedirectUriParseResult {
  hasInvalidUri: boolean;
  redirectUris: string[];
}

interface PendingSessionRegistration {
  server?: McpServerInstance;
  transport?: StreamableHTTPServerTransport;
}

export interface RunningChatGptServer {
  close: () => Promise<void>;
  url: string;
}

function readString(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value !== 'string' || !value.trim()) {
    return;
  }
  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return;
  }
  return parsed;
}

function readEnvString(env: NodeJS.ProcessEnv, name: string): string {
  return env[name]?.trim() ?? '';
}

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  const values: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim()) {
      values.push(entry.trim());
    }
  }
  return values;
}

function parseCommaSeparated(value: string): string[] {
  if (!value.trim()) {
    return [];
  }
  return value
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function loadChatGptHttpConfig(
  args: ParsedArguments,
  env: NodeJS.ProcessEnv,
): ChatGptHttpConfig {
  const port =
    readNumber(args.chatgptPort) ??
    readNumber(readEnvString(env, 'CHATGPT_MCP_PORT')) ??
    readNumber(readEnvString(env, 'PORT')) ??
    3000;
  const token =
    readString(args.chatgptToken) ||
    readEnvString(env, 'CHATGPT_MCP_TOKEN') ||
    readEnvString(env, 'MCP_TOKEN') ||
    'dev-token';
  const loginSecret =
    readString(args.chatgptLoginSecret) ||
    readEnvString(env, 'CHATGPT_MCP_LOGIN_SECRET') ||
    readEnvString(env, 'OAUTH_LOGIN_SECRET');
  const baseUrl = normalizeBaseUrl(
    readString(args.chatgptBaseUrl) ||
      readEnvString(env, 'CHATGPT_MCP_BASE_URL') ||
      readEnvString(env, 'OAUTH_BASE_URL'),
  );
  const allowedOrigins =
    collectStrings(args.chatgptAllowedOrigin).length > 0
      ? collectStrings(args.chatgptAllowedOrigin)
      : parseCommaSeparated(
          readEnvString(env, 'CHATGPT_MCP_ALLOWED_ORIGINS') ||
            readEnvString(env, 'ALLOWED_ORIGINS'),
        );

  if (!loginSecret) {
    throw new Error(
      'CHATGPT_MCP_LOGIN_SECRET or OAUTH_LOGIN_SECRET is required when --chatgpt is enabled.',
    );
  }
  if (env['NODE_ENV'] === 'production' && token === 'dev-token') {
    throw new Error(
      'CHATGPT_MCP_TOKEN or MCP_TOKEN must be set to a non-default value when NODE_ENV=production.',
    );
  }

  return {
    allowedOrigins:
      allowedOrigins.length > 0 ? allowedOrigins : DEFAULT_ALLOWED_ORIGINS,
    baseUrl,
    loginSecret,
    port,
    token,
  };
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function requestBaseUrl(req: IncomingMessage, config: ChatGptHttpConfig): string {
  if (config.baseUrl) {
    return config.baseUrl;
  }
  const forwardedProto = header(req, 'x-forwarded-proto')
    ?.split(',')[0]
    ?.trim();
  const proto = forwardedProto || 'http';
  const host =
    header(req, 'x-forwarded-host') ||
    header(req, 'host') ||
    `127.0.0.1:${config.port}`;
  return normalizeBaseUrl(`${proto}://${host}`);
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
  headers: JsonResponseHeaders = {},
): void {
  if (res.writableEnded) {
    return;
  }
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  });
  res.end(JSON.stringify(payload));
}

function sendText(
  res: ServerResponse,
  statusCode: number,
  text: string,
  contentType = 'text/plain; charset=utf-8',
): void {
  if (res.writableEnded) {
    return;
  }
  res.writeHead(statusCode, {'Content-Type': contentType});
  res.end(text);
}

function sendHtml(res: ServerResponse, statusCode: number, html: string): void {
  sendText(res, statusCode, html, 'text/html; charset=utf-8');
}

function sendRedirect(res: ServerResponse, location: string): void {
  if (res.writableEnded) {
    return;
  }
  res.writeHead(302, {Location: location});
  res.end();
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > MAX_BODY_BYTES) {
      throw new Error('Request body is too large');
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const body = await readBody(req);
  if (!body.trim()) {
    return undefined;
  }
  return JSON.parse(body);
}

async function readJsonObject(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  const parsed = await readJson(req).catch(() => undefined);
  if (!isRecord(parsed)) {
    return {};
  }
  return parsed;
}

async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  return new URLSearchParams(await readBody(req));
}

function extractBearerToken(req: IncomingMessage): string | undefined {
  const authorization = header(req, 'authorization');
  if (!authorization) {
    return;
  }
  const match = authorization.match(BEARER_PREFIX);
  const token = match?.[1]?.trim();
  return token || undefined;
}

function base64url(buffer: Buffer): string {
  return buffer.toString('base64url');
}

function sha256(input: string): string {
  return base64url(createHash('sha256').update(input).digest());
}

function generateCode(): string {
  return base64url(randomBytes(32));
}

function generateToken(): string {
  return base64url(randomBytes(48));
}

const ALLOWED_REDIRECT_PROTOCOLS = new Set(['http:', 'https:']);

function parseAllowedRedirectUri(redirectUri: string): URL | null {
  try {
    const parsed = new URL(redirectUri);
    if (!ALLOWED_REDIRECT_PROTOCOLS.has(parsed.protocol) || !parsed.hostname) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function parseRedirectUris(value: unknown): RedirectUriParseResult {
  if (!Array.isArray(value)) {
    return {hasInvalidUri: false, redirectUris: []};
  }

  const seen = new Set<string>();
  const redirectUris: string[] = [];
  let hasInvalidUri = false;

  for (const candidate of value) {
    if (typeof candidate !== 'string') {
      hasInvalidUri = true;
      continue;
    }
    const redirectUri = candidate.trim();
    if (!redirectUri || !parseAllowedRedirectUri(redirectUri)) {
      hasInvalidUri = true;
      continue;
    }
    if (!seen.has(redirectUri)) {
      seen.add(redirectUri);
      redirectUris.push(redirectUri);
    }
  }

  return {hasInvalidUri, redirectUris};
}

function isTrustedChatGptRedirectUri(redirectUri: string): boolean {
  const parsed = parseAllowedRedirectUri(redirectUri);
  if (!parsed || parsed.protocol !== 'https:') {
    return false;
  }
  return parsed.hostname === 'chatgpt.com' || parsed.hostname === 'chat.openai.com';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

class ChatGptOAuthController {
  #accessTokens = new Map<string, AccessToken>();
  #authCodes = new Map<string, PendingAuthCode>();
  #clientRegistrations = new Map<string, ClientRegistration>();
  #cleanup: NodeJS.Timeout;

  constructor(private readonly config: ChatGptHttpConfig) {
    this.#cleanup = setInterval(() => this.#removeExpired(), 60_000);
    this.#cleanup.unref();
  }

  close(): void {
    clearInterval(this.#cleanup);
  }

  isValidAccessToken(token: string): boolean {
    if (token === this.config.token) {
      return true;
    }
    const entry = this.#accessTokens.get(token);
    if (!entry) {
      return false;
    }
    if (entry.expiresAt < Date.now()) {
      this.#accessTokens.delete(token);
      return false;
    }
    return true;
  }

  canHandle(method: string, pathname: string): boolean {
    if (method === 'GET') {
      return (
        pathname === '/.well-known/oauth-protected-resource' ||
        pathname === '/.well-known/oauth-protected-resource/mcp' ||
        pathname === '/.well-known/oauth-authorization-server' ||
        pathname === '/authorize'
      );
    }
    return method === 'POST' && (pathname === '/authorize' || pathname === '/token' || pathname === '/register');
  }

  async handle(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
    baseUrl: string,
  ): Promise<void> {
    if (req.method === 'GET') {
      if (
        pathname === '/.well-known/oauth-protected-resource' ||
        pathname === '/.well-known/oauth-protected-resource/mcp'
      ) {
        sendJson(res, 200, {
          resource: baseUrl,
          authorization_servers: [baseUrl],
          scopes_supported: ['mcp'],
          resource_documentation: `${baseUrl}/health`,
        });
        return;
      }
      if (pathname === '/.well-known/oauth-authorization-server') {
        sendJson(res, 200, {
          issuer: baseUrl,
          authorization_endpoint: `${baseUrl}/authorize`,
          token_endpoint: `${baseUrl}/token`,
          registration_endpoint: `${baseUrl}/register`,
          token_endpoint_auth_methods_supported: ['none'],
          code_challenge_methods_supported: ['S256'],
          scopes_supported: ['mcp'],
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code'],
          client_id_metadata_document_supported: false,
        });
        return;
      }
      if (pathname === '/authorize') {
        this.#handleAuthorizePage(req, res, baseUrl);
        return;
      }
    }

    if (req.method === 'POST' && pathname === '/authorize') {
      await this.#handleAuthorizePost(req, res, baseUrl);
      return;
    }
    if (req.method === 'POST' && pathname === '/token') {
      await this.#handleToken(req, res);
      return;
    }
    if (req.method === 'POST' && pathname === '/register') {
      await this.#handleRegister(req, res);
      return;
    }

    sendText(res, 404, 'Not Found');
  }

  #removeExpired(): void {
    const now = Date.now();
    for (const [code, entry] of this.#authCodes) {
      if (entry.expiresAt < now) {
        this.#authCodes.delete(code);
      }
    }
    for (const [token, entry] of this.#accessTokens) {
      if (entry.expiresAt < now) {
        this.#accessTokens.delete(token);
      }
    }
  }

  #isRegisteredRedirectUri(clientId: string, redirectUri: string): boolean {
    const registration = this.#clientRegistrations.get(clientId);
    return Boolean(registration?.redirectUris.has(redirectUri));
  }

  #isAllowedRedirectUri(clientId: string, redirectUri: string): boolean {
    return (
      this.#isRegisteredRedirectUri(clientId, redirectUri) ||
      (clientId === 'mcp-client-chatgpt' && isTrustedChatGptRedirectUri(redirectUri))
    );
  }

  #buildAuthorizePath(params: Record<string, string>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) {
        search.set(key, value);
      }
    }
    const query = search.toString();
    return query ? `/authorize?${query}` : '/authorize';
  }

  #handleAuthorizePage(
    req: IncomingMessage,
    res: ServerResponse,
    baseUrl: string,
  ): void {
    const requestUrl = new URL(req.url ?? '/', baseUrl);
    const clientId = requestUrl.searchParams.get('client_id') ?? '';
    const redirectUri = requestUrl.searchParams.get('redirect_uri') ?? '';
    const state = requestUrl.searchParams.get('state') ?? '';
    const codeChallenge = requestUrl.searchParams.get('code_challenge') ?? '';
    const codeChallengeMethod =
      requestUrl.searchParams.get('code_challenge_method') ?? '';
    const resource = requestUrl.searchParams.get('resource') ?? baseUrl;
    const scope = requestUrl.searchParams.get('scope') ?? '';

    if (!clientId || !redirectUri || !codeChallenge) {
      sendText(
        res,
        400,
        'Missing required parameters: client_id, redirect_uri, code_challenge',
      );
      return;
    }
    if (codeChallengeMethod && codeChallengeMethod !== 'S256') {
      sendText(res, 400, 'Unsupported code_challenge_method');
      return;
    }
    if (!this.#isAllowedRedirectUri(clientId, redirectUri)) {
      sendText(res, 400, 'Invalid client_id or redirect_uri');
      return;
    }

    sendHtml(
      res,
      200,
      `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Authorize Chrome DevTools MCP</title>
<style>
body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:480px;margin:80px auto;padding:0 20px;color:#222;line-height:1.5}
h1{font-size:1.35rem;margin-bottom:.5rem}label{display:block;margin:16px 0 6px;font-weight:600}
input[type=password]{width:100%;padding:10px;border:1px solid #bbb;border-radius:6px;box-sizing:border-box}
button{margin-top:18px;padding:10px 22px;background:#1a73e8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:1rem}
small{color:#555}
</style></head>
<body>
<h1>Authorize Chrome DevTools MCP</h1>
<p>ChatGPT is requesting access to a Chrome DevTools MCP server.</p>
<form method="POST" action="/authorize">
<input type="hidden" name="client_id" value="${escapeHtml(clientId)}">
<input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}">
<input type="hidden" name="state" value="${escapeHtml(state)}">
<input type="hidden" name="code_challenge" value="${escapeHtml(codeChallenge)}">
<input type="hidden" name="code_challenge_method" value="${escapeHtml(codeChallengeMethod)}">
<input type="hidden" name="resource" value="${escapeHtml(resource)}">
<input type="hidden" name="scope" value="${escapeHtml(scope)}">
<label for="secret">Login secret</label>
<input type="password" name="secret" id="secret" autocomplete="off" required autofocus>
<small>This single-user deployment uses the server-side login secret.</small>
<br><button type="submit">Authorize</button>
</form>
</body></html>`,
    );
  }

  async #handleAuthorizePost(
    req: IncomingMessage,
    res: ServerResponse,
    baseUrl: string,
  ): Promise<void> {
    const form = await readForm(req);
    const secret = form.get('secret') ?? '';
    const clientId = form.get('client_id') ?? '';
    const redirectUri = form.get('redirect_uri') ?? '';
    const state = form.get('state') ?? '';
    const codeChallenge = form.get('code_challenge') ?? '';
    const codeChallengeMethod = form.get('code_challenge_method') ?? '';
    const resource = form.get('resource') ?? baseUrl;

    if (!clientId || !redirectUri || !codeChallenge) {
      sendText(
        res,
        400,
        'Missing required parameters: client_id, redirect_uri, code_challenge',
      );
      return;
    }
    if (codeChallengeMethod && codeChallengeMethod !== 'S256') {
      sendText(res, 400, 'Unsupported code_challenge_method');
      return;
    }
    if (!this.#isAllowedRedirectUri(clientId, redirectUri)) {
      sendText(res, 400, 'Invalid client_id or redirect_uri');
      return;
    }
    if (secret !== this.config.loginSecret) {
      const retryPath = this.#buildAuthorizePath({
        client_id: clientId,
        redirect_uri: redirectUri,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
        resource,
      });
      sendHtml(
        res,
        403,
        `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Authorization Failed</title></head>
<body><h1>Authorization Failed</h1><p>Invalid login secret.</p><p><a href="${escapeHtml(retryPath)}">Try again</a></p></body></html>`,
      );
      return;
    }

    const code = generateCode();
    this.#authCodes.set(code, {
      clientId,
      codeChallenge,
      redirectUri,
      resource,
      expiresAt: Date.now() + CODE_TTL_MS,
    });

    const redirectUrl = parseAllowedRedirectUri(redirectUri);
    if (!redirectUrl) {
      sendText(res, 400, 'Invalid redirect_uri');
      return;
    }
    redirectUrl.searchParams.set('code', code);
    if (state) {
      redirectUrl.searchParams.set('state', state);
    }
    if (resource) {
      redirectUrl.searchParams.set('resource', resource);
    }
    sendRedirect(res, redirectUrl.toString());
  }

  async #handleToken(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const form = await readForm(req);
    const grantType = form.get('grant_type') ?? '';
    const code = form.get('code') ?? '';
    const redirectUri = form.get('redirect_uri') ?? '';
    const codeVerifier = form.get('code_verifier') ?? '';
    const clientId = form.get('client_id') ?? '';

    if (grantType !== 'authorization_code') {
      sendJson(res, 400, {error: 'unsupported_grant_type'});
      return;
    }
    if (!this.#isAllowedRedirectUri(clientId, redirectUri)) {
      sendJson(res, 400, {
        error: 'invalid_grant',
        error_description: 'Redirect URI is not registered for client',
      });
      return;
    }

    const entry = this.#authCodes.get(code);
    this.#authCodes.delete(code);
    if (!entry || entry.expiresAt < Date.now()) {
      sendJson(res, 400, {
        error: 'invalid_grant',
        error_description: 'Invalid or expired authorization code',
      });
      return;
    }
    if (entry.clientId !== clientId || entry.redirectUri !== redirectUri) {
      sendJson(res, 400, {
        error: 'invalid_grant',
        error_description: 'Client or redirect URI mismatch',
      });
      return;
    }
    if (sha256(codeVerifier) !== entry.codeChallenge) {
      sendJson(res, 400, {
        error: 'invalid_grant',
        error_description: 'PKCE verification failed',
      });
      return;
    }

    const accessToken = generateToken();
    this.#accessTokens.set(accessToken, {
      resource: entry.resource,
      expiresAt: Date.now() + ACCESS_TOKEN_TTL_MS,
    });
    sendJson(res, 200, {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
      scope: 'mcp',
    });
  }

  async #handleRegister(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const body = await readJsonObject(req);
    const parsedRedirectUris = parseRedirectUris(body.redirect_uris);
    if (parsedRedirectUris.hasInvalidUri) {
      sendJson(res, 400, {
        error: 'invalid_client_metadata',
        error_description: 'redirect_uris must contain only absolute http(s) URLs',
      });
      return;
    }
    if (parsedRedirectUris.redirectUris.length === 0) {
      sendJson(res, 400, {
        error: 'invalid_client_metadata',
        error_description: 'redirect_uris must include at least one URI',
      });
      return;
    }

    const clientId = `mcp-client-${generateCode().slice(0, 24)}`;
    const issuedAt = Math.floor(Date.now() / 1000);
    this.#clientRegistrations.set(clientId, {
      redirectUris: new Set(parsedRedirectUris.redirectUris),
    });
    sendJson(res, 201, {
      client_id: clientId,
      client_id_issued_at: issuedAt,
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      redirect_uris: parsedRedirectUris.redirectUris,
    });
  }
}

function isOriginAllowed(
  req: IncomingMessage,
  config: ChatGptHttpConfig,
): boolean {
  const origin = header(req, 'origin');
  if (!origin) {
    return true;
  }
  return config.allowedOrigins.includes(origin.trim());
}

function sendUnauthorized(res: ServerResponse, baseUrl: string): void {
  sendJson(
    res,
    401,
    {error: 'Unauthorized'},
    {
      'WWW-Authenticate': `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`,
    },
  );
}

function isMcpAuthenticated(
  req: IncomingMessage,
  oauth: ChatGptOAuthController,
): boolean {
  const token = extractBearerToken(req);
  return Boolean(token && oauth.isValidAccessToken(token));
}

async function handleSseReady(res: ServerResponse): Promise<void> {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  res.write(`event: message\ndata: ${JSON.stringify({type: 'endpoint', status: 'ready'})}\n\n`);
  res.end();
}

async function handleMcpPost(
  req: IncomingMessage,
  res: ServerResponse,
  args: ParsedArguments,
  options: ChatGptServerOptions,
  sessions: Map<string, RunningSession>,
): Promise<void> {
  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    sendJson(
      res,
      400,
      {jsonrpc: '2.0', id: null, error: {code: -32700, message: 'Parse error'}},
    );
    return;
  }

  const sessionId = header(req, 'mcp-session-id');
  if (sessionId) {
    const session = sessions.get(sessionId);
    if (!session) {
      sendJson(res, 404, {
        jsonrpc: '2.0',
        id: null,
        error: {code: -32001, message: 'Session not found'},
      });
      return;
    }
    await session.transport.handleRequest(req, res, body);
    return;
  }

  if (!isInitializeRequest(body)) {
    sendJson(res, 400, {
      jsonrpc: '2.0',
      id: null,
      error: {code: -32000, message: 'Bad Request: initialize is required'},
    });
    return;
  }

  const pending: PendingSessionRegistration = {};
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: createdSessionId => {
      if (pending.server && pending.transport) {
        sessions.set(createdSessionId, {
          server: pending.server,
          transport: pending.transport,
        });
      }
    },
  });
  const {server} = await createMcpServer(args, {logFile: options.logFile});
  pending.server = server;
  pending.transport = transport;
  transport.onclose = () => {
    const closedSessionId = transport.sessionId;
    if (closedSessionId) {
      sessions.delete(closedSessionId);
    }
    void server.close();
  };
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}

async function closeSessions(
  sessions: Map<string, RunningSession>,
): Promise<void> {
  const currentSessions = Array.from(sessions.values());
  sessions.clear();
  for (const session of currentSessions) {
    await session.transport.close();
    await session.server.close();
  }
}

export async function startChatGptHttpServer(
  args: ParsedArguments,
  options: ChatGptServerOptions,
  env: NodeJS.ProcessEnv = process.env,
): Promise<RunningChatGptServer> {
  const config = loadChatGptHttpConfig(args, env);
  const oauth = new ChatGptOAuthController(config);
  const sessions = new Map<string, RunningSession>();

  const server: Server = http.createServer((req, res) => {
    void (async () => {
      const method = req.method ?? 'GET';
      const baseUrl = requestBaseUrl(req, config);
      const requestUrl = new URL(req.url ?? '/', baseUrl);
      const pathname = requestUrl.pathname;

      if (method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Session-Id',
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Origin': header(req, 'origin') ?? '*',
        });
        res.end();
        return;
      }

      if (method === 'GET' && pathname === '/health') {
        sendJson(res, 200, {
          status: 'ok',
          name: 'chrome-devtools-mcp',
          version: VERSION,
          transports: ['stdio', 'streamable-http'],
          endpoints: ['/health', '/mcp'],
          oauth_enabled: true,
          static_bearer_enabled: true,
        });
        return;
      }

      if (oauth.canHandle(method, pathname)) {
        await oauth.handle(req, res, pathname, baseUrl);
        return;
      }

      if (pathname !== '/mcp') {
        sendText(res, 404, 'Not Found');
        return;
      }

      if (!isMcpAuthenticated(req, oauth)) {
        sendUnauthorized(res, baseUrl);
        return;
      }
      if (!isOriginAllowed(req, config)) {
        sendJson(res, 403, {error: 'Origin not allowed'});
        return;
      }

      if (method === 'GET') {
        const accept = header(req, 'accept')?.toLowerCase() ?? '';
        if (!accept.includes('text/event-stream')) {
          sendText(res, 405, 'Method Not Allowed');
          return;
        }
        await handleSseReady(res);
        return;
      }
      if (method === 'POST') {
        await handleMcpPost(req, res, args, options, sessions);
        return;
      }
      if (method === 'DELETE') {
        const sessionId = header(req, 'mcp-session-id');
        if (!sessionId) {
          sendText(res, 400, 'Invalid or missing session ID');
          return;
        }
        const session = sessions.get(sessionId);
        if (!session) {
          sendText(res, 404, 'Session not found');
          return;
        }
        await session.transport.handleRequest(req, res);
        return;
      }

      sendText(res, 405, 'Method Not Allowed');
    })().catch(error => {
      logger?.('ChatGPT HTTP server request failed', error);
      if (!res.headersSent) {
        sendJson(res, 500, {error: 'Internal Server Error'});
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const url = config.baseUrl || `http://127.0.0.1:${config.port}`;
  return {
    url,
    close: async () => {
      oauth.close();
      await closeSessions(sessions);
      await new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    },
  };
}
