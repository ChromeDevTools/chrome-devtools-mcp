/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';
import type {WebSocketMessage} from '../WebSocketCollector.js';
import {MAX_STORED_PAYLOAD_LENGTH} from '../WebSocketCollector.js';

import {ToolCategory} from './categories.js';
import {definePageTool} from './ToolDefinition.js';

const LIST_CONNECTIONS_TOOL_NAME = 'list_websocket_connections';
const LIST_MESSAGES_TOOL_NAME = 'list_websocket_messages';
const GET_MESSAGE_TOOL_NAME = 'get_websocket_message';

const PREVIEW_LENGTH = 160;

function formatPreview(message: WebSocketMessage): string {
  const kind = message.opcode === 2 ? ' binary (base64)' : '';
  const singleLine = message.payload.replaceAll(/\s*\n\s*/g, ' ');
  const preview =
    singleLine.length > PREVIEW_LENGTH
      ? `${singleLine.slice(0, PREVIEW_LENGTH)}…`
      : singleLine;
  const time = message.receivedAt.toISOString().slice(11, 23);
  const size = message.truncated
    ? `${message.payloadLength} chars, stored truncated to ${message.payload.length}`
    : `${message.payloadLength} chars`;
  return `#${message.id} [${message.direction} ${time}]${kind} (${size}): ${preview}`;
}

export const listWebSocketConnections = definePageTool({
  name: LIST_CONNECTIONS_TOOL_NAME,
  description: `List the WebSocket connections of the currently selected page. Open connections are always listed, including connections created early during page load; closed connections are listed until the page navigates. Traffic is captured from the moment the page is inspected: messages exchanged before that are not recorded, so reload the page to capture a connection from its start. Use ${LIST_MESSAGES_TOOL_NAME} to inspect the messages of a connection; wsIds are scoped to the page that created the connection.`,
  annotations: {
    category: ToolCategory.NETWORK,
    readOnlyHint: true,
  },
  schema: {
    includePreservedConnections: zod
      .boolean()
      .default(false)
      .optional()
      .describe(
        'Set to true to also return closed connections preserved over the last 3 navigations.',
      ),
  },
  blockedByDialog: false,
  verifyFilesSchema: [],
  handler: async (request, response) => {
    const connections = request.page.getWebSocketConnections(
      request.params.includePreservedConnections,
    );
    if (!connections.length) {
      response.appendResponseLine(
        'No WebSocket connections were captured on the selected page. Connections are captured from the moment the page is inspected; reload the page to capture connections created during page load.',
      );
      return;
    }
    for (const connection of connections) {
      const wsId = request.page.getWebSocketConnectionStableId(connection);
      const dropped = connection.droppedMessages
        ? ` (${connection.droppedMessages} oldest messages dropped)`
        : '';
      response.appendResponseLine(
        `wsId=${wsId} [${connection.status}] ${connection.url} — ${connection.sentCount} sent, ${connection.receivedCount} received${dropped}`,
      );
    }
  },
});

export const listWebSocketMessages = definePageTool({
  name: LIST_MESSAGES_TOOL_NAME,
  description: `List the messages of a WebSocket connection of the currently selected page, oldest first. Message payloads are shown as a single-line preview; use ${GET_MESSAGE_TOOL_NAME} for a full payload. Only data messages are recorded (no ping/pong control frames). Retention is bounded per connection: the last 500 messages within a 2MB budget, and stored payloads are capped at ${MAX_STORED_PAYLOAD_LENGTH} characters (longer ones are marked truncated).`,
  annotations: {
    category: ToolCategory.NETWORK,
    readOnlyHint: true,
  },
  schema: {
    wsId: zod
      .number()
      .int()
      .describe(
        `The id of the WebSocket connection as reported by ${LIST_CONNECTIONS_TOOL_NAME}.`,
      ),
    direction: zod
      .enum(['sent', 'received'])
      .optional()
      .describe(
        'Only return messages sent by the page ("sent") or received from the server ("received").',
      ),
    filter: zod
      .string()
      .optional()
      .describe(
        'Case-sensitive substring; only messages whose payload contains it are returned.',
      ),
    pageSize: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Maximum number of messages to return. When omitted, returns all retained messages.',
      ),
    pageIdx: zod
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Page number to return (0-based). When omitted, returns the first page.',
      ),
  },
  blockedByDialog: false,
  verifyFilesSchema: [],
  handler: async (request, response) => {
    const {wsId, direction, filter, pageSize, pageIdx} = request.params;
    const connection = request.page.getWebSocketConnectionById(wsId);
    let messages = connection.getMessages();
    if (direction) {
      messages = messages.filter(message => message.direction === direction);
    }
    if (filter !== undefined) {
      messages = messages.filter(message => message.payload.includes(filter));
    }
    const total = messages.length;
    if (pageSize !== undefined) {
      const start = (pageIdx ?? 0) * pageSize;
      messages = messages.slice(start, start + pageSize);
    }
    const dropped = connection.droppedMessages
      ? ` The ${connection.droppedMessages} oldest messages were dropped.`
      : '';
    response.appendResponseLine(
      `${total} message(s) for wsId=${wsId}, showing ${messages.length}.${dropped}`,
    );
    for (const message of messages) {
      response.appendResponseLine(formatPreview(message));
    }
  },
});

export const getWebSocketMessage = definePageTool({
  name: GET_MESSAGE_TOOL_NAME,
  description: `Get the payload of a WebSocket message by its id. You can list messages with ${LIST_MESSAGES_TOOL_NAME}. Stored payloads are capped at ${MAX_STORED_PAYLOAD_LENGTH} characters.`,
  annotations: {
    category: ToolCategory.NETWORK,
    readOnlyHint: true,
  },
  schema: {
    wsId: zod
      .number()
      .int()
      .describe(
        `The id of the WebSocket connection as reported by ${LIST_CONNECTIONS_TOOL_NAME}.`,
      ),
    messageId: zod
      .number()
      .int()
      .describe(
        `The id of the message as reported by ${LIST_MESSAGES_TOOL_NAME}.`,
      ),
    filePath: zod
      .string()
      .optional()
      .describe(
        'The absolute or relative path of a file to save the payload to. If omitted, the payload is returned inline. The file is saved with a .txt extension and the path must be inside the configured workspace roots.',
      ),
  },
  blockedByDialog: false,
  verifyFilesSchema: ['filePath'],
  handler: async (request, response, context) => {
    const {wsId, messageId, filePath} = request.params;
    const connection = request.page.getWebSocketConnectionById(wsId);
    const message = connection.getMessage(messageId);
    if (!message) {
      throw new Error(
        `No message with id ${messageId} is retained for wsId=${wsId}. It may have been dropped after ${connection.droppedMessages} older messages exceeded the retention limit.`,
      );
    }
    const description = `Message #${message.id} [${message.direction}] on ${connection.url}${message.opcode === 2 ? ', binary (base64)' : ''}`;
    if (message.truncated) {
      response.appendResponseLine(
        `${description}. The stored payload was truncated from ${message.payloadLength} to ${message.payload.length} characters.`,
      );
    } else {
      response.appendResponseLine(`${description}:`);
    }
    if (filePath !== undefined) {
      const data = new TextEncoder().encode(message.payload);
      const {filename} = await context.saveFile(data, filePath, '.txt');
      response.appendResponseLine(`Payload saved to ${filename}.`);
      return;
    }
    response.appendResponseLine('```');
    response.appendResponseLine(message.payload);
    response.appendResponseLine('```');
  },
});
