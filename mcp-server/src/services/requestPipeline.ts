/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Request Pipeline — unified FIFO tool execution queue with hot-reload awareness.
 *
 * Replaces ALL 4 old mutexes (toolMutex, codebaseMutex, hotReloadMutex,
 * extHotReloadMutex) with a single serialization mechanism. Both the stdio
 * server (Copilot) and inspector HTTP server submit tool calls to the same
 * pipeline instance, keeping them perfectly tethered.
 *
 * Timeout model: Tool timeouts start AFTER the pipeline calls execute(),
 * NOT when the tool enters the queue. Queue wait time and hot-reload check
 * time are never counted against the tool's timeout budget.
 *
 * Per-batch checking: The first tool in a batch asks the extension "has
 * anything changed?" via the checkForChanges RPC. Subsequent tools in the
 * same batch skip the check. A batch ends when the queue drains to empty.
 */

import {logger} from '../logger.js';
import type {CallToolResult} from '../third_party/index.js';

// ── Deterministic Messages ───────────────────────────────

const RESTART_MESSAGE = [
  '⚡ **MCP server source changed — rebuilt successfully.**',
  '',
  'The MCP server is restarting to apply the latest changes.',
  'Use the `mcpStatus` tool with an empty input to wait for the server to be ready.',
  'Do NOT retry any MCP tools until `mcpStatus` confirms the server is ready.',
].join('\n');

const RESTARTING_QUEUED_MESSAGE = [
  '⏳ MCP server is restarting to apply source changes.',
  '',
  'Use the `mcpStatus` tool with an empty input to wait for the server to be ready.',
  'Do NOT retry any MCP tools until `mcpStatus` confirms the server is ready.',
].join('\n');

function formatBuildFailure(packageName: string, error: string): string {
  return [
    `❌ **${packageName} rebuild failed:**`,
    '',
    '```',
    error,
    '```',
    '',
    `The ${packageName} was NOT restarted because the build failed.`,
    'Fix the error above and try calling a tool again to trigger a rebuild.',
  ].join('\n');
}

const EXT_REBUILT_BANNER =
  '✅ **Extension was recently updated.** The Extension Development Host is now running the newest code.';

// ── Types ────────────────────────────────────────────────

/**
 * Result from the extension's checkForChanges RPC handler.
 * The extension is the single authority for all change detection.
 */
export interface ChangeCheckResult {
  mcpChanged: boolean;
  mcpRebuilt: boolean;
  mcpBuildError: string | null;
  extChanged: boolean;
  extRebuilt: boolean;
  extBuildError: string | null;
  extClientReloaded: boolean;
  newCdpPort?: number;
  newClientStartedAt?: number;
}

interface PipelineEntry {
  toolName: string;
  execute: () => Promise<CallToolResult>;
  resolve: (result: CallToolResult) => void;
  reject: (error: Error) => void;
}

/**
 * Dependencies injected into the pipeline at construction time.
 * Keeps the pipeline decoupled from host-pipe and main.ts specifics.
 */
export interface PipelineDeps {
  /** Call the extension's checkForChanges RPC. */
  checkForChanges: (mcpServerRoot: string, extensionPath: string) => Promise<ChangeCheckResult>;
  /** Signal the extension that the MCP server is ready to be killed. */
  readyToRestart: () => Promise<void>;
  /**
   * Close the inspector HTTP server and any other transport-level resources.
   * Called during graceful shutdown before process.exit().
   */
  onShutdown: () => Promise<void>;
  /** MCP server package root (absolute path). */
  mcpServerRoot: string;
  /** Extension root (absolute path), or empty string if no extension configured. */
  extensionPath: string;
  /** Master switch — when false, all hot-reload checks are skipped. */
  hotReloadEnabled: boolean;
  /** Suppress CDP disconnect handling before checkForChanges (extension may kill Client). */
  onBeforeChangeCheck?: () => void;
  /** Restore CDP disconnect handling + reconnect CDP if extension reloaded Client. */
  onAfterChangeCheck?: (result: ChangeCheckResult) => Promise<void>;
}

// ── RequestPipeline ──────────────────────────────────────

export class RequestPipeline {
  private queue: PipelineEntry[] = [];
  private processing = false;
  private restartScheduled = false;
  private batchChecked = false;
  private readonly deps: PipelineDeps;

  constructor(deps: PipelineDeps) {
    this.deps = deps;
  }

  /**
   * Submit a tool call to the pipeline.
   *
   * The returned promise resolves with the tool's result when execution
   * completes, or with a "server restarting" message if the pipeline
   * determines a restart is needed before this tool runs.
   *
   * The execute() function is called AFTER queue wait and hot-reload
   * checking, so tool timeouts should be applied inside execute().
   */
  submit(toolName: string, execute: () => Promise<CallToolResult>): Promise<CallToolResult> {
    if (this.restartScheduled) {
      return Promise.resolve({
        content: [{type: 'text', text: RESTARTING_QUEUED_MESSAGE}],
      });
    }

    return new Promise<CallToolResult>((resolve, reject) => {
      this.queue.push({toolName, execute, resolve, reject});

      if (!this.processing) {
        void this.processLoop();
      }
    });
  }

  /**
   * Process queued entries sequentially. Runs until the queue is empty,
   * then resets batchChecked so the next batch re-checks for changes.
   */
  private async processLoop(): Promise<void> {
    this.processing = true;

    while (this.queue.length > 0) {
      if (this.restartScheduled) {
        this.drainQueueWithRestartMessage();
        break;
      }

      const entry = this.queue.shift();
      if (!entry) break;

      try {
        // Per-batch hot-reload check (first tool in batch only)
        let extRebuiltThisTool = false;

        if (!this.batchChecked && this.deps.hotReloadEnabled) {
          const checkResult = await this.performChangeCheck(entry);

          // null = check was handled (entry already resolved/signaled restart)
          if (checkResult === null) {
            continue;
          }

          extRebuiltThisTool = checkResult.extRebuilt;
          this.batchChecked = true;
        }

        // Execute the tool (timeout is inside execute())
        const result = await entry.execute();

        if (extRebuiltThisTool) {
          result.content.unshift({type: 'text', text: EXT_REBUILT_BANNER});
        }

        entry.resolve(result);
      } catch (err) {
        // Unexpected pipeline-level error (execute() should handle its own errors)
        const message = err instanceof Error ? err.message : String(err);
        logger(`[pipeline] Unexpected error for ${entry.toolName}: ${message}`);
        entry.resolve({
          content: [{type: 'text', text: message}],
          isError: true,
        });
      }
    }

    this.processing = false;
    this.batchChecked = false;
  }

  /**
   * Run the per-batch change check. Returns the check result if the tool
   * should proceed with execution, or null if the entry was already
   * resolved (build error or restart signaled).
   */
  private async performChangeCheck(
    entry: PipelineEntry,
  ): Promise<ChangeCheckResult | null> {
    let check: ChangeCheckResult;

    // Suppress CDP disconnect handling — extension may kill Client during rebuild
    this.deps.onBeforeChangeCheck?.();

    try {
      check = await this.deps.checkForChanges(
        this.deps.mcpServerRoot,
        this.deps.extensionPath,
      );
    } catch (err) {
      // checkForChanges RPC failed — proceed in degraded mode
      const message = err instanceof Error ? err.message : String(err);
      logger(`[pipeline] checkForChanges RPC failed: ${message} — proceeding without hot-reload check`);
      check = {
        mcpChanged: false,
        mcpRebuilt: false,
        mcpBuildError: null,
        extChanged: false,
        extRebuilt: false,
        extBuildError: null,
        extClientReloaded: false,
      };
    }

    // Restore CDP disconnect handling + reconnect if extension reloaded Client
    try {
      await this.deps.onAfterChangeCheck?.(check);
    } catch (afterErr) {
      const msg = afterErr instanceof Error ? afterErr.message : String(afterErr);
      logger(`[pipeline] onAfterChangeCheck failed: ${msg}`);
    }

    // Extension build failure → return error, skip tool execution
    if (check.extBuildError) {
      entry.resolve({
        content: [{type: 'text', text: formatBuildFailure('Extension', check.extBuildError)}],
        isError: true,
      });
      return null;
    }

    // MCP build failure → return error, skip tool execution (no restart)
    if (check.mcpBuildError) {
      entry.resolve({
        content: [{type: 'text', text: formatBuildFailure('MCP server', check.mcpBuildError)}],
        isError: true,
      });
      return null;
    }

    // MCP rebuilt → signal restart, return restart message
    if (check.mcpRebuilt) {
      entry.resolve({
        content: [{type: 'text', text: RESTART_MESSAGE}],
      });
      this.signalRestart('MCP server source changed and rebuilt');
      return null;
    }

    return check;
  }

  /**
   * Signal that the MCP process needs to restart.
   *
   * Drains all queued entries with restart messages, then after a brief
   * flush delay: sends readyToRestart RPC, closes HTTP server, and exits.
   */
  private signalRestart(reason: string): void {
    if (this.restartScheduled) return;
    this.restartScheduled = true;
    logger(`[pipeline] Restart signaled: ${reason}`);

    this.drainQueueWithRestartMessage();

    // Brief delay to let the current tool's response flush through stdio
    setTimeout(() => {
      void this.performGracefulShutdown();
    }, 200);
  }

  private async performGracefulShutdown(): Promise<void> {
    logger('[pipeline] Performing graceful shutdown…');

    try {
      await this.deps.readyToRestart();
      logger('[pipeline] readyToRestart RPC sent successfully');
    } catch {
      logger('[pipeline] readyToRestart RPC failed — proceeding with shutdown');
    }

    try {
      await this.deps.onShutdown();
      logger('[pipeline] Server shutdown completed');
    } catch {
      logger('[pipeline] Server shutdown encountered errors — exiting anyway');
    }

    logger('[pipeline] Exiting process for restart');
    process.exit(0);
  }

  private drainQueueWithRestartMessage(): void {
    while (this.queue.length > 0) {
      const entry = this.queue.shift();
      if (!entry) break;
      entry.resolve({
        content: [{type: 'text', text: RESTARTING_QUEUED_MESSAGE}],
      });
    }
  }
}
