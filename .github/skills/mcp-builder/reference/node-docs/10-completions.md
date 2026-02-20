# Completions

## Overview

Completions provide argument auto-complete for prompt arguments and resource templates. The server exposes completion/complete, and clients can request suggestions.

## SDK API

Server side:

- McpServer registers completion handler automatically when completions capability is enabled.
- Completion is based on argsSchema or ResourceTemplate completions.

Client side:

- Client.complete(ref, argument, context?)

## Prompt completions

- Prompt argsSchema fields can be marked completable using helper functions in server/completable.
- On completion/complete with ref/prompt, server returns suggestions based on the completer.

## Resource template completions

- ResourceTemplate can provide completeCallback for variables.
- completion/complete with ref/resource uses template to generate suggestions.

## Example

```ts
// Example shape; see server/completable for field-level helpers
server.registerPrompt('search', {
  title: 'Search',
  argsSchema: { query: z.string() }
}, args => ({ messages: [] }));
```

## Edge cases

- If a prompt or template is not completable, server returns empty result.
- Attempting completion on fixed resources returns empty result (not an error).

## Security notes

- Completions are advisory; clients should validate arguments before use.
