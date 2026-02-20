# Elicitation

## Overview

Elicitation allows servers to request additional user input through the client. It supports form mode (schema-based fields) and URL mode (out-of-band secure flows).

## SDK API

Server side:

- ctx.mcpReq.elicitInput(params, options?)
- ElicitRequest supports mode: form or url

Client side:

- Client.setRequestHandler('elicitation/create', handler)
- Client validates request schema and enforces supported modes
- Optional default application for form mode

## Modes

- Form mode: JSON schema limited to flat objects with primitive fields.
- URL mode: client opens URL with explicit user consent.

## Example

```ts
// Server requests form input
const result = await ctx.mcpReq.elicitInput({
  message: 'Provide your email',
  requestedSchema: {
    type: 'object',
    properties: { email: { type: 'string', format: 'email' } },
    required: ['email']
  }
});
```

## Edge cases

- Client capability controls supported modes; form is default if unspecified.
- URL mode requires client elicitation.url capability.
- Task augmentation can wrap elicitation in long-running flows.

## Security notes

- Do not collect sensitive data via form mode.
- Always display requester identity to the user.
