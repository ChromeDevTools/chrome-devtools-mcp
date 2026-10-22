/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {DOMAIN_PACKS} from '../capabilities/DomainPacks.js';
import type {McpContext} from '../McpContext.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

interface JsonSchemaObject {
  properties?: Record<string, unknown>;
  required?: string[];
}

function toJsonSchemaSafe(schema: unknown): JsonSchemaObject {
  try {
    const z = zod as unknown as {
      toJSONSchema: (
        s: unknown,
        opts: {unrepresentable: string},
      ) => JsonSchemaObject;
    };
    return z.toJSONSchema(schema, {unrepresentable: 'any'});
  } catch {
    return {};
  }
}

export const manageCapabilities = defineTool(() => ({
  name: 'manage_capabilities',
  description:
    'Manage on-demand capability packs. list, enable, disable, or call fallback.',

  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    conditions: ['metaFeatureSystem'],
  },
  blockedByDialog: false,
  verifyFilesSchema: {},
  schema: {
    action: zod
      .enum(['list', 'enable', 'disable', 'call'])
      .describe('Action to perform.'),
    capability: zod
      .string()
      .optional()
      .describe(
        'Single capability pack ID to enable/disable (e.g. memory, performance, audits, screencast, pwa, webmcp; locked by default: extensions).',
      ),
    capabilities: zod
      .array(zod.string())
      .optional()
      .describe('Multiple capability pack IDs to enable/disable.'),
    tool: zod
      .string()
      .optional()
      .describe('Tool name to call (only for action: "call").'),
    toolArgs: zod
      .record(zod.string(), zod.unknown())
      .optional()
      .describe('Arguments for the tool (only for action: "call").'),
  },
  handler: async (request, response, context: McpContext) => {
    const {action, capability, capabilities, tool, toolArgs} = request.params;
    const packsToProcess = capabilities
      ? capabilities
      : capability
        ? [capability]
        : [];

    const mcpServer = context.mcpServer;
    const capabilityManager = mcpServer?.capabilityManager;
    if (!mcpServer || !capabilityManager) {
      throw new Error('CapabilityManager is not initialized.');
    }

    if (action === 'list') {
      const active = capabilityManager.getActivePacks();
      const allPacks = DOMAIN_PACKS.map(p => ({
        id: p.id,
        policy: capabilityManager.getPackPolicy(p.id),
        tools: p.tools,
        active: active.includes(p.id),
        summary: p.summary,
      }));

      const corePack = DOMAIN_PACKS.find(p => p.id === 'core');
      let coreTokens = 0;
      let activeTokens = 0;
      let totalTokens = 0;

      const tools = mcpServer.getRegisteredTools();
      for (const entry of tools) {
        const toolName = entry.handler.tool.name;
        const isActive =
          !entry.handler.disabled &&
          (toolName === 'manage_capabilities' ||
            capabilityManager.isToolActive(toolName));
        const policy = capabilityManager.getToolPolicy(toolName);
        if (!isActive && policy !== 'on-demand') {
          continue;
        }

        const toolStr = JSON.stringify({
          name: toolName,
          description: entry.handler.tool.description,
          inputSchema: toJsonSchemaSafe(entry.handler.registeredInputSchema),
        });
        const tokens = Math.ceil(toolStr.length / 4);

        totalTokens += tokens;

        if (isActive) {
          activeTokens += tokens;
        }
        if (
          toolName === 'manage_capabilities' ||
          (corePack?.tools.includes(toolName) && !entry.handler.disabled)
        ) {
          coreTokens += tokens;
        }
      }
      const tokenSavingsPercent =
        totalTokens > 0
          ? Math.round(((totalTokens - coreTokens) / totalTokens) * 100)
          : 0;

      response.appendResponseLine(
        JSON.stringify(
          {
            packs: allPacks,
            message: 'Use enable to activate a pack.',
            startupTokenSavingsPercent: tokenSavingsPercent,
            coreTokens,
            activeTokens,
            totalCatalogTokens: totalTokens,
          },
          null,
          2,
        ),
      );
      return;
    }

    if (action === 'enable' || action === 'disable') {
      if (packsToProcess.length === 0) {
        throw new Error('No capabilities provided to ' + action);
      }

      const startTime = Date.now();
      const results: Array<{
        pack: string;
        success: boolean;
        error?: string;
        microSkill?: string;
        tools?: Array<Record<string, unknown>>;
      }> = [];
      let anyChanged = false;

      const registeredTools = mcpServer.getRegisteredTools();
      for (const pack of packsToProcess) {
        if (action === 'enable') {
          if (pack === 'pwa' && !mcpServer.isPipeConnection) {
            results.push({
              pack,
              success: false,
              error:
                "Capability 'pwa' is only supported with a pipe connection; autoConnect, browserUrl, and wsEndpoint are not supported.",
            });
            continue;
          }
          const res = capabilityManager.enablePack(pack);
          if (res.success) {
            anyChanged = true;
            const packDef = DOMAIN_PACKS.find(p => p.id === pack);
            const enabledTools = (packDef?.tools || []).map(toolName => {
              const entry = registeredTools.find(
                e => e.handler.tool.name === toolName,
              );
              if (!entry) {
                return {name: toolName};
              }
              const inputSchema = toJsonSchemaSafe(
                entry.handler.registeredInputSchema,
              );
              return {
                name: toolName,
                description: entry.handler.tool.description,
                parameters: inputSchema.properties || {},
                required: inputSchema.required || [],
              };
            });
            results.push({pack, ...res, tools: enabledTools});
          } else {
            results.push({pack, ...res});
          }
        } else {
          const res = capabilityManager.disablePack(pack);
          results.push({pack, ...res});
          if (res.success) {
            anyChanged = true;
          }
        }
      }

      if (anyChanged) {
        mcpServer.updateToolCapabilities();
        mcpServer.notifyToolsListChanged();
      }

      const latencyMs = Date.now() - startTime;
      for (const r of results) {
        await mcpServer.telemetry?.logCapabilityEvent({
          action,
          packId: r.pack,
          policyTier: capabilityManager.getPackPolicy(r.pack),
          clientSupportsListChanged: mcpServer.clientSupportsListChanged,
          latencyMs,
          success: r.success,
        });
      }

      const responsePayload: Record<string, unknown> = {results};
      if (action === 'enable' && anyChanged) {
        responsePayload.fallbackInstruction =
          "If your client doesn't support dynamic tool updates, use action: 'call' to invoke the newly enabled tools.";
      }
      response.appendResponseLine(JSON.stringify(responsePayload, null, 2));
      return;
    }

    if (action === 'call') {
      if (!tool) {
        throw new Error('Tool name required for action "call".');
      }

      const pack = DOMAIN_PACKS.find(p => p.tools.includes(tool))?.id || 'core';
      if (capabilityManager.getToolPolicy(tool) === 'locked') {
        throw new Error(
          `Tool '${tool}' (pack '${pack}') is locked by security policy and cannot be invoked or enabled.`,
        );
      }

      if (!capabilityManager.isToolActive(tool)) {
        throw new Error(
          `Tool '${tool}' (pack '${pack}') is not active. Enable pack '${pack}' first.`,
        );
      }

      const startTime = Date.now();
      const res = await mcpServer.callTool(tool, toolArgs || {}, {
        skipMutex: true,
      });
      await mcpServer.telemetry?.logCapabilityEvent({
        action: 'call',
        packId: pack,
        toolName: tool,
        policyTier: capabilityManager.getPackPolicy(pack),
        clientSupportsListChanged: mcpServer.clientSupportsListChanged,
        latencyMs: Date.now() - startTime,
        success: !res.isError,
      });
      if (res.isError) {
        throw new Error(
          res.content.map(c => ('text' in c ? String(c.text) : '')).join('\n'),
        );
      }
      for (const c of res.content) {
        if (c.type === 'text') {
          response.appendResponseLine(c.text);
        } else if (c.type === 'image' && 'data' in c && 'mimeType' in c) {
          response.attachImage({
            data: String(c.data),
            mimeType: String(c.mimeType),
          });
        }
      }
      return;
    }

    throw new Error('Unknown action: ' + String(action));
  },
}));
