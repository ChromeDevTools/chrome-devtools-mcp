# Transport: Streamable HTTP

## Overview

Streamable HTTP is the recommended MCP transport for remote servers. It uses HTTP POST for client-to-server messages and supports server-to-client messages over SSE, plus optional JSON-only response mode.

SDK components:

- WebStandardStreamableHTTPServerTransport (server, web-standard Request/Response)
- NodeStreamableHTTPServerTransport (server, Node IncomingMessage/ServerResponse)
- StreamableHTTPClientTransport (client)

## Server transport: WebStandardStreamableHTTPServerTransport

Key features:

- Supports GET (SSE) and POST (JSON-RPC request)
- Optional session IDs (stateful) via sessionIdGenerator
- Optional JSON-only response mode (enableJsonResponse)
- Optional resumability via EventStore
- Protocol version header validation
- Optional legacy DNS rebinding protection flags (deprecated in favor of middleware)

## Client transport: StreamableHTTPClientTransport

Key features:

- Sends JSON-RPC messages over POST
- Optional GET SSE stream for server notifications
- Reconnection with exponential backoff or server-provided retry
- Supports resumability via Last-Event-ID and resumption tokens
- Integrates OAuth flows (authProvider)
- Stores sessionId returned by server

## Example: Server (web standard)

```ts
import { McpServer, WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';

const server = new McpServer({ name: 'my-server', version: '1.0.0' });
const transport = new WebStandardStreamableHTTPServerTransport({
  sessionIdGenerator: () => crypto.randomUUID()
});
await server.connect(transport);

export default {
  async fetch(req: Request) {
    return transport.handleRequest(req);
  }
};
```

## Example: Client

```ts
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const transport = new StreamableHTTPClientTransport(new URL('https://example.com/mcp'));
const client = new Client({ name: 'my-client', version: '1.0.0' });
await client.connect(transport);
```

## Session handling

- If sessionIdGenerator is provided, server assigns session ID and expects it in subsequent requests.
- Clients store session ID and include mcp-session-id header.
- Missing session ID in stateful mode yields 400; expired session yields 404.

## Resumability

- EventStore enables replay after reconnect.
- Client uses Last-Event-ID for resumption on GET SSE.
- Client can reconnect after partial POST streams if priming event ID is provided.

## JSON response mode

- enableJsonResponse returns a single JSON response instead of SSE.
- Suitable for simple request-response servers with no notifications.

## Security notes

- Validate Origin/Host to avoid DNS rebinding (middleware recommended).
- Always enforce auth for remote servers.
- Use MCP-Protocol-Version header after initialization.
