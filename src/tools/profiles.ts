/**
 * Profile management MCP tools.
 */

import {defineTool} from './ToolDefinition.js';
import {ToolCategory} from './categories.js';
import {listProfiles} from '../config/profiles.js';
import {listSessions} from '../config/session-registry.js';
import {listSessionActivity} from '../utils/inactivity.js';
import {listProviders} from '../providers/registry.js';

export const listProfilesTool = defineTool({
  name: 'list_profiles',
  description:
    'List all configured browser profiles with their settings, active sessions, and cloud providers.',
  annotations: {
    category: ToolCategory.NAVIGATION,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (_request, response) => {
    const profiles = listProfiles();
    const sessions = listSessions();
    const activity = listSessionActivity();
    const providers = listProviders();

    response.appendResponseLine('## Browser Profiles');
    for (const p of profiles) {
      response.appendResponseLine(
        `- **${p.name}** [${p.driver}] port:${p.cdpPort} headless:${p.headless} channel:${p.channel}${p.cdpUrl ? ` cdp:${p.cdpUrl}` : ''}${p.attachOnly ? ' (attach-only)' : ''}`,
      );
    }

    if (sessions.length > 0) {
      response.appendResponseLine('\n## Active Sessions');
      for (const s of sessions) {
        const idle = activity.find(a => a.sessionKey === s.sessionKey);
        response.appendResponseLine(
          `- ${s.sessionKey}: ${s.tabCount} tab(s)${idle ? ` (idle ${Math.round(idle.idleMs / 1000)}s)` : ''}`,
        );
      }
    }

    if (providers.length > 0) {
      response.appendResponseLine('\n## Cloud Providers');
      for (const p of providers) {
        response.appendResponseLine(
          `- ${p.name}: ${p.configured ? '✓ configured' : '✗ not configured'}`,
        );
      }
    }
  },
});
