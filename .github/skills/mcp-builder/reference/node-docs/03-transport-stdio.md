# Transport: stdio

## Overview

The stdio transport is used for local MCP servers spawned as subprocesses. It communicates via stdin/stdout with line-delimited JSON-RPC messages.

The SDK provides:

- StdioClientTransport (client side)
- StdioServerTransport (server side)

## StdioClientTransport

Key behaviors:

- Spawns a child process via cross-spawn.
- Inherits a restricted set of environment variables by default.
- Supports optional stderr piping (stderr: 'pipe' or 'overlapped').
- Parses messages via ReadBuffer, ensuring messages are newline delimited.
- Handles process shutdown (stdin close, SIGTERM, SIGKILL).

## StdioServerTransport

Key behaviors:

- Reads from process.stdin, writes to process.stdout.
- Uses ReadBuffer to parse incoming messages.
- Stops listening on close and clears the buffer.

## Example: Client spawning a server

```ts
import { Client, StdioClientTransport } from '@modelcontextprotocol/client';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['server.js'],
  stderr: 'inherit'
});

const client = new Client({ name: 'my-client', version: '1.0.0' });
await client.connect(transport);
```

## Example: Server using stdio

```ts
import { McpServer, StdioServerTransport } from '@modelcontextprotocol/server';

const server = new McpServer({ name: 'my-server', version: '1.0.0' });
const transport = new StdioServerTransport();
await server.connect(transport);
```

## Edge cases

- Messages must not contain embedded newlines.
- Stdio transport is Node-only.
- Avoid logging to stdout. Use stderr for logs.

## Security notes

- Limit inherited environment variables; the SDK provides a safe default list.
- Avoid passing secrets via environment unless required.
