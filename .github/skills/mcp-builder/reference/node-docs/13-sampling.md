# Sampling

## Overview

Sampling lets servers request LLM completions from clients. This keeps servers model-agnostic and leverages the host application for inference.

## SDK API

Server side:

- Server.createMessage(params)
- Uses sampling/createMessage under the hood
- Supports tool usage in sampling (tool_use/tool_result) when client advertises sampling.tools

Client side:

- Client.setRequestHandler('sampling/createMessage', handler)
- Client validates sampling requests and results against schemas

## Example

```ts
// Server requesting sampling
const result = await server.createMessage({
  messages: [{ role: 'user', content: { type: 'text', text: 'Summarize this.' } }],
  maxTokens: 200
});
```

## Tool-aware sampling

- If tools or toolChoice are provided, server checks sampling.tools capability.
- Client validates responses with tool-use schema when tools are involved.

## Edge cases

- If client does not support sampling, server should not call createMessage.
- Sampling can be task-augmented when tasks capability is enabled.

## Security notes

- Sampling requests may include user data; handle securely.
- Avoid passing secrets to untrusted clients.
