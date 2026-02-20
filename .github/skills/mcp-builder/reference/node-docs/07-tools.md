# Tools

## Overview

Tools are server-exposed executable actions. Clients discover tools via tools/list and invoke them via tools/call. The SDK provides a high-level API in McpServer for registering tools and validating inputs and outputs.

## SDK API

- McpServer.registerTool(name, metadata, handler)
  - metadata: title, description, inputSchema, outputSchema, annotations, execution
  - handler returns CallToolResult (or CreateTaskResult for task augmentation)
- Client.listTools()
- Client.callTool(name, args)

## Input and output schemas

- inputSchema uses Zod (AnySchema) and is converted to JSON Schema for clients.
- outputSchema is optional; if provided, handlers should return structuredContent.
- Server validates tool inputs and outputs against schemas.

## Content types

Tool results may contain:

- text
- image
- audio
- resource_link
- embedded resource

Structured content should be provided for machine parsing when outputSchema is set.

## Task support (optional)

Tools can indicate task support:

- execution.taskSupport: required | optional | forbidden
- registerToolTask (experimental) enables task-augmented tools
- optional task support may auto-poll to produce immediate results

## Example

```ts
server.registerTool(
  'calculate-bmi',
  {
    title: 'BMI Calculator',
    description: 'Calculate Body Mass Index',
    inputSchema: {
      weightKg: z.number(),
      heightM: z.number()
    },
    outputSchema: {
      bmi: z.number()
    }
  },
  async ({ weightKg, heightM }) => {
    const output = { bmi: weightKg / (heightM * heightM) };
    return {
      content: [{ type: 'text', text: JSON.stringify(output) }],
      structuredContent: output
    };
  }
);
```

## Edge cases

- Tool name validation warns on non-conforming names.
- Disabled tools are filtered from tools/list and rejected on tools/call.

## Security notes

- Validate inputs and sanitize outputs.
- Do not expose tools without user approval in hosts that require confirmation.
