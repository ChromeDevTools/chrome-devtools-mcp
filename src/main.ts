/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import './polyfill.js';

import {execSync} from 'node:child_process';
import {readdirSync, statSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {ensureVSCodeConnected, getConnectionGeneration, getPuppeteerBrowser, teardownSync} from './browser.js';
import {checkForBlockingUI} from './notification-gate.js';
import {parseArguments} from './cli.js';
import {loadIssueDescriptions} from './issue-descriptions.js';
import {logger, saveLogsToFile} from './logger.js';
import {McpContext} from './McpContext.js';
import {McpResponse} from './McpResponse.js';
import {Mutex} from './Mutex.js';
import {
  McpServer,
  StdioServerTransport,
  type CallToolResult,
  SetLevelRequestSchema,
} from './third_party/index.js';
import {ToolCategory} from './tools/categories.js';
import type {ToolDefinition} from './tools/ToolDefinition.js';
import {tools} from './tools/tools.js';

// Default timeout for tools (30 seconds)
const DEFAULT_TOOL_TIMEOUT_MS = 30_000;

class ToolTimeoutError extends Error {
  constructor(toolName: string, timeoutMs: number) {
    super(
      `Tool "${toolName}" timed out after ${timeoutMs}ms. The operation took too long to complete.`,
    );
    this.name = 'ToolTimeoutError';
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  toolName: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new ToolTimeoutError(toolName, timeoutMs));
      }, timeoutMs);
    }),
  ]);
}

// If moved update release-please config
// x-release-please-start-version
const VERSION = '0.16.0';
// x-release-please-end

export const args = parseArguments(VERSION);

if (args.logFile) {
  saveLogsToFile(args.logFile);
}

process.on('unhandledRejection', (reason, promise) => {
  logger('Unhandled promise rejection', promise, reason);
});

logger(`Starting VS Code DevTools MCP Server v${VERSION}`);
const server = new McpServer(
  {
    name: 'vscode_devtools',
    title: 'VS Code DevTools MCP server',
    version: VERSION,
  },
  {capabilities: {logging: {}}},
);
server.server.setRequestHandler(SetLevelRequestSchema, () => {
  return {};
});

let context: McpContext | undefined;
let contextGeneration = -1;

/**
 * Ensure VS Code debug window is connected (CDP + bridge).
 * Required for ALL tools including diagnostic ones.
 */

async function ensureConnection(): Promise<void> {
  await ensureVSCodeConnected({
    workspaceFolder: args.folder as string,
    extensionBridgePath: args.extensionBridgePath as string,
    targetFolder: args.targetFolder as string | undefined,
    headless: args.headless,
  });
}

// ── Dev-mode lazy rebuild ──────────────────────────────────
// Resolves paths once at startup. At build time this file lives at
// build/src/main.js, so two dirname() calls reach the project root.
const __filename = fileURLToPath(import.meta.url);
const projectRoot = dirname(dirname(dirname(__filename)));
const srcDir = join(projectRoot, 'src');
// Sentinel file stamped after each successful build — tsc may not update
// output mtimes when content is unchanged, so we use our own marker.
const buildSentinel = join(projectRoot, 'build', '.dev-build-stamp');

function getNewestMtime(dir: string, ext: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir, {withFileTypes: true, recursive: true})) {
    if (!entry.isFile() || !entry.name.endsWith(ext)) continue;
    const fullPath = join(entry.parentPath ?? (entry as any).path ?? dir, entry.name);
    const mtime = statSync(fullPath).mtimeMs;
    if (mtime > newest) newest = mtime;
  }
  return newest;
}

class DevRebuildNeeded extends Error {
  constructor(public detail: string) {
    super(detail);
    this.name = 'DevRebuildNeeded';
  }
}

/**
 * In dev mode, checks if any .ts source files are newer than the build output.
 * If so, recompiles. On success, throws DevRebuildNeeded (the tool wrapper
 * returns a message and the server exits). On failure, throws with build errors.
 */
function devLazyRebuildCheck(): void {
  if (!args.dev) return;

  let buildMtime: number;
  try {
    buildMtime = statSync(buildSentinel).mtimeMs;
  } catch {
    // No sentinel yet — force rebuild
    buildMtime = 0;
  }

  const srcMtime = getNewestMtime(srcDir, '.ts');
  if (srcMtime <= buildMtime) return;

  logger('[dev] Source files changed — recompiling...');
  try {
    execSync('pnpm run build', {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    });
    // Stamp the sentinel so we don't rebuild again until source changes
    writeFileSync(buildSentinel, new Date().toISOString(), 'utf-8');
  } catch (err: any) {
    const stderr = err.stderr?.toString() ?? '';
    const stdout = err.stdout?.toString() ?? '';
    const output = [stderr, stdout].filter(Boolean).join('\n');
    throw new Error(
      `[dev] Build failed. Fix the errors and try again:\n${output}`,
    );
  }

  logger('[dev] Build successful — server must restart to load new code.');
  throw new DevRebuildNeeded(
    'Source code was modified and has been rebuilt successfully. ' +
    'The server will now exit so the new code can be loaded. ' +
    'Please restart the MCP server and call the tool again.',
  );
}

/**
 * Get or create the McpContext (Puppeteer page model).
 * Only needed for non-diagnostic tools that interact via Puppeteer.
 */
async function getContext(): Promise<McpContext> {
  const gen = getConnectionGeneration();
  if (gen !== contextGeneration) {
    context?.dispose();
    context = undefined;
    contextGeneration = gen;
  }
  if (!context) {
    const browser = getPuppeteerBrowser();
    if (!browser) {
      throw new Error(
        'Puppeteer Browser not available. The ElectronTransport may have failed during connection.',
      );
    }
    context = await McpContext.from(browser, logger, {
      experimentalDevToolsDebugging: false,
      performanceCrux: false,
    });
  }
  return context;
}

const logDisclaimers = () => {
  console.error(
    `vscode-devtools-mcp exposes content of the VS Code debug window to MCP clients,
allowing them to inspect, debug, and modify any data visible in the editor.
Avoid sharing sensitive or personal information that you do not want to share with MCP clients.`,
  );
};

const toolMutex = new Mutex();

function registerTool(tool: ToolDefinition): void {
  if (
    tool.annotations.category === ToolCategory.PERFORMANCE &&
    args.categoryPerformance === false
  ) {
    return;
  }
  if (
    tool.annotations.category === ToolCategory.NETWORK &&
    args.categoryNetwork === false
  ) {
    return;
  }
  if (
    tool.annotations.conditions?.includes('computerVision') &&
    !args.experimentalVision
  ) {
    return;
  }
  // Hide diagnostic tools in production unless explicitly enabled
  if (
    tool.annotations.conditions?.includes('devDiagnostic') &&
    !args.devDiagnostic
  ) {
    return;
  }
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.schema,
      annotations: tool.annotations,
    },
    async (params): Promise<CallToolResult> => {
      const timeoutMs = tool.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
      let guard: InstanceType<typeof Mutex.Guard> | undefined;
      try {
        // In dev mode, check if source files changed and rebuild before executing.
        // This runs OUTSIDE the mutex so it doesn't block on stale locks.
        devLazyRebuildCheck();

        const executeAll = async () => {
          guard = await toolMutex.acquire();
          logger(`${tool.name} request: ${JSON.stringify(params, null, '  ')}`);

          // Always ensure VS Code connection (CDP + bridge)
          await ensureConnection();

          // Check for blocking modals/notifications before tool execution
          // BLOCKING modals (e.g., "Save file?") → STOP tool, return modal info
          // NON-BLOCKING notifications (toasts) → Prepend banner, let tool proceed
          //
          // EXCEPTION: Input tools (press_key, click, click_at, hover, drag) BYPASS the gate
          // when there's a blocking UI. This allows the user to dismiss the dialog.
          // Without this, there would be no way to interact with blocking dialogs via MCP.
          const inputTools = ['press_key', 'click', 'click_at', 'hover', 'drag', 'fill'];
          const isInputTool = inputTools.includes(tool.name);
          
          const uiCheck = await checkForBlockingUI();
          if (uiCheck.blocked && !isInputTool) {
            // Blocked and NOT an input tool - return blocking message
            const content: Array<{type: string; text?: string}> = [];
            if (uiCheck.notificationBanner) {
              content.push({type: 'text', text: uiCheck.notificationBanner});
            }
            content.push({type: 'text', text: uiCheck.blockingMessage!});
            return {content};
          }
          // For input tools when blocked: still prepend banner but let tool execute
          const notificationBanner = uiCheck.notificationBanner;

          // Diagnostic and directCdp tools bypass McpContext — they use sendCdp/bridgeExec directly.
          // Non-diagnostic tools need full McpContext (Phase B will refactor this).
          const isDiagnostic = tool.annotations.conditions?.includes('devDiagnostic');
          const isDirectCdp = tool.annotations.conditions?.includes('directCdp');
          const bypassContext = isDiagnostic || isDirectCdp;
          const ctx = bypassContext ? (undefined as never) : await getContext();

          logger(`${tool.name} context: resolved`);
          const response = new McpResponse();
          await tool.handler(
            {
              params,
            },
            response,
            ctx,
          );

          // Diagnostic/directCdp tools return content directly without McpResponse.handle()
          if (bypassContext) {
            const content: Array<{type: string; text?: string; data?: string; mimeType?: string}> = [];
            // Prepend notification banner if present
            if (notificationBanner) {
              content.push({type: 'text', text: notificationBanner});
            }
            for (const line of response.responseLines) {
              content.push({type: 'text', text: line});
            }
            for (const img of response.images) {
              content.push({type: 'image', data: img.data, mimeType: img.mimeType});
            }
            if (content.length === 0) {
              content.push({type: 'text', text: '(no output)'});
            }
            return {content};
          }

          const {content, structuredContent} = await response.handle(
            tool.name,
            ctx,
          );
          // Prepend notification banner for non-bypass tools
          if (notificationBanner) {
            (content as Array<{type: string; text?: string}>).unshift({type: 'text', text: notificationBanner});
          }
          return {content, structuredContent};
        };

        const {content, structuredContent} = await withTimeout(
          executeAll(),
          timeoutMs,
          tool.name,
        ) as {content: CallToolResult['content']; structuredContent?: Record<string, unknown>};

        const result: CallToolResult & {
          structuredContent?: Record<string, unknown>;
        } = {
          content,
        };
        if (args.experimentalStructuredContent) {
          result.structuredContent = structuredContent as Record<
            string,
            unknown
          >;
        }
        return result;
      } catch (err) {
        // Dev rebuild succeeded — return message and exit so new code loads on next start
        if (err instanceof DevRebuildNeeded) {
          logger(`${tool.name}: ${err.detail}`);
          // Schedule exit after response is sent
          setTimeout(() => {
            teardownSync();
            process.exit(0);
          }, 500);
          return {
            content: [{type: 'text', text: err.detail}],
            isError: false,
          };
        }
        logger(`${tool.name} error:`, err, err?.stack);
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
        guard?.dispose();
      }
    },
  );
}

for (const tool of tools) {
  registerTool(tool);
}

await loadIssueDescriptions();
const transport = new StdioServerTransport();
await server.connect(transport);
logger('VS Code DevTools MCP Server connected');
logDisclaimers();


