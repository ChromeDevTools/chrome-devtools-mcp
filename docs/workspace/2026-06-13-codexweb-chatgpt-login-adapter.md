# ChatGPT Login Adapter Workspace Notes

Date: 2026-06-13
Branch: `codexweb/chatgpt-login-adapter`
Base: `main` at `ed02047ae90f25c4c15adb8fd7e224b963f43135`

## Goal

Add a ChatGPT-compatible login option to `chrome-devtools-mcp`, using the existing stdio MCP behavior by default and exposing an opt-in Streamable HTTP/OAuth mode for ChatGPT connector testing.

## Implementation Summary

- Added an opt-in `--chatgpt` CLI mode that starts an HTTP MCP server instead of stdio.
- Kept existing stdio behavior unchanged when `--chatgpt` is not provided.
- Added Streamable HTTP MCP support at `/mcp` with session handling.
- Added OAuth metadata endpoints for ChatGPT discovery:
  - `/.well-known/oauth-protected-resource`
  - `/.well-known/oauth-protected-resource/mcp`
  - `/.well-known/oauth-authorization-server`
- Added dynamic client registration at `/register`.
- Added PKCE authorization-code endpoints at `/authorize` and `/token`.
- Added a single-user login secret flow modeled after the remote-dev-mcp ChatGPT login pattern.
- Added optional static Bearer token support for direct MCP testing.
- Added health check endpoint at `/health`.
- Added Docker deployment support in `deploy/chatgpt.Dockerfile`.
- Added user-facing setup notes in `docs/chatgpt.md`.
- Added `.dockerignore` to keep Docker build context small.

## Runtime Configuration

The new mode supports these environment variables:

- `CHATGPT_MCP_BASE_URL` or `OAUTH_BASE_URL`
- `CHATGPT_MCP_TOKEN` or `MCP_TOKEN`
- `CHATGPT_MCP_LOGIN_SECRET` or `OAUTH_LOGIN_SECRET`
- `CHATGPT_MCP_ALLOWED_ORIGINS` or `ALLOWED_ORIGINS`
- `CHATGPT_MCP_PORT` or `PORT`

Production mode rejects the default development token.

## VPS Deployment

Temporary test deployment is live on:

- Health: `https://tmp1.zerodotsix.top/health`
- MCP endpoint: `https://tmp1.zerodotsix.top/mcp`

VPS details:

- Working directory: `/tmp/codexweb-chrome-devtools-mcp-20260613`
- Container: `chrome-devtools-mcp-chatgpt-test`
- Image: `chrome-devtools-mcp:chatgpt-test`
- Local port mapping: `127.0.0.1:3031 -> 3000`
- Nginx site: `/etc/nginx/sites-available/tmp1-chrome-devtools-mcp`
- TLS certificate: issued by certbot for `tmp1.zerodotsix.top`, expires 2026-09-11
- Runtime env file: `/root/chrome-devtools-mcp-chatgpt.env`

The env file contains the test token and login secret. They are intentionally not written into this repository note.

## Validation

Passed:

- Docker image builds successfully from `deploy/chatgpt.Dockerfile`.
- Focused HTTP/OAuth test passes:
  - `npm run test:no-build tests/chatgpt-http-server.test.ts`
- Public health endpoint returns HTTP 200 and reports both `stdio` and `streamable-http` transports.
- OAuth authorization-server metadata returns the expected issuer and endpoint URLs.
- OAuth protected-resource metadata returns the expected resource and auth server references.
- Unauthenticated `/mcp` requests return HTTP 401 with a `WWW-Authenticate` header pointing ChatGPT to the protected-resource metadata URL.
- Static Bearer token MCP initialize works over public HTTPS and returns a session id.
- Static Bearer token `tools/list` works over the same MCP session and returns 29 tools.
- Dynamic OAuth client registration works.
- PKCE authorization-code flow with the configured login secret returns a redirect with `code`, `state`, and `resource`.
- Token exchange returns a Bearer access token.
- OAuth Bearer token MCP initialize works over public HTTPS.

Full-suite status:

- Full test attempt in `node:22-bookworm` failed because Chrome was not installed in that image.
- Full test attempt inside the built Chrome image ran through many Chrome-backed tests but exited non-zero late in the suite with repeated `TargetCloseError: Protocol error (Target.setDiscoverTargets): Target closed` failures. The failures appear tied to the Docker/Chrome test environment closing the browser target mid-suite rather than to the new ChatGPT HTTP/OAuth path.

Sandbox status:

- The required remote sandbox tool could not be used for the test run because the exposed schema rejects `note`, while the backend requires `note`. This matches the previously recorded tool mismatch. VPS validation was used for deployment and service testing instead.

## Follow-Up

- Re-run the full suite in the intended CI or a Chrome-capable sandbox once the sandbox schema mismatch is fixed.
- Connect ChatGPT to `https://tmp1.zerodotsix.top/mcp` and verify the interactive login flow from the ChatGPT UI.
- Decide whether to keep the temporary `tmp1.zerodotsix.top` deployment, rotate secrets, or tear it down after testing.
