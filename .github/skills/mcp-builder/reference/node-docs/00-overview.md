# MCP TypeScript SDK Overview

## Overview

The MCP TypeScript SDK (v2 main branch, pre-alpha) implements the Model Context Protocol for client and server applications. It is split into three primary packages and several optional middleware adapters:

- @modelcontextprotocol/server: high-level MCP server APIs and transports.
- @modelcontextprotocol/client: high-level MCP client APIs and transports.
- @modelcontextprotocol/core: protocol framing, shared types, schema utilities, and experimental task infrastructure.
- Middleware packages: @modelcontextprotocol/node, @modelcontextprotocol/express, @modelcontextprotocol/hono.

The SDK implements MCP over JSON-RPC 2.0 with capability negotiation, request/response correlation, and optional advanced features (sampling, elicitation, tasks, completions, logging, progress, cancellations).

## Package map

- Server package exports:
  - McpServer (high-level API for tools/resources/prompts)
  - Server (low-level API, deprecated for most uses)
  - StdioServerTransport
  - WebStandardStreamableHTTPServerTransport
  - Host header validation helpers
  - Experimental tasks APIs
- Client package exports:
  - Client (high-level client)
  - Transports: StreamableHTTPClientTransport, StdioClientTransport, SSEClientTransport (legacy), WebSocketClientTransport
  - OAuth helpers and auth extensions
  - Fetch middleware helpers
  - Experimental tasks APIs
- Core package exports:
  - Protocol class, request/notification types, JSON-RPC schemas, utilities
  - Zod schema helpers and JSON Schema validators
  - Auth metadata schemas and utilities
  - UriTemplate and tool name validation utilities
  - InMemoryTransport for tests

## Primary SDK flow

1) Client constructs Client with capabilities and connects to a Transport.
2) Client performs initialize handshake, negotiates protocol version and capabilities.
3) Server exposes tools/resources/prompts (and optional completions, logging, tasks).
4) Client invokes list and call operations on those primitives.

## Notable v2 characteristics

- v2 is pre-alpha on main; v1.x is still recommended for production.
- Zod v4 is required as a peer dependency.
- Streamable HTTP is the recommended transport; SSE transport is deprecated.
- Tasks are exposed as experimental APIs under experimental.* namespaces.

## Feature grouping

- Protocol framing: JSON-RPC, lifecycle, capabilities, notifications, progress, cancellation.
- Transports: stdio, streamable HTTP, SSE legacy, WebSocket, in-memory.
- Server primitives: tools, resources, prompts, completions, logging, notifications.
- Client primitives: sampling, elicitation, roots.
- Auth: OAuth 2.1-style flow for HTTP transports and helper providers.
- Utilities: schema conversion/validation, URI templates, tool naming rules, metadata display helpers.

## Cross-reference

- SDK API docs: https://modelcontextprotocol.github.io/typescript-sdk/
- MCP documentation: https://modelcontextprotocol.io/docs/
- MCP specification: https://modelcontextprotocol.io/specification/latest
