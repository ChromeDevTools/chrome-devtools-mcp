/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {SessionManager} from '../SessionManager.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';

export interface SessionToolDefinition {
  name: string;
  description: string;
  annotations: {
    title?: string;
    category: ToolCategory;
    readOnlyHint: boolean;
  };
  schema: zod.ZodRawShape;
  handler: (params: Record<string, unknown>) => Promise<string>;
}

export function createSessionTools(
  sessionManager: SessionManager,
): SessionToolDefinition[] {
  return [
    {
      name: 'create_session',
      description:
        'Create a new browser session by launching a new browser or connecting to an existing one. The new session becomes the active session.',
      annotations: {
        category: ToolCategory.SESSION,
        readOnlyHint: false,
      },
      schema: {
        name: zod
          .string()
          .optional()
          .describe('Optional human-readable name for the session.'),
        type: zod
          .enum(['launch', 'connect'])
          .describe(
            'Whether to launch a new browser or connect to an existing one.',
          ),
        browserUrl: zod
          .string()
          .optional()
          .describe(
            'For connect: HTTP URL of the browser debugging endpoint (e.g., http://127.0.0.1:9222).',
          ),
        wsEndpoint: zod
          .string()
          .optional()
          .describe(
            'For connect: WebSocket endpoint URL (e.g., ws://127.0.0.1:9222/devtools/browser/<id>).',
          ),
        wsHeaders: zod
          .record(zod.string())
          .optional()
          .describe(
            'For connect: custom headers for WebSocket connection as key-value pairs (e.g., for AWS SigV4 auth).',
          ),
        headless: zod
          .boolean()
          .optional()
          .describe('For launch: whether to run headless. Default: false.'),
        channel: zod
          .enum(['stable', 'canary', 'beta', 'dev'])
          .optional()
          .describe('For launch: Chrome channel. Default: stable.'),
        isolated: zod
          .boolean()
          .optional()
          .describe(
            'For launch: use temporary user data directory. Default: true.',
          ),
      },
      handler: async params => {
        if (params.type === 'launch') {
          const session = await sessionManager.launchSession({
            name: params.name as string | undefined,
            headless: params.headless as boolean | undefined,
            channel: params.channel as
              | 'stable'
              | 'canary'
              | 'beta'
              | 'dev'
              | undefined,
            isolated: params.isolated as boolean | undefined,
          });
          return `Created and activated session ${session.id} "${session.name}" (launched).`;
        } else {
          const session = await sessionManager.connectSession({
            name: params.name as string | undefined,
            browserUrl: params.browserUrl as string | undefined,
            wsEndpoint: params.wsEndpoint as string | undefined,
            wsHeaders: params.wsHeaders as Record<string, string> | undefined,
          });
          return `Created and activated session ${session.id} "${session.name}" (connected).`;
        }
      },
    },
    {
      name: 'list_sessions',
      description: 'List all active browser sessions.',
      annotations: {
        category: ToolCategory.SESSION,
        readOnlyHint: true,
      },
      schema: {},
      handler: async () => {
        const sessions = sessionManager.listSessions();
        if (sessions.length === 0) {
          return 'No active sessions.';
        }
        const lines = ['## Sessions'];
        for (const s of sessions) {
          const active = s.isActive ? ' [active]' : '';
          lines.push(
            `${s.id}: "${s.name}"${active} - ${s.connectionType} via ${s.connectionInfo} (${s.pageCount} page${s.pageCount !== 1 ? 's' : ''})`,
          );
        }
        return lines.join('\n');
      },
    },
    {
      name: 'select_session',
      description: 'Switch to a different browser session by ID or name.',
      annotations: {
        category: ToolCategory.SESSION,
        readOnlyHint: true,
      },
      schema: {
        sessionId: zod
          .number()
          .optional()
          .describe('The numeric ID of the session to select.'),
        name: zod
          .string()
          .optional()
          .describe('The name of the session to select.'),
      },
      handler: async params => {
        if (params.sessionId !== undefined) {
          sessionManager.selectSession(params.sessionId as number);
        } else if (params.name !== undefined) {
          sessionManager.selectSessionByName(params.name as string);
        } else {
          throw new Error('Either sessionId or name must be provided.');
        }
        const sessions = sessionManager.listSessions();
        const active = sessions.find(s => s.isActive);
        return active
          ? `Switched to session ${active.id} "${active.name}".`
          : 'Session selected.';
      },
    },
    {
      name: 'close_session',
      description:
        'Close and disconnect a browser session. If closing the active session, the next available session becomes active.',
      annotations: {
        category: ToolCategory.SESSION,
        readOnlyHint: false,
      },
      schema: {
        sessionId: zod.number().describe('The ID of the session to close.'),
      },
      handler: async params => {
        const id = params.sessionId as number;
        await sessionManager.closeSession(id);
        const remaining = sessionManager.listSessions();
        if (remaining.length === 0) {
          return `Closed session ${id}. No active sessions remaining.`;
        }
        const active = remaining.find(s => s.isActive);
        return `Closed session ${id}. Active session: ${active?.id} "${active?.name}".`;
      },
    },
  ];
}
