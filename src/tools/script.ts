/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {resolveNodeToRemoteObject} from '../ax-tree.js';
import {sendCdp} from '../browser.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const evaluateScript = defineTool({
  name: 'evaluate_script',
  description: `Evaluate a JavaScript function inside the currently selected page. Returns the response as JSON,
so returned values have to be JSON-serializable.`,
  timeoutMs: 15000,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    conditions: ['directCdp'],
  },
  schema: {
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
  handler: async (request, response) => {
    const argObjectIds: string[] = [];
    try {
      for (const el of request.params.args ?? []) {
        const objectId = await resolveNodeToRemoteObject(el.uid);
        argObjectIds.push(objectId);
      }

      // Build a Runtime.callFunctionOn expression
      // If we have element args, call on the first arg's context
      // Otherwise call on the global (no objectId → evaluates in page context)
      const fnSource = request.params.function;
      const callArgs = argObjectIds.map(id => ({objectId: id}));

      let result: string;

      if (argObjectIds.length > 0) {
        // Use callFunctionOn with the first element as `this`, rest as args
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
        // No args — use Runtime.evaluate in page context
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
