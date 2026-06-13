# ChatGPT Connector Mode

`chrome-devtools-mcp` normally runs as a local stdio MCP server. For ChatGPT
Developer Mode / Connectors, start it with `--chatgpt` to expose a Streamable
HTTP MCP endpoint with a single-user OAuth login flow.

## Endpoints

With `CHATGPT_MCP_BASE_URL=https://chrome-devtools.example.com`:

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Service health and capability summary |
| `POST /mcp` | Streamable HTTP MCP JSON-RPC endpoint |
| `GET /mcp` | SSE readiness endpoint for HTTP MCP clients |
| `GET /.well-known/oauth-protected-resource` | OAuth protected resource metadata |
| `GET /.well-known/oauth-authorization-server` | OAuth authorization server metadata |
| `POST /register` | Dynamic client registration |
| `GET /authorize` / `POST /authorize` | Login-secret authorization page |
| `POST /token` | PKCE authorization-code token exchange |

`/mcp` accepts either the static Bearer token or an OAuth access token issued by
this server.

## Required Environment

```sh
CHATGPT_MCP_BASE_URL=https://chrome-devtools.example.com
CHATGPT_MCP_TOKEN=<random static bearer token>
CHATGPT_MCP_LOGIN_SECRET=<single-user login secret>
CHATGPT_MCP_ALLOWED_ORIGINS=https://chatgpt.com,https://chat.openai.com
PORT=3000
```

Compatibility aliases are also supported:

- `OAUTH_BASE_URL` for `CHATGPT_MCP_BASE_URL`
- `MCP_TOKEN` for `CHATGPT_MCP_TOKEN`
- `OAUTH_LOGIN_SECRET` for `CHATGPT_MCP_LOGIN_SECRET`
- `ALLOWED_ORIGINS` for `CHATGPT_MCP_ALLOWED_ORIGINS`

When `NODE_ENV=production`, the static token must not be the default `dev-token`.

## Run Locally

```sh
CHATGPT_MCP_BASE_URL=http://127.0.0.1:3000 \
CHATGPT_MCP_TOKEN=dev-secret-token \
CHATGPT_MCP_LOGIN_SECRET=dev-login-secret \
npm run build

CHATGPT_MCP_BASE_URL=http://127.0.0.1:3000 \
CHATGPT_MCP_TOKEN=dev-secret-token \
CHATGPT_MCP_LOGIN_SECRET=dev-login-secret \
node build/src/bin/chrome-devtools-mcp.js \
  --chatgpt \
  --headless \
  --chrome-arg=--no-sandbox
```

## Docker

```sh
docker build -f deploy/chatgpt.Dockerfile -t chrome-devtools-mcp:chatgpt .
docker run -d --name chrome-devtools-mcp-chatgpt \
  -p 127.0.0.1:3000:3000 \
  -e CHATGPT_MCP_BASE_URL=https://chrome-devtools.example.com \
  -e CHATGPT_MCP_TOKEN=<random static bearer token> \
  -e CHATGPT_MCP_LOGIN_SECRET=<single-user login secret> \
  chrome-devtools-mcp:chatgpt
```

Put Nginx, Caddy, or another reverse proxy in front of the container and forward
`https://<domain>/health`, `https://<domain>/mcp`, and the OAuth endpoints to
container port `3000`.

## ChatGPT Setup

1. Open ChatGPT settings and enable Developer Mode under Apps & Connectors.
2. Create a Connector.
3. Use `https://<domain>/mcp` as the Connector URL.
4. Select OAuth with a user-provided OAuth client.
5. Use these URLs:
   - Authorization URL: `https://<domain>/authorize`
   - Token URL: `https://<domain>/token`
   - Registration URL: `https://<domain>/register`
   - Authorization server base: `https://<domain>`
   - Resource: `https://<domain>`
6. Use token endpoint auth method `none`.
7. On first authorization, enter `CHATGPT_MCP_LOGIN_SECRET` in the login page.

## Notes

- This is a single-user login flow modeled after `ZeroPointSix/remote-dev-mcp`.
- The OAuth authorization codes and access tokens are in memory, so restarting
  the process requires re-authorizing the connector.
- Any tool call can inspect or modify the connected Chrome profile. Use a
  dedicated Chrome profile or `--isolated` for safer tests.
