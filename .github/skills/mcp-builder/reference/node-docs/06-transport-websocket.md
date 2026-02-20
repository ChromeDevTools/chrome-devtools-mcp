# Transport: WebSocket

## Overview

The SDK provides a WebSocketClientTransport for environments where MCP is exposed over WebSocket. This is not a primary MCP transport in the spec but is supported by the client SDK as an optional transport.

## WebSocketClientTransport

- Uses a subprotocol of "mcp".
- Parses JSON-RPC messages from WebSocket events.
- Provides standard Transport callbacks.

## Example

```ts
import { Client, WebSocketClientTransport } from '@modelcontextprotocol/client';

const transport = new WebSocketClientTransport(new URL('wss://example.com/mcp'));
const client = new Client({ name: 'my-client', version: '1.0.0' });
await client.connect(transport);
```

## Edge cases

- No built-in reconnection logic; caller should handle reconnect if needed.
- Ensure the server implements MCP JSON-RPC framing on the WebSocket channel.

## Security notes

- Use secure WebSocket (wss) in production.
- Apply normal MCP authorization at the application level if needed.
