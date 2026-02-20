# Utilities and Helpers

## Overview

The core package provides utility modules that are reused across the SDK. These include tool name validation, URI templates, metadata helpers, and in-memory transports.

## Tool name validation

- validateToolName(name)
- validateAndWarnToolName(name)

Enforces tool name conventions (SEP-986) and emits warnings for non-conforming names.

## UriTemplate

- UriTemplate implements RFC 6570 style templates
- expand(variables) and match(uri)
- Protects against overly large templates and regexes

## Metadata helpers

- getDisplayName(metadata)

Resolves display names using title, annotations.title (for tools), and name.

## Response message helpers

- ResponseMessage types for task and result streams
- toArrayAsync, takeResult

## Transport helpers

- normalizeHeaders
- createFetchWithInit
- Transport interface definition

## InMemoryTransport

- createLinkedPair for in-process client-server testing
- Supports optional authInfo for testing

## Example

```ts
import { InMemoryTransport } from '@modelcontextprotocol/core';

const [clientT, serverT] = InMemoryTransport.createLinkedPair();
```

## Security notes

- UriTemplate has strict size limits to avoid regex DoS.
