/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import z from 'zod';

import {takeCdpSnapshot} from '../fast-cdp/fast-chat.js';
import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const cdpSnapshot = defineTool({
  name: 'take_cdp_snapshot',
  description:
    'Take a snapshot of what CDP is seeing on the ChatGPT/Gemini page. ' +
    'Use this to debug connection issues or verify page state. ' +
    'Returns URL, title, input field state, button state, message counts, and optionally a screenshot.',
  annotations: {
    category: ToolCategories.NAVIGATION_AUTOMATION,
    readOnlyHint: true,
  },
  schema: {
    target: z
      .enum(['chatgpt', 'gemini'])
      .describe('Which AI to take snapshot from'),
    includeScreenshot: z
      .boolean()
      .optional()
      .default(false)
      .describe('Include a screenshot (saved to /tmp)'),
    bodyTextLimit: z
      .number()
      .optional()
      .default(500)
      .describe('Max characters of body text to include'),
  },
  handler: async (request, response) => {
    const {target, includeScreenshot, bodyTextLimit} = request.params;

    try {
      const snapshot = await takeCdpSnapshot(target, {
        includeScreenshot: includeScreenshot ?? false,
        bodyTextLimit: bodyTextLimit ?? 500,
      });

      // フォーマットして出力
      response.appendResponseLine(`# CDP Snapshot: ${target}`);
      response.appendResponseLine(`Timestamp: ${snapshot.timestamp}`);
      response.appendResponseLine('');

      if (!snapshot.connected) {
        response.appendResponseLine(`❌ Not connected: ${snapshot.error || 'Unknown error'}`);
        return;
      }

      response.appendResponseLine('## Page Info');
      response.appendResponseLine(`- URL: ${snapshot.url}`);
      response.appendResponseLine(`- Title: ${snapshot.title}`);
      response.appendResponseLine(`- Ready State: ${snapshot.readyState}`);
      response.appendResponseLine(`- Element Count: ${snapshot.elementCount}`);
      response.appendResponseLine('');

      response.appendResponseLine('## Input Field');
      response.appendResponseLine(`- Found: ${snapshot.hasInputField ? '✅ Yes' : '❌ No'}`);
      if (snapshot.inputFieldSelector) {
        response.appendResponseLine(`- Selector: ${snapshot.inputFieldSelector}`);
      }
      response.appendResponseLine(`- Current Value: "${snapshot.inputFieldValue || '(empty)'}"`);
      response.appendResponseLine('');

      response.appendResponseLine('## Send Button');
      response.appendResponseLine(`- Found: ${snapshot.hasSendButton ? '✅ Yes' : '❌ No'}`);
      if (snapshot.sendButtonSelector) {
        response.appendResponseLine(`- Selector: ${snapshot.sendButtonSelector}`);
      }
      response.appendResponseLine(`- Disabled: ${snapshot.sendButtonDisabled ? '⚠️ Yes' : 'No'}`);
      response.appendResponseLine('');

      response.appendResponseLine('## Message Counts');
      response.appendResponseLine(`- User Messages: ${snapshot.userMessageCount ?? 'N/A'}`);
      response.appendResponseLine(`- Assistant Messages: ${snapshot.assistantMessageCount ?? 'N/A'}`);
      response.appendResponseLine('');

      response.appendResponseLine('## Other State');
      response.appendResponseLine(`- Stop Button: ${snapshot.hasStopButton ? '⚠️ Visible (generating)' : 'Not visible'}`);
      response.appendResponseLine(`- Login Prompt: ${snapshot.hasLoginPrompt ? '⚠️ Detected' : 'Not detected'}`);
      if (snapshot.visibleDialogs && snapshot.visibleDialogs.length > 0) {
        response.appendResponseLine(`- Dialogs: ${snapshot.visibleDialogs.join(', ')}`);
      }
      response.appendResponseLine('');

      if (snapshot.screenshotPath) {
        response.appendResponseLine('## Screenshot');
        response.appendResponseLine(`Saved to: ${snapshot.screenshotPath}`);
        response.appendResponseLine('');
      }

      response.appendResponseLine('## Body Text (excerpt)');
      response.appendResponseLine('```');
      response.appendResponseLine(snapshot.bodyText || '(empty)');
      response.appendResponseLine('```');

      if (snapshot.error) {
        response.appendResponseLine('');
        response.appendResponseLine(`⚠️ Partial error: ${snapshot.error}`);
      }

    } catch (error) {
      response.appendResponseLine(
        `❌ Failed to take snapshot: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});
