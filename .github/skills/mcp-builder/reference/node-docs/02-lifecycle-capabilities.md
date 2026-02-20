# Lifecycle and Capabilities

## Overview

MCP defines a strict lifecycle: initialize -> initialized -> operation -> shutdown. The SDK enforces this through Client and Server behavior.

## Lifecycle flow

1) Client sends initialize with protocolVersion, capabilities, clientInfo.
2) Server responds with protocolVersion, capabilities, serverInfo, optional instructions.
3) Client sends notifications/initialized.

After initialization, normal requests are permitted. Server should not send requests (except ping/logging) before initialized.

## SDK behaviors

- Client.connect() triggers initialization unless reconnecting with an existing sessionId.
- Server constructor sets handlers for initialize and notifications/initialized.
- Both sides validate protocolVersion against supportedProtocolVersions.
- Client and Server merge capabilities via mergeCapabilities.

## Capability negotiation

Capabilities are used to gate features:

Server-side:
- tools, resources, prompts, completions, logging, tasks, experimental

Client-side:
- sampling, elicitation, roots, tasks, experimental

SDK enforcement:

- Client asserts server capabilities for list/call/get methods.
- Server asserts client capabilities for sampling, elicitation, and roots.
- Server enforces notification permissions for logging, resources, tools, prompts, url elicitation.
- Optional strict capability enforcement can be enabled (enforceStrictCapabilities).

## List changed handling

- Servers can advertise listChanged for tools/resources/prompts.
- Client can install listChanged handlers that automatically refresh lists.

## Example: Client capabilities

```ts
import { Client } from '@modelcontextprotocol/client';

const client = new Client(
  { name: 'my-client', version: '1.0.0' },
  {
    capabilities: {
      sampling: {},
      elicitation: { form: {}, url: {} },
      roots: { listChanged: true }
    }
  }
);
```

## Example: Server capabilities

```ts
import { McpServer } from '@modelcontextprotocol/server';

const server = new McpServer(
  { name: 'my-server', version: '1.0.0' },
  { capabilities: { tools: { listChanged: true }, resources: {}, prompts: {} } }
);
```

## Edge cases

- Server may respond with a different protocol version; client should disconnect if unsupported.
- Strict capability enforcement should be enabled only when both sides fully advertise capabilities.

## Security notes

- Capability negotiation limits unexpected feature use and reduces misuse.
- Do not expose capabilities you do not support; SDK may enforce them.
