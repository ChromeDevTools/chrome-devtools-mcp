/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ParsedArguments} from './config/ConfigParser.js';
import type {McpContext} from './McpContext.js';
import type {McpPage} from './McpPage.js';
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
import {isAvailableInMode, isSlimTool} from './tools/ToolDefinition.js';
import {logger} from './utils/logger.js';
import type {Mutex} from './third_party/index.js';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
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
): {disabled: boolean; reason?: string; unavailableInMode?: boolean} {
  if (!isAvailableInMode(tool, serverArgs)) {
    return {
      disabled: true,
      unavailableInMode: true,
      reason: isSlimTool(tool)
        ? `Tool ${tool.name} is only available with --slim.`
        : `Tool ${tool.name} is not available with --slim.`,
    };
  }

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
): Promise<string | undefined> {
  if (filePathOrUrl.trim().length === 0) {
    return undefined;
  }
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
            const resolved = await validateAndResolvePathOrUrl(item, context);
            if (resolved !== undefined) {
              updated.push(resolved);
            }
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

function toInputJsonSchema(schema: zod.ZodType) {
  return zod.toJSONSchema(schema, {io: 'input', unrepresentable: 'any'});
}

export class ToolHandler {
  #tool: ToolDefinition | DefinedPageTool;
  #serverArgs: ParsedArguments;
  #inputSchema: zod.ZodRawShape = {};
  #registeredInputSchema: zod.ZodObject<zod.ZodRawShape, zod.core.$strict> = zod
    .object({})
    .strict();
  /**
   * Incremented whenever an update changes the input schema the client sees.
   */
  #schemaVersion = 0;
  #disabled = false;
  #disabledReason?: string;

  constructor(
    tool: ToolDefinition | DefinedPageTool,
    serverArgs: ParsedArguments,
    private readonly getContext: () => Promise<McpContext>,
    private readonly toolMutex: Mutex,
    private readonly forgetBrowserOnTimeout: (browser: Browser) => void,
    private readonly abandonPendingBrowserAttemptOnTimeout: () => void,
  ) {
    this.#tool = tool;
    this.#serverArgs = serverArgs;
    this.update(tool, serverArgs);
  }

  get inputSchema(): zod.ZodRawShape {
    return this.#inputSchema;
  }

  get registeredInputSchema(): zod.ZodObject<
    zod.ZodRawShape,
    zod.core.$strict
  > {
    return this.#registeredInputSchema;
  }

  /**
   * Whether the tool is hidden from the client.
   */
  get disabled(): boolean {
    return this.#disabled;
  }

  /**
   * Whether calls to the tool are executed. Unlike `disabled`, this is false
   * for tools that stay listed with --viaCli but only return an error.
   */
  get callable(): boolean {
    return this.#disabledReason === undefined;
  }

  /**
   * Replaces the tool definition and arguments. Callers must hold the tool
   * mutex, so calls that are already waiting for it run with the new state.
   */
  update(
    tool: ToolDefinition | DefinedPageTool,
    serverArgs: ParsedArguments,
  ): void {
    const {disabled, reason, unavailableInMode} = getToolStatusInfo(
      tool,
      serverArgs,
    );
    this.#tool = tool;
    this.#serverArgs = serverArgs;
    this.#disabledReason = reason;
    this.#disabled =
      disabled && (Boolean(unavailableInMode) || !serverArgs.viaCli);
    const registeredInputSchema = zod.object(tool.schema).strict();
    if (
      !isDeepStrictEqual(
        toInputJsonSchema(this.#registeredInputSchema),
        toInputJsonSchema(registeredInputSchema),
      )
    ) {
      this.#schemaVersion++;
    }
    this.#inputSchema = tool.schema;
    this.#registeredInputSchema = registeredInputSchema;
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
      `Tool "${this.#tool.name}" timed out after ${TOOL_CALL_TIMEOUT_MS}ms waiting on the browser connection. The connection may have been lost (for example, the debugged browser or app restarted). It will be re-established automatically on the next tool call.`,
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

  handle = async (
    validatedParams: Record<string, unknown>,
  ): Promise<CallToolResult> => {
    // TODO: Investigate if we can reliably hit a race where input validation
    // (MCP SDK's async validateToolInput or McpServer.callTool's safeParseAsync)
    // starts against the old schema, applyConfig() increments #schemaVersion
    // while validation awaits, and handle() then captures the already-incremented
    // #schemaVersion.
    const schemaVersionAtCall = this.#schemaVersion;
    using _guard = await this.toolMutex.acquire();

    if (this.#disabledReason) {
      return {
        content: [
          {
            type: 'text',
            text: this.#disabledReason,
          },
        ],
        isError: true,
      };
    }

    const tool = this.#tool;
    const serverArgs = this.#serverArgs;
    if (schemaVersionAtCall !== this.#schemaVersion) {
      // The tool was updated while this call waited for the mutex, so the
      // params were validated against the previous schema.
      return {
        content: [
          {
            type: 'text',
            text: `The input schema of tool ${tool.name} changed because the server configuration was reloaded. List the tools again and retry the call with the new parameters.`,
          },
        ],
        isError: true,
      };
    }
    const params = validatedParams;

    const startTime = Date.now();
    let success = false;
    let devToolsData: DevToolsData | undefined;
    let pageUrl: string | undefined;
    try {
      logger?.(`${tool.name} request: ${JSON.stringify(params, null, '  ')}`);
      // ensureBrowser() has no cancellation mechanism, so this timeout only
      // stops us from waiting — the attempt itself keeps running abandoned.
      // abandonPendingBrowserAttemptOnTimeout() tells BrowserManager to
      // discard that attempt if it succeeds later instead of handing it to a
      // subsequent caller — see BrowserManager#abandonPendingAttempt()'s doc
      // comment for the full mechanism.
      const context = await this.#raceWithTimeout(this.getContext(), () =>
        this.abandonPendingBrowserAttemptOnTimeout(),
      );
      logger?.(`${tool.name} context: resolved`);
      const response = isSlimTool(tool)
        ? new SlimMcpResponse(serverArgs)
        : new McpResponse(serverArgs);

      response.setRedactNetworkHeaders(serverArgs.redactNetworkHeaders);
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
            await validateToolFiles(tool, params, context);
            if (isPageScopedTool(tool)) {
              const pageId =
                typeof params.pageId === 'number' ? params.pageId : undefined;
              page =
                serverArgs.pageIdRouting &&
                pageId !== undefined &&
                !isSlimTool(tool)
                  ? context.getPageById(pageId)
                  : context.getSelectedMcpPage();
              await page?.init();
              response.setPage(page);
              if (tool.blockedByDialog) {
                page.throwIfDialogOpen();
              }
              await tool.handler(
                {
                  params,
                  page,
                },
                response,
                context,
              );
            } else {
              await tool.handler(
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
          // --experimentalDataFormat takes precedence over the legacy
          // --experimentalToonFormat.
          const dataFormat =
            serverArgs.experimentalDataFormat ??
            (serverArgs.experimentalToonFormat ? 'toon' : 'default');
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
      if (serverArgs.experimentalStructuredContent) {
        result.structuredContent = structuredContent as Record<string, unknown>;
      }
      return result;
    } catch (err) {
      logger?.(`${tool.name} error:`, err, err?.stack);
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
        toolName: tool.name,
        params,
        schema: tool.schema,
        success,
        latencyMs: Date.now() - startTime,
        devToolsData,
        pageUrl,
      });
    }
  };
}
