/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {getRenderBlockingRequests} from '../trace-processing/parse.js';

import {ToolCategory} from './categories.js';
import {RENDER_BLOCKING_UI_CONTENT} from './render_blocking_ui.js';
import {defineTool} from './ToolDefinition.js';

export const showRenderBlockingRequests = defineTool({
  name: 'performance_show_render_blocking_requests',
  description:
    'Displays a list of network requests that blocked the initial render of the page. Use this tool when you want to identify resources (CSS, JS, etc.) that are delaying First Paint.',
  annotations: {
    category: ToolCategory.PERFORMANCE,
    readOnlyHint: true,
  },
  _meta: {
    ui: {
      resourceUri: 'ui://performance/render-blocking',
      visibility: ['model', 'app'],
    },
  },
  schema: {},
  handler: async (_request, response, context) => {
    // Reference RENDER_BLOCKING_UI_CONTENT to avoid unused var error
    void RENDER_BLOCKING_UI_CONTENT;
    
    const lastRecording = context.recordedTraces().at(-1);
    if (!lastRecording) {
      response.appendResponseLine(
        'No recorded traces found. Record a performance trace so you have requests to analyze.',
      );
      return;
    }

    const blockingRequests = getRenderBlockingRequests(lastRecording);

    if (blockingRequests.length === 0) {
      response.appendResponseLine(
        'No render blocking bandwidth requests found in the current recording.',
      );
      return;
    }

    response.appendResponseLine('Render Blocking Requests UI opened.');
    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify({blockingRequests}, null, 2),
    );
    response.appendResponseLine('```');
  },
});
