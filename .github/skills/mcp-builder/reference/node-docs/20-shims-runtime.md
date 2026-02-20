# Runtime Shims

## Overview

The SDK provides runtime shims for Node and workerd-style environments to normalize globals used by the client and server packages.

## Client shims

- @modelcontextprotocol/client/_shims
  - node and workerd builds
  - DefaultJsonSchemaValidator is selected based on runtime

## Server shims

- @modelcontextprotocol/server/_shims
  - node and workerd builds
  - process shim for web-standard runtimes

## When to use

- If your runtime does not provide Node globals, use workerd shims.
- In Node.js, shims are resolved automatically via package exports.

## Security notes

- Ensure global crypto is available in older Node versions for OAuth helpers.
