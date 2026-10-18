/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {LogpointFormatter} from '../formatters/LogpointFormatter.js';
import {LOGPOINT_FORMAT, parseLogpoint} from '../LogpointManager.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';

const SET_LOGPOINTS_TOOL_NAME = 'set_logpoints';
const LIST_CONSOLE_MESSAGES_TOOL_NAME = 'list_console_messages';

export const setLogpoints = definePageTool(() => ({
  name: SET_LOGPOINTS_TOOL_NAME,
  description: `Set the logpoints of the selected page. A logpoint logs the value of one or more expressions to the console every time a line of code executes, without pausing execution and without modifying the source code. It works like logpoints in the Chrome DevTools Sources panel and replaces temporarily instrumenting code with console.log() calls. The given list is the complete set of logpoints for the page: logpoints not in the list are removed, new ones are added and the expression of a logpoint at an existing location is replaced; an empty list removes all logpoints. Locations are given as the URL of a script as served to the browser or as an original source file (for example a TypeScript file), which is resolved through the source maps of the parsed scripts and re-resolved automatically when a rebuilt bundle is loaded. The logged output appears as regular console messages that can be read with ${LIST_CONSOLE_MESSAGES_TOOL_NAME}. Logpoints stay active across page reloads and navigations until they are removed or the page is closed. The response lists the resulting logpoints and where they are bound.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    logpoints: zod
      .array(zod.string())
      .describe(
        `The complete set of logpoints for the page, each formatted as ${LOGPOINT_FORMAT}. The url is the URL of a script as served to the browser or the path of an original source file resolvable through source maps, matched exactly or as a path suffix (e.g. "src/app.ts"). lineNumber and the optional columnNumber are 1-based in the coordinates of the url; a line without executable code moves the logpoint to the next possible location. The expression is formatted like the arguments of console.log() and is evaluated in the scope of the location, so local variables are accessible (for source-mapped locations by their original names). Example: "src/cart.ts:42 'cart total:', cart.total, cart.items.length". Pass an empty array to remove all logpoints.`,
      ),
  },
  blockedByDialog: false,
  verifyFilesSchema: {},
  handler: async (request, response) => {
    const logpoints = await request.page.setLogpoints(
      request.params.logpoints.map(parseLogpoint),
    );
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
      `Logged output appears in ${LIST_CONSOLE_MESSAGES_TOOL_NAME} once a line executes.`,
    );
  },
}));
