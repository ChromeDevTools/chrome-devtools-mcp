/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {resolveNodeToRemoteObject} from '../ax-tree.js';
import {sendCdp} from '../browser.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {
  defineTool,
  ResponseFormat,
  responseFormatSchema,
  CHARACTER_LIMIT,
  checkCharacterLimit,
} from './ToolDefinition.js';

const EvaluateScriptOutputSchema = zod.object({
  success: zod.boolean(),
  result: zod.unknown(),
});

export const evaluateScript = defineTool({
  name: 'evaluate_script',
  description: `Evaluate a JavaScript function inside the currently selected page. Returns the response as JSON,
so returned values have to be JSON-serializable.

Args:
  - function (string): JavaScript function to execute in page context
  - args (array): Optional element UIDs to pass as arguments
  - response_format ('markdown'|'json'): Output format. Default: 'markdown'

Returns:
  JSON format: { success: true, result: <serialized return value> }
  Markdown format: "Script ran on page and returned:" + JSON code block

Examples:
  - "Get page title" -> { function: "() => document.title" }
  - "Get element text" -> { function: "(el) => el.innerText", args: [{ uid: "abc123" }] }
  - "Async fetch" -> { function: "async () => await fetch('/api').then(r => r.json())" }

Error Handling:
  - Throws with "Script error: ..." if execution fails
  - Returns error if response exceeds ${CHARACTER_LIMIT} chars`,
  timeoutMs: 15000,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
    conditions: ['directCdp'],
  },
  schema: {
    response_format: responseFormatSchema,
    function: zod.string().describe(
      `A JavaScript function declaration to be executed by the tool in the currently selected page.
Example without arguments: \`() => {
  return document.title
}\` or \`async () => {
  return await fetch("example.com")
}\`.
Example with arguments: \`(el) => {
  return el.innerText;
}\`
`,
    ),
    args: zod
      .array(
        zod.object({
          uid: zod
            .string()
            .describe(
              'The uid of an element on the page from the page content snapshot',
            ),
        }),
      )
      .optional()
      .describe(`An optional list of arguments to pass to the function.`),
  },
  outputSchema: EvaluateScriptOutputSchema,
  handler: async (request, response) => {
    const argObjectIds: string[] = [];
    try {
      for (const el of request.params.args ?? []) {
        const objectId = await resolveNodeToRemoteObject(el.uid);
        argObjectIds.push(objectId);
      }

      const fnSource = request.params.function;
      const callArgs = argObjectIds.map(id => ({objectId: id}));

      let result: string;

      if (argObjectIds.length > 0) {
        const wrapper = `async function(__fn, ...args) { return JSON.stringify(await (${fnSource})(...args)); }`;
        const callResult = await sendCdp('Runtime.callFunctionOn', {
          functionDeclaration: wrapper,
          objectId: argObjectIds[0],
          arguments: callArgs,
          returnByValue: true,
          awaitPromise: true,
        });
        if (callResult.exceptionDetails) {
          const desc =
            callResult.exceptionDetails.exception?.description ??
            callResult.exceptionDetails.text;
          throw new Error(`Script error: ${desc}`);
        }
        result = callResult.result?.value ?? 'undefined';
      } else {
        const expression = `(async () => { const __fn = (${fnSource}); return JSON.stringify(await __fn()); })()`;
        const evalResult = await sendCdp('Runtime.evaluate', {
          expression,
          returnByValue: true,
          awaitPromise: true,
        });
        if (evalResult.exceptionDetails) {
          const desc =
            evalResult.exceptionDetails.exception?.description ??
            evalResult.exceptionDetails.text;
          throw new Error(`Script error: ${desc}`);
        }
        result = evalResult.result?.value ?? 'undefined';
      }

      checkCharacterLimit(result, 'evaluate_script', {
        function: 'Filter or limit the data returned in your function',
      });

      if (request.params.response_format === ResponseFormat.JSON) {
        let parsedResult: unknown;
        try {
          parsedResult = JSON.parse(result);
        } catch {
          parsedResult = result;
        }
        response.appendResponseLine(JSON.stringify({
          success: true,
          result: parsedResult,
        }, null, 2));
        return;
      }

      response.appendResponseLine('Script ran on page and returned:');
      response.appendResponseLine('```json');
      response.appendResponseLine(`${result}`);
      response.appendResponseLine('```');
    } finally {
      for (const objectId of argObjectIds) {
        void sendCdp('Runtime.releaseObject', {objectId}).catch(() => {});
      }
    }
  },
});
