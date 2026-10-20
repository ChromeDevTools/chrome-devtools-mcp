/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {ParsedArguments} from './config/ConfigParser.js';
import type {ReadonlyServerConfig} from './config/ServerConfig.js';
import type {McpContext} from './McpContext.js';
import type {McpPage} from './McpPage.js';
import {McpResponse, type DataFormat} from './McpResponse.js';
import {SlimMcpResponse} from './SlimMcpResponse.js';
import {ClearcutLogger} from './telemetry/ClearcutLogger.js';
import type {Browser, CallToolResult} from './third_party/index.js';
import {ProtocolError, ProtocolErrorCode, zod} from './third_party/index.js';
import {labels} from './tools/categories.js';
import {categoryToFlagName} from './config/category-options.js';
import type {
  AnyToolDefinition,
  BrowserlessToolDefinition,
  DefinedPageTool,
  DevToolsData,
  FileVerificationOption,
  ToolDefinition,
} from './tools/ToolDefinition.js';
import {
  isAvailableInMode,
  isBrowserlessTool,
  isPageScopedTool,
  isSlimTool,
} from './tools/ToolDefinition.js';
import {getErrorMessage} from './utils/errorHandling.js';
import {logger} from './utils/logger.js';
import type {TaskQueue} from './utils/TaskRunner.js';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {isLocalhost} from './utils/url.js';

/**
 * Upper bound on how long a tool call may wait to acquire the browser
 * (connect/launch and McpContext initialization). A connect attempt on a
 * half-open socket can hang without ever failing; this bound turns that into
 * a clear error and abandons the attempt so the next call starts fresh.
 *
 * This does not bound the tool's own work. A slow but valid call (a long
 * `wait_for` timeout, an `evaluate_script` awaiting a slow promise, a
 * Lighthouse audit) must finish on its own terms without the browser being
 * closed underneath it. A transport that dies mid-call is detected by the
 * WebSocket keep-alive configured in BrowserManager#connect(), which rejects
 * the in-flight CDP calls and fires `disconnected`.
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

function getDisabledReason(
  tool: AnyToolDefinition,
  serverArgs: ParsedArguments,
): string | undefined {
  if (!isAvailableInMode(tool, serverArgs)) {
    return isSlimTool(tool)
      ? `Tool ${tool.name} is only available with --slim.`
      : `Tool ${tool.name} is not available with --slim.`;
  }

  const category = tool.annotations.category;
  if (category) {
    const flag = categoryToFlagName(category);
    if (!serverArgs[flag]) {
      return buildDisabledMessage(tool.name, `--${flag}`, labels[category]);
    }
  }

  for (const condition of tool.annotations.conditions || []) {
    if (!serverArgs[condition]) {
      return buildDisabledMessage(tool.name, `--${condition}`);
    }
  }

  return undefined;
}

async function validateAndResolvePathOrUrl(
  filePathOrUrl: string,
  context: McpContext,
  allowUrl: boolean,
): Promise<string | undefined> {
  if (filePathOrUrl.trim().length === 0) {
    return undefined;
  }
  let url: URL | undefined;
  try {
    url = new URL(filePathOrUrl);
  } catch {
    // Not a URL; fall through and validate it as a regular file path.
  }
  if (url) {
    if (url.protocol === 'file:') {
      return pathToFileURL(await context.validatePath(fileURLToPath(url))).href;
    }
    if (['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) {
      // Only pass a remote URL through unchanged for parameters whose sink
      // actually fetches the URL or hands it to the browser (allowUrl). For a
      // filesystem-path parameter, a value that merely looks like an http/ws
      // URL must still be rejected outright: `new URL()` accepts
      // `http://x/../../etc/passwd`, and the downstream filesystem API (e.g.
      // Puppeteer's uploadFile) path.resolve()s that non-absolute string into
      // an absolute host path, which would bypass validatePath (workspace
      // roots and the temp-dir fallback) if it fell through to it unchanged.
      if (allowUrl) {
        return filePathOrUrl;
      }
      throw new Error('This parameter expects a file path, not a URL.');
    }
  }
  return await context.validatePath(filePathOrUrl);
}

function isLocalBrowser(browser: Browser): boolean {
  if (browser.process()) {
    return true;
  }
  const wsEndpoint = browser.wsEndpoint();
  if (wsEndpoint && isLocalhost(wsEndpoint)) {
    return true;
  }
  return false;
}

function shouldValidateFile(
  option: FileVerificationOption | undefined,
  isLocal: boolean,
): option is FileVerificationOption {
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

/**
 * `isLocal` tells whether files are accessed on the machine the server runs on,
 * which is always the case for browserless tools.
 */
async function validateToolFiles(
  tool: AnyToolDefinition,
  params: Record<string, unknown>,
  context: McpContext,
  isLocal: boolean,
): Promise<void> {
  for (const [key, option] of Object.entries(tool.verifyFilesSchema)) {
    if (shouldValidateFile(option, isLocal)) {
      const allowUrl = option !== true && option.allowUrl === true;
      const val = params[key];
      if (typeof val === 'string') {
        params[key] = await validateAndResolvePathOrUrl(val, context, allowUrl);
      } else if (Array.isArray(val)) {
        const updated: unknown[] = [];
        for (const item of val) {
          if (typeof item === 'string') {
            const resolved = await validateAndResolvePathOrUrl(
              item,
              context,
              allowUrl,
            );
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

function toInputJsonSchema(schema: zod.ZodType): unknown {
  return zod.toJSONSchema(schema, {io: 'input', unrepresentable: 'any'});
}

function formatValidationError(toolName: string, error: zod.ZodError): string {
  const details = error.issues
    .map(
      issue =>
        `${issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''}${issue.message}`,
    )
    .join(', ');
  return `Input validation error: Invalid arguments for tool ${toolName}: ${details}`;
}

function errorResult(text: string): CallToolResult {
  return {
    content: [{type: 'text', text}],
    isError: true,
  };
}

/**
 * The page id a page tool call targets, or `undefined` when the call targets
 * the selected page. `args` can be the raw or the parsed arguments.
 */
function routedPageId(
  tool: AnyToolDefinition,
  serverArgs: ParsedArguments,
  args: Record<string, unknown>,
): number | undefined {
  if (!serverArgs.pageIdRouting || isSlimTool(tool)) {
    return undefined;
  }
  const {pageId} = args;
  return typeof pageId === 'number' && Number.isInteger(pageId)
    ? pageId
    : undefined;
}

export class ToolHandler {
  #tool: AnyToolDefinition;
  #config: ReadonlyServerConfig;
  #registeredInputSchema: zod.ZodObject<zod.ZodRawShape, zod.core.$strict>;
  #disabled = false;
  #disabledReason?: string;

  constructor(
    tool: AnyToolDefinition,
    config: ReadonlyServerConfig,
    private readonly getContext: () => Promise<McpContext>,
    private readonly abandonPendingBrowserAttemptOnTimeout: () => void,
  ) {
    this.#tool = tool;
    this.#config = config;
    this.#registeredInputSchema = zod.object(tool.schema).strict();
    this.#updateStatus(tool);
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

  #updateStatus(tool: AnyToolDefinition): void {
    const serverArgs = this.#config.resolved;
    this.#disabledReason = getDisabledReason(tool, serverArgs);
    this.#disabled =
      Boolean(this.#disabledReason) &&
      (!isAvailableInMode(tool, serverArgs) || !serverArgs.viaCli);
  }

  /**
   * Replaces the tool definition and re-evaluates its status against the
   * current server config. Callers must pause the task runner, so calls that
   * are already waiting run with the new state. Returns true if the tool
   * listing visible to the client changed.
   */
  update(tool: AnyToolDefinition): boolean {
    const previousTool = this.#tool;
    const previousDisabled = this.#disabled;
    const previousInputSchema = this.#registeredInputSchema;
    const nextInputSchema = zod.object(tool.schema).strict();

    this.#tool = tool;
    this.#registeredInputSchema = nextInputSchema;
    this.#updateStatus(tool);

    if (previousDisabled !== this.#disabled) {
      return true;
    }
    if (this.#disabled) {
      return false;
    }

    return (
      previousTool.description !== tool.description ||
      !isDeepStrictEqual(previousTool.annotations, tool.annotations) ||
      !isDeepStrictEqual(
        toInputJsonSchema(previousInputSchema),
        toInputJsonSchema(nextInputSchema),
      )
    );
  }

  /**
   * Races a promise against TOOL_CALL_TIMEOUT_MS, calling onTimeout() if the
   * timer wins. The loser of the race is left running — there is no way to
   * cancel a pending connect/launch — but since nothing is left awaiting it,
   * it cannot block subsequent tool calls.
   */
  async #raceWithTimeout<T>(
    promise: Promise<T>,
    onTimeout: () => void,
  ): Promise<T> {
    const timeoutError = new ToolCallTimeoutError(
      `Tool "${this.#tool.name}" timed out after ${TOOL_CALL_TIMEOUT_MS}ms waiting for the browser connection to be established. The connection attempt will be retried automatically on the next tool call.`,
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

  #dataFormat(serverArgs: ParsedArguments): DataFormat {
    // --experimentalDataFormat takes precedence over the legacy
    // --experimentalToonFormat.
    return (
      serverArgs.experimentalDataFormat ??
      (serverArgs.experimentalToonFormat ? 'toon' : 'default')
    );
  }

  /**
   * Browserless tools never establish a browser connection, so they also never
   * wait for one under TOOL_CALL_TIMEOUT_MS.
   */
  async #runBrowserlessTool(
    tool: BrowserlessToolDefinition,
    params: Record<string, unknown>,
    response: McpResponse,
    context: McpContext,
  ): ReturnType<McpResponse['handle']> {
    try {
      await validateToolFiles(tool, params, context, true);
      await tool.handler({params}, response, context);
    } catch (err) {
      response.setError(err);
    }
    return await response.handle(
      context,
      this.#dataFormat(this.#config.resolved),
    );
  }

  async #runBrowserTool(
    tool: ToolDefinition | DefinedPageTool,
    params: Record<string, unknown>,
    response: McpResponse,
    context: McpContext,
    onTelemetryData: (
      devToolsData: DevToolsData | undefined,
      pageUrl: string | undefined,
    ) => void,
  ): ReturnType<McpResponse['handle']> {
    // ensureBrowser() has no cancellation mechanism, so this timeout only
    // stops us from waiting — the attempt itself keeps running abandoned.
    // abandonPendingBrowserAttemptOnTimeout() tells BrowserManager to
    // discard that attempt if it succeeds later instead of handing it to a
    // subsequent caller — see BrowserManager#abandonPendingAttempt()'s doc
    // comment for the full mechanism.
    const browser = await this.#raceWithTimeout(context.ensureBrowser(), () =>
      this.abandonPendingBrowserAttemptOnTimeout(),
    );
    logger?.(`${tool.name} browser: resolved`);
    if (context.consumeReconnectNotice()) {
      response.setReconnectNotice();
    }
    let page: McpPage | undefined;
    try {
      await validateToolFiles(tool, params, context, isLocalBrowser(browser));
      if (isPageScopedTool(tool)) {
        const pageId = routedPageId(tool, this.#config.resolved, params);
        page =
          pageId !== undefined
            ? context.getPageById(pageId)
            : context.getSelectedMcpPage();
        await page?.init({emulateFocus: true});
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
    onTelemetryData(
      await context.getDevToolsData(page),
      context.getSelectedMcpPageUrl(page),
    );
    return await response.handle(
      context,
      this.#dataFormat(this.#config.resolved),
    );
  }

  /**
   * The queue the call runs on. `'none'` tools run outside the runner.
   * `'page'` tools run on the queue of the page named by `rawArgs.pageId`
   * when page id routing applies; every other call runs on the context
   * queue.
   */
  #queueFor(
    context: McpContext,
    rawArgs: Record<string, unknown>,
  ): TaskQueue | undefined {
    const tool = this.#tool;
    switch (tool.concurrency) {
      case 'none':
        return undefined;
      case 'page': {
        const pageId = routedPageId(tool, this.#config.resolved, rawArgs);
        return pageId !== undefined
          ? context.pageTaskQueue(pageId)
          : context.taskQueue;
      }
      default:
        return context.taskQueue;
    }
  }

  handle = async (
    rawArgs: Record<string, unknown> = {},
    options?: {viaMcp?: boolean},
  ): Promise<CallToolResult> => {
    const context = await this.getContext();
    let queueGuard: Disposable | undefined;
    try {
      queueGuard = await this.#queueFor(context, rawArgs)?.scheduleTask();
    } catch (err) {
      // The queue was disposed while the call waited, e.g. the page closed.
      return errorResult(getErrorMessage(err));
    }
    using guard = queueGuard;
    if (options?.viaMcp && this.#disabled) {
      throw new ProtocolError(
        ProtocolErrorCode.InvalidParams,
        `Tool ${this.#tool.name} disabled`,
      );
    }

    if (this.#disabledReason) {
      return errorResult(this.#disabledReason);
    }

    const tool = this.#tool;
    const parseResult = this.#registeredInputSchema.safeParse(rawArgs);
    if (!parseResult.success) {
      return errorResult(formatValidationError(tool.name, parseResult.error));
    }
    const params = parseResult.data;

    const startTime = Date.now();
    let success = false;
    let devToolsData: DevToolsData | undefined;
    let pageUrl: string | undefined;
    try {
      logger?.(`${tool.name} request: ${JSON.stringify(params, null, '  ')}`);
      const response = isSlimTool(tool)
        ? new SlimMcpResponse(this.#config)
        : new McpResponse(this.#config);
      const {content, structuredContent} = isBrowserlessTool(tool)
        ? await this.#runBrowserlessTool(tool, params, response, context)
        : await this.#runBrowserTool(
            tool,
            params,
            response,
            context,
            (data, url) => {
              devToolsData = data;
              pageUrl = url;
            },
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
      if (this.#config.resolved.experimentalStructuredContent) {
        result.structuredContent = structuredContent as Record<string, unknown>;
      }
      return result;
    } catch (err) {
      logger?.(`${tool.name} error:`, err, err?.stack);
      let errorText = err && 'message' in err ? err.message : String(err);
      if ('cause' in err && err.cause) {
        errorText += `\nCause: ${err.cause.message}`;
      }
      return errorResult(errorText);
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
