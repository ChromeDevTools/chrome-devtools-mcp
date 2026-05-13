/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {parseArguments} from './bin/chrome-devtools-mcp-cli-options.js';
import {logger} from './logger.js';
import type {McpContext} from './McpContext.js';
import {McpResponse} from './McpResponse.js';
import type {Mutex} from './Mutex.js';
import {SlimMcpResponse} from './SlimMcpResponse.js';
import {ClearcutLogger} from './telemetry/ClearcutLogger.js';
import {bucketizeLatency} from './telemetry/transformation.js';
import type {CallToolResult, zod} from './third_party/index.js';
import type {ToolCategory} from './tools/categories.js';
import {labels, OFF_BY_DEFAULT_CATEGORIES} from './tools/categories.js';
import type {DefinedPageTool, ToolDefinition} from './tools/ToolDefinition.js';
import {pageIdSchema} from './tools/ToolDefinition.js';

export function buildFlag(category: ToolCategory) {
  return `category${category.charAt(0).toUpperCase() + category.slice(1)}`;
}

function buildDisabledMessage(
  toolName: string,
  flag: string,
  categoryLabel?: string,
): string {
  const reason = categoryLabel
    ? `is in category ${categoryLabel} which`
    : `requires experimental feature ${flag} and`;

  return `Tool ${toolName} ${reason} is currently disabled. Enable it by running chrome-devtools start ${flag}=true. For more information check the README.`;
}

function getCategoryStatus(
  category: ToolCategory,
  serverArgs: ReturnType<typeof parseArguments>,
): {categoryFlag?: string; disabled: boolean} {
  const categoryFlag = buildFlag(category);

  const flagValue = serverArgs[categoryFlag];

  const isDisabled = OFF_BY_DEFAULT_CATEGORIES.includes(category)
    ? !flagValue
    : flagValue === false;

  if (isDisabled) {
    return {
      categoryFlag,
      disabled: true,
    };
  }

  return {
    disabled: false,
  };
}

function getConditionStatus(
  condition: string,
  serverArgs: ReturnType<typeof parseArguments>,
): {conditionFlag?: string; disabled: boolean} {
  if (condition && !serverArgs[condition]) {
    return {conditionFlag: condition, disabled: true};
  }

  return {disabled: false};
}

function getToolStatusInfo(
  tool: ToolDefinition | DefinedPageTool,
  serverArgs: ReturnType<typeof parseArguments>,
): {disabled: boolean; reason?: string} {
  const category = tool.annotations.category;
  const categoryCheck = getCategoryStatus(category, serverArgs);

  if (category && categoryCheck.disabled) {
    if (!categoryCheck.categoryFlag) {
      throw new Error(
        'when the category is disabled there should always be a flag set',
      );
    }

    return {
      disabled: true,
      reason: buildDisabledMessage(
        tool.name,
        `--${categoryCheck.categoryFlag}`,
        labels[category!],
      ),
    };
  }

  for (const condition of tool.annotations.conditions || []) {
    const conditionCheck = getConditionStatus(condition, serverArgs);
    if (conditionCheck.disabled) {
      if (!conditionCheck.conditionFlag) {
        throw new Error(
          'when the condition is disabled there should always be a flag set',
        );
      }

      return {
        disabled: true,
        reason: buildDisabledMessage(
          tool.name,
          `--${conditionCheck.conditionFlag}`,
        ),
      };
    }
  }

  return {disabled: false};
}

function isPageScopedTool(
  tool: ToolDefinition | DefinedPageTool,
): tool is DefinedPageTool {
  return 'pageScoped' in tool && tool.pageScoped === true;
}

export class ToolHandler {
  readonly inputSchema: zod.ZodRawShape;
  readonly shouldRegister: boolean;
  private readonly disabledReason?: string;

  constructor(
    private readonly tool: ToolDefinition | DefinedPageTool,
    private readonly serverArgs: ReturnType<typeof parseArguments>,
    private readonly getContext: () => Promise<McpContext>,
    private readonly toolMutex: Mutex,
  ) {
    const {disabled, reason} = getToolStatusInfo(tool, serverArgs);
    this.disabledReason = reason;
    this.shouldRegister = !(disabled && !serverArgs.viaCli);

    this.inputSchema =
      'pageScoped' in tool &&
      tool.pageScoped &&
      serverArgs.experimentalPageIdRouting &&
      !serverArgs.slim
        ? {...tool.schema, ...pageIdSchema}
        : tool.schema;
  }

  async handle(params: Record<string, unknown>): Promise<CallToolResult> {
    if (this.disabledReason) {
      return {
        content: [
          {
            type: 'text',
            text: this.disabledReason,
          },
        ],
        isError: true,
      };
    }

    const guard = await this.toolMutex.acquire();
    const startTime = Date.now();
    let success = false;
    try {
      logger(
        `${this.tool.name} request: ${JSON.stringify(params, null, '  ')}`,
      );
      const context = await this.getContext();
      logger(`${this.tool.name} context: resolved`);
      await context.detectOpenDevToolsWindows();
      const response = this.serverArgs.slim
        ? new SlimMcpResponse(this.serverArgs)
        : new McpResponse(this.serverArgs);

      response.setRedactNetworkHeaders(this.serverArgs.redactNetworkHeaders);
      try {
        if (isPageScopedTool(this.tool)) {
          const pageId =
            typeof params.pageId === 'number' ? params.pageId : undefined;
          const page =
            this.serverArgs.experimentalPageIdRouting &&
            pageId !== undefined &&
            !this.serverArgs.slim
              ? context.getPageById(pageId)
              : context.getSelectedMcpPage();
          response.setPage(page);
          if (this.tool.blockedByDialog) {
            page.throwIfDialogOpen();
          }
          await this.tool.handler(
            {
              params,
              page,
            },
            response,
            context,
          );
        } else {
          await this.tool.handler(
            {
              params,
            },
            response,
            context,
          );
        }
      } catch (err) {
        response.setError(err);
      }
      const {content, structuredContent} = await response.handle(
        this.tool.name,
        context,
      );
      const result: CallToolResult & {
        structuredContent?: Record<string, unknown>;
      } = {
        content,
      };
      if (response.error) {
        result.isError = true;
      }
      success = true;
      if (this.serverArgs.experimentalStructuredContent) {
        result.structuredContent = structuredContent as Record<string, unknown>;
      }
      return result;
    } catch (err) {
      logger(`${this.tool.name} error:`, err, err?.stack);
      let errorText = err && 'message' in err ? err.message : String(err);
      if ('cause' in err && err.cause) {
        errorText += `\nCause: ${err.cause.message}`;
      }
      return {
        content: [
          {
            type: 'text',
            text: errorText,
          },
        ],
        isError: true,
      };
    } finally {
      void ClearcutLogger.get()?.logToolInvocation({
        toolName: this.tool.name,
        params,
        schema: this.inputSchema,
        success,
        latencyMs: bucketizeLatency(Date.now() - startTime),
      });
      guard.dispose();
    }
  }
}
