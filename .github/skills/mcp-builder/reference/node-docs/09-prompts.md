# Prompts

## Overview

Prompts are server-defined templates for LLM interactions. They are user-controlled primitives intended for explicit selection.

## SDK API

- McpServer.registerPrompt(name, metadata, handler)
  - metadata: title, description, argsSchema
  - handler returns messages array
- Client.listPrompts()
- Client.getPrompt(name, args)

## Example

```ts
server.registerPrompt(
  'review-code',
  {
    title: 'Code Review',
    description: 'Review code for best practices',
    argsSchema: { code: z.string() }
  },
  ({ code }) => ({
    messages: [
      { role: 'user', content: { type: 'text', text: `Review:\n\n${code}` } }
    ]
  })
);
```

## Completion support

- Prompts with argsSchema can provide completion via completion/complete.

## Edge cases

- Disabled prompts are excluded from prompts/list and rejected on prompts/get.

## Security notes

- Validate prompt arguments to prevent injection or abuse.
