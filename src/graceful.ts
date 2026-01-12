/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Graceful Shutdown Module
 *
 * Ensures clean shutdown of MCP server:
 * - Closes Puppeteer browser gracefully
 * - Kills orphaned Chrome processes
 * - Handles SIGTERM, SIGINT, disconnect, uncaught exceptions
 */

import fs from 'node:fs/promises';
import process from 'node:process';

interface Closeable { close: () => Promise<void> | void }

export interface GracefulOptions {
  /**
   * Function that returns the browser instance to close
   */
  getBrowser: () => Closeable | null | undefined;

  /**
   * Optional callback before exit (e.g., flush DB, close files)
   */
  onBeforeExit?: () => Promise<void> | void;

  /**
   * Path to PID file (usually from MCP_BROWSER_PID_FILE env var)
   */
  pidFile?: string;

  /**
   * Timeout for browser.close() in milliseconds
   */
  closeTimeoutMs?: number;
}

/**
 * Setup graceful shutdown handlers
 */
export function setupGraceful(options: GracefulOptions) {
  const {
    getBrowser,
    onBeforeExit,
    pidFile = process.env.MCP_BROWSER_PID_FILE,
    closeTimeoutMs = 3000,
  } = options;

  let isShuttingDown = false;

  /**
   * Kill Chrome process using PID file
   */
  async function killFromPidFile() {
    if (!pidFile) return;

    try {
      const txt = await fs.readFile(pidFile, 'utf8').catch(() => '');
      const pid = Number(txt.trim());

      if (pid > 0) {
        try {
          // Check if process exists
          process.kill(pid, 0);
          // Process exists, kill it
          process.kill(pid, 'SIGKILL');
          console.error(`[graceful] Killed Chrome process: ${pid}`);
        } catch (err) {
          // Process doesn't exist (already dead)
          console.error(`[graceful] Chrome process ${pid} already dead`);
        }
      }

      await fs.rm(pidFile, { force: true });
    } catch (err) {
      console.error(`[graceful] Error killing Chrome from PID file:`, err);
    }
  }

  /**
   * Graceful exit handler
   */
  async function gracefulExit(signal?: string) {
    if (isShuttingDown) {
      console.error(`[graceful] Already shutting down, ignoring ${signal}`);
      return;
    }

    isShuttingDown = true;
    console.error(`[graceful] Shutting down... (signal: ${signal || 'unknown'})`);

    try {
      // Step 1: onBeforeExit callback
      if (onBeforeExit) {
        try {
          await onBeforeExit();
        } catch (err) {
          console.error(`[graceful] onBeforeExit error:`, err);
        }
      }

      // Step 2: Close browser gracefully (with timeout)
      const browser = getBrowser?.();
      if (browser) {
        try {
          console.error(`[graceful] Closing browser...`);
          await Promise.race([
            Promise.resolve(browser.close?.()),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error('browser.close() timeout')),
                closeTimeoutMs,
              ),
            ),
          ]);
          console.error(`[graceful] Browser closed successfully`);
        } catch (err) {
          console.error(`[graceful] Browser close error:`, err);
          // Continue to PID file cleanup
        }
      }

      // Step 3: Kill orphaned Chrome (if browser.close() failed)
      await killFromPidFile();
    } catch (err) {
      console.error(`[graceful] Error during shutdown:`, err);
    }

    console.error(`[graceful] Shutdown complete`);
    process.exit(0);
  }

  // Register signal handlers
  process.on('SIGTERM', () => gracefulExit('SIGTERM'));
  process.on('SIGINT', () => gracefulExit('SIGINT'));
  process.on('disconnect', () => gracefulExit('disconnect')); // Parent died

  process.on('uncaughtException', async (err) => {
    console.error('[graceful] Uncaught exception:', err);
    await gracefulExit('uncaughtException');
  });

  process.on('unhandledRejection', async (err) => {
    console.error('[graceful] Unhandled rejection:', err);
    await gracefulExit('unhandledRejection');
  });

  return {
    /**
     * Announce Chrome PID to wrapper via PID file
     */
    async announceBrowserPid(pid?: number) {
      if (!pidFile || !pid) {
        console.error(
          `[graceful] Cannot announce browser PID: pidFile=${pidFile}, pid=${pid}`,
        );
        return;
      }

      try {
        await fs.writeFile(pidFile, String(pid), 'utf8');
        console.error(`[graceful] Announced browser PID ${pid} to ${pidFile}`);
      } catch (err) {
        console.error(`[graceful] Failed to write PID file:`, err);
      }
    },
  };
}
