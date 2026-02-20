# Schema Validation

## Overview

The SDK uses Zod v4 for developer-defined schemas and JSON Schema for protocol-level validation. It also provides JSON schema validators for runtime validation of structured outputs.

## Zod helpers

- AnySchema, AnyObjectSchema
- schemaToJson(schema, { io })
- parseSchema / parseSchemaAsync
- getSchemaShape, getSchemaDescription
- isOptionalSchema, unwrapOptionalSchema

## JSON Schema validators

- AjvJsonSchemaValidator (default on Node.js)
- CfWorkerJsonSchemaValidator (for edge runtimes)

These are used for:

- tool output validation
- elicitation response validation

## Example

```ts
import { schemaToJson } from '@modelcontextprotocol/core';
import { z } from 'zod';

const schema = z.object({ x: z.number() });
const json = schemaToJson(schema);
```

## Edge cases

- Multiple zod versions can cause deep type instantiation errors.
- Output schema validation is skipped if the tool result is isError or missing structuredContent.

## Security notes

- Validate user input and tool output to avoid schema bypass.
