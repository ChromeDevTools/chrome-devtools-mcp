# Transport: HTTP + SSE (Legacy)

## Overview

The SSE transport is a legacy MCP transport (HTTP+SSE) kept for backwards compatibility. The SDK provides SSEClientTransport for clients. Server-side SSE is deprecated in v2.

## SSEClientTransport

Key behaviors:

- Opens an EventSource stream to the server (GET).
- Waits for an endpoint event which provides the POST endpoint.
- Sends JSON-RPC messages via POST to that endpoint.
- Supports OAuth authentication via OAuthClientProvider.
- Sets mcp-protocol-version header after initialization.

## Example: Client with SSE

```ts
import { Client, SSEClientTransport } from '@modelcontextprotocol/client';

const transport = new SSEClientTransport(new URL('https://legacy.example.com/sse'));
const client = new Client({ name: 'my-client', version: '1.0.0' });
await client.connect(transport);
```

## Migration notes

- Prefer StreamableHTTPClientTransport for new implementations.
- SSE transport is a bridge for older MCP servers (protocol 2024-11-05).
- Client can implement fallback: try Streamable HTTP, then SSE on 4xx.

## Security notes

- SSE transport must still follow OAuth rules when used over HTTP.
- Validate server origin when consuming the endpoint event.
