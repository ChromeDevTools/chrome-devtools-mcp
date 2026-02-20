# MCP TypeScript SDK Feature Overview (Index/TOC)

This document provides a high-level description of each feature in the MCP TypeScript SDK and maps them to the feature docs in this folder.

## Core and lifecycle

- Overview: High-level package map and SDK boundaries. See 00-overview.md
- Protocol base: JSON-RPC framing, requests, notifications, timeouts, tasks hooks. See 01-protocol-base.md
- Lifecycle and capabilities: Initialize handshake, capability negotiation, list-changed handling. See 02-lifecycle-capabilities.md

## Transports

- stdio: Local process transport over stdin/stdout. See 03-transport-stdio.md
- Streamable HTTP: Recommended HTTP transport with optional SSE streaming and sessions. See 04-transport-streamable-http.md
- HTTP+SSE (legacy): Compatibility transport for older servers. See 05-transport-sse-legacy.md
- WebSocket: Optional client transport over WebSocket. See 06-transport-websocket.md

## Server primitives

- Tools: Executable actions exposed by servers. See 07-tools.md
- Resources: Read-only context data and templates. See 08-resources.md
- Prompts: User-selectable prompt templates. See 09-prompts.md
- Completions: Argument auto-complete for prompts and resources. See 10-completions.md
- Notifications (list changed): Updates for tools/resources/prompts. See 11-notifications-list-changed.md
- Logging: Server-to-client structured logs and log levels. See 12-logging.md

## Client primitives

- Sampling: Server requests LLM outputs from client. See 13-sampling.md
- Elicitation: Server requests user input (form or URL). See 14-elicitation.md
- Roots: Client-provided root directories. See 21-roots.md

## Experimental

- Tasks: Long-running work with pollable status and results. See 15-tasks-experimental.md

## Security and validation

- OAuth and auth helpers: HTTP auth flow helpers and providers. See 16-auth-oauth.md
- Schema validation: Zod + JSON Schema validation utilities. See 17-schema-validation.md

## Integrations and utilities

- Middleware packages: Express, Hono, and Node adapters. See 18-middleware-packages.md
- Utilities: URI templates, tool naming rules, metadata helpers, in-memory transport. See 19-utilities.md
- Runtime shims: Node/workerd shims for validators and globals. See 20-shims-runtime.md
