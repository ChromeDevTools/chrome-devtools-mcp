# Notifications and List Changed

## Overview

MCP uses JSON-RPC notifications for out-of-band updates. The SDK supports list-changed notifications for tools, resources, and prompts, plus progress and cancellation notifications.

## List changed notifications

- notifications/tools/list_changed
- notifications/resources/list_changed
- notifications/prompts/list_changed

Servers emit these notifications when listChanged capability is enabled.

## Client listChanged handlers

Client can register listChanged handlers to automatically refresh lists:

```ts
const client = new Client({ name: 'my-client', version: '1.0.0' }, {
  listChanged: {
    tools: { onChanged: async (_err, tools) => console.log(tools) },
    resources: { onChanged: async (_err, resources) => console.log(resources) }
  }
});
```

Handlers are installed only if the server advertises listChanged support.

## Debounced notifications

ProtocolOptions.debouncedNotificationMethods allows coalescing notifications in the same tick.

## Edge cases

- If server does not advertise listChanged, client handlers are skipped silently.
- Notifications are one-way; no response is sent.

## Security notes

- Treat notifications as untrusted input; validate or sanitize as needed.
