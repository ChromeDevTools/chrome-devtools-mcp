# Middleware Packages

## Overview

Middleware packages provide thin adapters for common runtimes and frameworks. They do not add MCP features; they adapt request/response types and apply safe defaults.

## @modelcontextprotocol/express

- createMcpExpressApp(options?)
- hostHeaderValidation(allowedHostnames)
- localhostHostValidation()

Provides sensible defaults for MCP Express apps and DNS rebinding protection.

## @modelcontextprotocol/hono

- createMcpHonoApp(options?)
- hostHeaderValidation(allowedHostnames)
- localhostHostValidation()

Adds JSON body parsing and exposes parsedBody for Streamable HTTP.

## @modelcontextprotocol/node

- NodeStreamableHTTPServerTransport
- StreamableHTTPServerTransportOptions alias

Wraps web-standard transport for Node IncomingMessage/ServerResponse.

## Example: Express

```ts
import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { McpServer } from '@modelcontextprotocol/server';

const app = createMcpExpressApp();
const server = new McpServer({ name: 'my-server', version: '1.0.0' });

app.post('/mcp', async (req, res) => {
  const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
```

## Security notes

- Use host header validation for localhost servers to mitigate DNS rebinding.
