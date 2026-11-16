/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {LogpointFormatter} from '../formatters/LogpointFormatter.js';
import {
  LOGPOINT_FORMAT,
  LogpointError,
  parseLogpoint,
} from '../LogpointManager.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool, type PageToolFactory} from './ToolDefinition.js';
import {
  GET_CONSOLE_MESSAGE_TOOL_NAME,
  LIST_CONSOLE_MESSAGES_TOOL_NAME,
} from './toolNames.js';

const SET_LOGPOINTS_TOOL_NAME = 'set_logpoints';

export const setLogpoints: PageToolFactory = definePageTool(() => ({
  name: SET_LOGPOINTS_TOOL_NAME,
  description: `Set the complete set of logpoints of the selected page: logpoints not in the list are removed, new ones are added, and an empty list removes all. A logpoint logs expressions to the console every time a line executes, without pausing or changing the source, like logpoints in the DevTools Sources panel. Locations are script URLs or original source files resolved through source maps (not available with --no-source-maps; scripts in workers and out-of-process iframes are not supported). A location in a generated script moves to its original source line when a source map covers it, and locations on the same line become one logpoint with the last expression. Output appears in ${LIST_CONSOLE_MESSAGES_TOOL_NAME}; an expression that throws produces an error message without text. Logpoints survive reloads and navigations until removed or the page is closed. The response lists the resulting logpoints and where they are bound.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    conditions: ['javascriptEvaluation'],
  },
  schema: {
    logpoints: zod
      .array(zod.string())
      .describe(
        `Logpoints formatted as ${LOGPOINT_FORMAT}. The url is a script URL or the path of an original source file from a source map, exact or as a path suffix (e.g. "src/app.ts"). Line and column numbers are 1-based in the coordinates of the url; a line without executable code moves to the next possible location. The expression is evaluated like console.log() arguments in the scope of the location, where local variables are accessible by their original names, and runs before the line executes, so a variable declared on that line is not set yet. ${LIST_CONSOLE_MESSAGES_TOOL_NAME} shows objects as [object Object]: read them with ${GET_CONSOLE_MESSAGE_TOOL_NAME}, or log JSON.stringify(value) for plain data. Example: "src/cart.ts:42 'cart total:', cart.total, cart.items.length". Pass an empty array to remove all logpoints.`,
      ),
  },
  blockedByDialog: false,
  concurrency: 'page',
  verifyFilesSchema: {},
  handler: async (request, response) => {
    let logpoints;
    try {
      logpoints = await request.page.setLogpoints(
        request.params.logpoints.map(parseLogpoint),
      );
    } catch (error) {
      if (error instanceof LogpointError) {
        // The other logpoints were applied; report the resulting state.
        response.appendResponseLine(
          new LogpointFormatter(error.logpoints).toString(),
        );
      }
      throw error;
    }
    response.appendResponseLine(new LogpointFormatter(logpoints).toString());
    if (logpoints.length === 0) {
      return;
    }
    if (logpoints.some(logpoint => logpoint.sourceMapped)) {
      response.appendResponseLine(
        'Source-mapped locations are re-resolved automatically when a matching source map loads again (for example after a reload with a regenerated bundle). Note: on the first page load after a rebuild, code that runs during the load itself is not logged yet; if a load-time logpoint stays silent right after a rebuild, reload once more before concluding that the line does not run.',
      );
    }
    response.appendResponseLine(
      `Logged output appears in ${LIST_CONSOLE_MESSAGES_TOOL_NAME} once a line executes; objects show as [object Object] there, ${GET_CONSOLE_MESSAGE_TOOL_NAME} shows them as JSON.`,
    );
  },
}));
