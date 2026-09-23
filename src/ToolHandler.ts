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
import type {Browser, CallToolResult} from './third_party/index.js';
import {zod} from './third_party/index.js';
import {labels} from './tools/categories.js';
import {categoryToFlagName} from './config/category-options.js';
import type {
  DefinedPageTool,
  DevToolsData,
  FileVerificationOption,
  ToolDefinition,
} from './tools/ToolDefinition.js';
import {logger} from './utils/logger.js';
import type {Mutex} from './third_party/index.js';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {isLocalhost} from './utils/url.js';

/**
 * Upper bound on how long a single tool call may wait on the browser
 * connection. Puppeteer normally rejects in-flight CDP calls when the
 * underlying transport closes, but a transport that dies silently (e.g. an
 * adb port-forward torn down mid-call, rather than closed cleanly) never
 * fires `close`/`error`/`disconnected`, so the call would otherwise hang
 * until an external (client-side) timeout gives up on the whole server. This
 * bound turns that into a fast, clear error instead, and forgets the cached
 * browser handle so the next call reconnects rather than reusing a handle
 * that still looks connected.
 */
export const TOOL_CALL_TIMEOUT_MS = 60_000;

class ToolCallTimeoutError extends Error {}

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
    const flag = categoryToFlagName(category);
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
  readonly registeredInputSchema: zod.ZodObject<
    zod.ZodRawShape,
    zod.core.$strict
  >;
  readonly disabled: boolean;
  private readonly disabledReason?: string;

  constructor(
    private readonly tool: ToolDefinition | DefinedPageTool,
    private readonly serverArgs: ParsedArguments,
    private readonly getContext: () => Promise<McpContext>,
    private readonly toolMutex: Mutex,
    private readonly forgetBrowserOnTimeout: (browser: Browser) => void,
    private readonly abandonPendingBrowserAttemptOnTimeout: () => void,
  ) {
    const {disabled, reason} = getToolStatusInfo(tool, serverArgs);
    this.disabledReason = reason;
    this.disabled = disabled && !serverArgs.viaCli;

    this.inputSchema = tool.schema;
    this.registeredInputSchema = zod.object(this.inputSchema).strict();
  }

  /**
   * Races a promise against TOOL_CALL_TIMEOUT_MS, calling onTimeout() if the
   * timer wins. The loser of the race is left running — there is no way to
   * cancel a pending Puppeteer call — but since nothing is left awaiting it,
   * it cannot block subsequent tool calls.
   */
  async #raceWithTimeout<T>(
    promise: Promise<T>,
    onTimeout: () => void,
  ): Promise<T> {
    const timeoutError = new ToolCallTimeoutError(
      `Tool "${this.tool.name}" timed out after ${TOOL_CALL_TIMEOUT_MS}ms waiting on the browser connection. The connection may have been lost (for example, the debugged browser or app restarted). It will be re-established automatically on the next tool call.`,
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(timeoutError), TOOL_CALL_TIMEOUT_MS);
      timer.unref?.();
    });
    try {
      return await Promise.race([promise, timeout]);
    } catch (err) {
      if (err === timeoutError) {
        onTimeout();
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  handle = async (params: Record<string, unknown>): Promise<CallToolResult> => {
    using _guard = await this.toolMutex.acquire();

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

    const startTime = Date.now();
    let success = false;
    let devToolsData: DevToolsData | undefined;
    let pageUrl: string | undefined;
    try {
      logger?.(
        `${this.tool.name} request: ${JSON.stringify(params, null, '  ')}`,
      );
      // ensureBrowser() has no cancellation mechanism, so this timeout only
      // stops us from waiting — the attempt itself keeps running abandoned.
      // abandonPendingBrowserAttemptOnTimeout() tells BrowserManager to
      // discard that attempt if it succeeds later instead of handing it to a
      // subsequent caller — see BrowserManager#abandonPendingAttempt()'s doc
      // comment for the full mechanism.
      const context = await this.#raceWithTimeout(this.getContext(), () =>
        this.abandonPendingBrowserAttemptOnTimeout(),
      );
      logger?.(`${this.tool.name} context: resolved`);
      const response = this.serverArgs.slim
        ? new SlimMcpResponse(this.serverArgs)
        : new McpResponse(this.serverArgs);

      response.setRedactNetworkHeaders(this.serverArgs.redactNetworkHeaders);
      if (context.consumeReconnectNotice()) {
        response.setReconnectNotice();
      }
      // Shares one budget with tool.handler(): several tools' actual CDP
      // calls happen in response.handle() instead (take_snapshot,
      // list_pages, get_network_request, list_extensions), so it needs
      // covering too. The closure below isn't cancelled on timeout — it
      // keeps running abandoned — but nothing after this point observes its
      // result.
      const {content, structuredContent} = await this.#raceWithTimeout(
        (async () => {
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
          return await response.handle(context, dataFormat);
        })(),
        () => this.forgetBrowserOnTimeout(context.browser),
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
    }
  };
}
