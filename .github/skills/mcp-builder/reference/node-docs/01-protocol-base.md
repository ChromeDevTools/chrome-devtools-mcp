# Protocol Base (Core)

## Overview

The @modelcontextprotocol/core package provides a Protocol class that implements MCP framing on top of any Transport. It handles:

- JSON-RPC request/response correlation
- Notifications
- Progress and cancellation
- Timeouts
- Task augmentation (if a TaskStore is configured)
- Debounced notifications

This is the foundation used by both Client and Server classes.

## SDK API surface

- Protocol<ContextT>
  - connect(transport)
  - close()
  - request(request, schema, options?)
  - notification(notification, options?)
  - setRequestHandler(method, handler)
  - setNotificationHandler(method, handler)
  - fallbackRequestHandler, fallbackNotificationHandler
- ProtocolOptions
  - supportedProtocolVersions
  - enforceStrictCapabilities
  - debouncedNotificationMethods
  - taskStore
  - taskMessageQueue
  - defaultTaskPollInterval
  - maxTaskQueueSize
- RequestOptions
  - onprogress, signal, timeout, resetTimeoutOnProgress, maxTotalTimeout
  - task (task augmentation)
  - relatedTask
- NotificationOptions
  - relatedRequestId, relatedTask

## Protocol behavior and guarantees

- Requests are assigned incremental IDs and tracked until response or timeout.
- JSON-RPC errors are wrapped into ProtocolError with ProtocolErrorCode.
- Progress notifications can extend request lifetime if resetTimeoutOnProgress is true.
- Cancellation is handled via notifications/cancelled.
- Debounced notifications coalesce messages within the same event loop tick.
- TaskStore enables tasks/get, tasks/list, tasks/result, tasks/cancel handlers.

## Context and callbacks

BaseContext includes:

- sessionId (if transport provides one)
- mcpReq.id, mcpReq.method, mcpReq.signal
- mcpReq.send and mcpReq.notify for related messages
- http.authInfo (if provided by transport)
- task context (if TaskStore configured)

ServerContext extends BaseContext with:

- mcpReq.log(level, data, logger?)
- mcpReq.elicitInput(params, options?)
- mcpReq.requestSampling(params, options?)

## Example: basic Protocol usage

```ts
import { Protocol } from '@modelcontextprotocol/core';

class MyProtocol extends Protocol {
  // implement buildContext and custom handlers as needed
}
```

In practice you rarely subclass Protocol directly; use Client or Server instead.

## Edge cases and constraints

- A Transport must be started before messages can be sent or received.
- If TaskStore is enabled, task handlers are installed immediately.
- Requests created before connect() are not supported.

## Security notes

- Protocol enforces schema validation for known methods when handlers are wrapped.
- Strict capability enforcement can prevent calls to unsupported methods.
