/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ParsedArguments} from './config/mcp-options.js';
import type {McpContext} from './McpContext.js';
import type {McpPage} from './McpPage.js';
import type {DataFormat} from './McpResponse.js';
import {McpResponse} from './McpResponse.js';
import {SlimMcpResponse} from './SlimMcpResponse.js';
import {ClearcutLogger} from './telemetry/ClearcutLogger.js';
import type {CallToolResult} from './third_party/index.js';
import {zod} from './third_party/index.js';
import {labels} from './tools/categories.js';
import {categoryToFlagName} from './config/category-options.js';
import type {
  DefinedPageTool,
  DevToolsData,
  FileVerificationOption,
  ToolDefinition,
} from './tools/ToolDefinition.js';
import {pageIdSchema} from './tools/ToolDefinition.js';
import {logger} from './utils/logger.js';
import type {Mutex} from './third_party/index.js';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {isLocalhost} from './utils/url.js';

function buildDisabledMessage(
  toolName: string,
  flag: string,
  categoryLabel?: string,
): string {
  const reason = categoryLabel
    ? `is in category ${categoryLabel} which`
    : `requires ${flag.startsWith('--experimental') ? 'experimental feature' : 'flag'} ${flag} and`;

  return `Tool ${toolName} ${reason} is currently disabled. Enable it by running chrome-devtools start ${flag}=true. For more information check the README.`;
}

function getToolStatusInfo(
  tool: ToolDefinition | DefinedPageTool,
  serverArgs: ParsedArguments,
): {disabled: boolean; reason?: string} {
  const category = tool.annotations.category;
  if (category) {
    const flag = categoryToFlagName[category];
    if (!serverArgs[flag]) {
      return {
        disabled: true,
        reason: buildDisabledMessage(tool.name, `--${flag}`, labels[category]),
      };
    }
  }

  for (const condition of tool.annotations.conditions || []) {
    if (!serverArgs[condition]) {
      return {
        disabled: true,
        reason: buildDisabledMessage(tool.name, `--${condition}`),
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

function formatArgumentNames(names: string[]): string {
  return names.map(name => `"${name}"`).join(', ');
}

function buildUnknownArgumentsMessage(
  toolName: string,
  unknownArgumentNames: string[],
  expectedArgumentNames: string[],
): string {
  const unknownLabel =
    unknownArgumentNames.length === 1 ? 'argument' : 'arguments';
  const expectedArguments = expectedArgumentNames.length
    ? `Expected arguments: ${formatArgumentNames(expectedArgumentNames)}.`
    : 'This tool does not accept any arguments.';
  const correction =
    unknownArgumentNames.length === 1 ? 'Remove it' : 'Remove them';

  return `Unknown ${unknownLabel} for tool "${toolName}": ${formatArgumentNames(unknownArgumentNames)}. ${expectedArguments} ${correction} and retry.`;
}

async function validateAndResolvePathOrUrl(
  filePathOrUrl: string,
  context: McpContext,
): Promise<string> {
  try {
    const url = new URL(filePathOrUrl);
    if (url.protocol === 'file:') {
      return pathToFileURL(await context.validatePath(fileURLToPath(url))).href;
    } else if (['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) {
      return filePathOrUrl;
    }
  } catch {
    // Suppress parsing errors for regular file paths.
  }
  return await context.validatePath(filePathOrUrl);
}

function isLocalBrowser(context: McpContext): boolean {
  if (context.browser.process()) {
    return true;
  }
  const wsEndpoint = context.browser.wsEndpoint();
  if (wsEndpoint && isLocalhost(wsEndpoint)) {
    return true;
  }
  return false;
}

function shouldValidateFile(
  option: FileVerificationOption | undefined,
  isLocal: boolean,
): boolean {
  if (option === true) {
    return true;
  }
  if (typeof option === 'object' && option !== null) {
    if (isLocal) {
      return Boolean(option.local);
    }
    return Boolean(option.remote);
  }
  return false;
}

async function validateToolFiles(
  tool: ToolDefinition | DefinedPageTool,
  params: Record<string, unknown>,
  context: McpContext,
): Promise<void> {
  const isLocal = isLocalBrowser(context);
  for (const [key, option] of Object.entries(tool.verifyFilesSchema)) {
    if (shouldValidateFile(option, isLocal)) {
      const val = params[key];
      if (typeof val === 'string') {
        params[key] = await validateAndResolvePathOrUrl(val, context);
      } else if (Array.isArray(val)) {
        const updated: unknown[] = [];
        for (const item of val) {
          if (typeof item === 'string') {
            updated.push(await validateAndResolvePathOrUrl(item, context));
          } else {
            throw new Error(
              'Unexpected non-string value as a file path or URL',
            );
          }
        }
        params[key] = updated;
      }
    }
  }
}

export class ToolHandler {
  readonly inputSchema: zod.ZodRawShape;
  readonly registeredInputSchema: zod.ZodTypeAny;
  readonly shouldRegister: boolean;
  private readonly disabledReason?: string;

  constructor(
    private readonly tool: ToolDefinition | DefinedPageTool,
    private readonly serverArgs: ParsedArguments,
    private readonly getContext: () => Promise<McpContext>,
    private readonly toolMutex: Mutex,
  ) {
    const {disabled, reason} = getToolStatusInfo(tool, serverArgs);
    this.disabledReason = reason;
    this.shouldRegister = !(disabled && !serverArgs.viaCli);

    this.inputSchema =
      'pageScoped' in tool &&
      tool.pageScoped &&
      serverArgs.pageIdRouting &&
      !serverArgs.slim
        ? {...pageIdSchema, ...tool.schema}
        : tool.schema;
    this.registeredInputSchema = zod.object(this.inputSchema).passthrough();
  }

  unknownArgumentNames(params: Record<string, unknown>): string[] {
    return Object.keys(params).filter(
      key => !Object.hasOwn(this.inputSchema, key),
    );
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

    const unknownArgumentNames = this.unknownArgumentNames(params);
    if (unknownArgumentNames.length) {
      return {
        content: [
          {
            type: 'text',
            text: buildUnknownArgumentsMessage(
              this.tool.name,
              unknownArgumentNames,
              Object.keys(this.inputSchema),
            ),
          },
        ],
        isError: true,
      };
    }

    const guard = await this.toolMutex.acquire();
    const startTime = Date.now();
    let success = false;
    let devToolsData: DevToolsData | undefined;
    let pageUrl: string | undefined;
    try {
      logger?.(
        `${this.tool.name} request: ${JSON.stringify(params, null, '  ')}`,
      );
      const context = await this.getContext();
      logger?.(`${this.tool.name} context: resolved`);
      const response = this.serverArgs.slim
        ? new SlimMcpResponse(this.serverArgs)
        : new McpResponse(this.serverArgs);

      response.setRedactNetworkHeaders(this.serverArgs.redactNetworkHeaders);
      if (context.consumeReconnectNotice()) {
        response.setReconnectNotice();
      }
      let page: McpPage | undefined;
      try {
        await validateToolFiles(this.tool, params, context);
        if (isPageScopedTool(this.tool)) {
          const pageId =
            typeof params.pageId === 'number' ? params.pageId : undefined;
          page =
            this.serverArgs.pageIdRouting &&
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
      devToolsData = await context.getDevToolsData(page);
      pageUrl = context.getSelectedMcpPageUrl(page);
      // Resolve data format: --experimentalDataFormat takes precedence, fall back to legacy --experimentalToonFormat
      let dataFormat: DataFormat = 'default';
      if (this.serverArgs.experimentalDataFormat) {
        dataFormat = this.serverArgs.experimentalDataFormat as DataFormat;
      } else if (this.serverArgs.experimentalToonFormat) {
        dataFormat = 'toon';
      }

      const {content, structuredContent} = await response.handle(
        context,
        dataFormat,
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
      logger?.(`${this.tool.name} error:`, err, err?.stack);
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
        latencyMs: Date.now() - startTime,
        devToolsData,
        pageUrl,
      });
      guard[Symbol.dispose]();
    }
  }
}
