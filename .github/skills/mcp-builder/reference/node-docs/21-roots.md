# Roots (Client Capability)

## Overview

Roots are a client capability that allow servers to query the client for available root directories. This is commonly used for filesystem access or scoping.

## SDK API

Server side:

- server.request('roots/list')
- Server asserts client roots capability before calling

Client side:

- Client.setRequestHandler('roots/list', handler)
- Handler returns a list of root URIs

## Example

```ts
// Client-side
client.setRequestHandler('roots/list', async () => ({
  roots: [{ uri: 'file:///workspace', name: 'workspace' }]
}));
```

## Edge cases

- If client does not advertise roots capability, server must not call roots/list.

## Security notes

- Only expose roots that the user has approved.
