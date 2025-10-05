#!/usr/bin/env node
/**
 * MCP Wrapper - Hot-Reload & Auto-Restart
 *
 * Development Mode (--dev or MCP_ENV=development):
 *   - Runs `tsc -w` for automatic TypeScript compilation
 *   - Watches build/ directory for changes
 *   - Restarts child process (MCP server) on file changes
 *   - No VSCode Reload Window needed!
 *
 * Production Mode (default):
 *   - Runs pre-built MCP server from build/
 *   - Auto-restarts on crash (exponential backoff + rate limiting)
 *   - Cleans up orphaned Chrome processes
 */

import { spawn } from "node:child_process";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import chokidar from "chokidar";

// ==== Configuration ====
const argv = new Set(process.argv.slice(2));
const isDev = argv.has("--dev") || process.env.MCP_ENV === "development";

const JS_ENTRY = process.env.MCP_JS_ENTRY || "build/src/main.js";
const TS_PROJECT = process.env.MCP_TS_PROJECT || "tsconfig.json";
const BUILD_GLOB = process.env.MCP_BUILD_GLOB || "build/**/*.{js,mjs,cjs,map}";
const KILL_TIMEOUT_MS = Number(process.env.MCP_KILL_TIMEOUT_MS || 4000);

// Production: restart control
const BACKOFF_START = Number(process.env.MCP_BACKOFF_START || 300);   // ms
const BACKOFF_MAX   = Number(process.env.MCP_BACKOFF_MAX   || 30_000);
const MAX_RESTARTS_PER_MIN = Number(process.env.MCP_MAX_RPM || 8);

// PID file for Chrome process cleanup
const PID_FILE = path.join(os.tmpdir(), `mcp-browser-${process.pid}.pid`);

// ==== State ====
let child = null;
let tscProc = null;
let restarting = false;
let pending = false;
let backoff = BACKOFF_START;
let restartTimestamps = [];

// ==== Utilities ====
function now() { return Date.now(); }
function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

/**
 * Stop child process gracefully (SIGTERM → timeout → SIGKILL)
 */
async function stopChild() {
  if (!child || child.killed) return;

  const done = new Promise((res) => child.once("exit", res));

  try {
    child.kill("SIGTERM");
    console.error("[mcp-wrapper] Sent SIGTERM to child");
  } catch (err) {
    console.error("[mcp-wrapper] Failed to send SIGTERM:", err.message);
  }

  await Promise.race([done, sleep(KILL_TIMEOUT_MS)]);

  if (child && !child.killed) {
    try {
      child.kill("SIGKILL");
      console.error("[mcp-wrapper] Sent SIGKILL to child (timeout)");
    } catch (err) {
      console.error("[mcp-wrapper] Failed to send SIGKILL:", err.message);
    }
  }
}

/**
 * Spawn MCP server child process
 */
function spawnChild() {
  const env = {
    ...process.env,
    MCP_BROWSER_PID_FILE: PID_FILE,
    NODE_ENV: isDev ? "development" : (process.env.NODE_ENV || "production"),
  };

  console.error(`[mcp-wrapper] Starting child: node ${JS_ENTRY}`);

  child = spawn("node", [JS_ENTRY], {
    stdio: ["inherit", "inherit", "inherit"], // stdout → parent (JSON-RPC)
    env,
  });

  child.on("exit", async (code, sig) => {
    console.error(`[mcp-wrapper] Child exited: code=${code} sig=${sig}`);

    if (isDev) {
      // In dev mode, don't auto-restart (prevents infinite loop)
      // Restart is triggered by file change detection
      if (!restarting) {
        console.error("[mcp-wrapper] Dev mode: child exited, waiting for restart trigger");
        // Don't exit wrapper - keep it alive for hot-reload
      }
      return;
    }

    // Production: auto-restart with rate limiting + exponential backoff
    restartTimestamps.push(now());
    const cutoff = now() - 60_000; // 1 minute
    restartTimestamps = restartTimestamps.filter(t => t >= cutoff);

    if (restartTimestamps.length > MAX_RESTARTS_PER_MIN) {
      console.error(`[mcp-wrapper] ERROR: Too many restarts (${restartTimestamps.length}/min) → stopping`);
      await killChromeFromPidFile();
      process.exit(1);
    }

    console.error(`[mcp-wrapper] Auto-restarting after ${backoff}ms...`);
    await sleep(backoff);
    backoff = Math.min(backoff * 2, BACKOFF_MAX);

    await killChromeFromPidFile();
    spawnChild();
  });

  // Reset backoff after successful run
  setTimeout(() => {
    backoff = BACKOFF_START;
    console.error("[mcp-wrapper] Backoff reset to", BACKOFF_START);
  }, 30_000).unref();
}

/**
 * Restart child process (dev mode only)
 */
async function restartChild() {
  if (restarting) {
    pending = true;
    return;
  }

  restarting = true;
  console.error("[mcp-wrapper] Restarting child...");

  await stopChild();
  await killChromeFromPidFile();
  spawnChild();

  restarting = false;

  if (pending) {
    pending = false;
    restartChild();
  }
}

/**
 * Kill orphaned Chrome process using PID file
 */
async function killChromeFromPidFile() {
  try {
    const txt = await fs.readFile(PID_FILE, "utf8").catch(() => "");
    const pid = Number(txt.trim());

    if (pid > 0) {
      try {
        // Check if process exists
        process.kill(pid, 0);
        // Process exists, kill it
        process.kill(pid, "SIGKILL");
        console.error(`[mcp-wrapper] Killed orphaned Chrome process: ${pid}`);
      } catch (err) {
        // Process doesn't exist (already dead)
      }
    }

    await fs.rm(PID_FILE, { force: true });
  } catch (err) {
    // Ignore errors (file might not exist)
  }
}

/**
 * Development Mode: tsc -w + build directory watcher
 */
async function startDev() {
  console.error("[mcp-wrapper] ========================================");
  console.error("[mcp-wrapper] DEVELOPMENT MODE");
  console.error("[mcp-wrapper] ========================================");
  console.error("[mcp-wrapper] - tsc -w for auto-compilation");
  console.error("[mcp-wrapper] - Watching:", BUILD_GLOB);
  console.error("[mcp-wrapper] - Hot-reload: ON");
  console.error("[mcp-wrapper] ========================================");

  // Start tsc -w (TypeScript watch mode)
  tscProc = spawn("npx", ["tsc", "-w", "-p", TS_PROJECT], {
    stdio: ["ignore", "pipe", "inherit"], // stdout → pipe (redirect to stderr)
    env: process.env,
  });

  // Redirect tsc output to stderr (keep stdout clean for JSON-RPC)
  tscProc.stdout.on("data", (buf) => {
    process.stderr.write(Buffer.from(`[tsc] ${buf.toString()}`));
  });

  tscProc.on("exit", (code) => {
    console.error(`[mcp-wrapper] tsc -w exited: ${code}`);
  });

  // Wait for initial build (5 seconds)
  console.error("[mcp-wrapper] Waiting for initial build...");
  await sleep(5000);

  // Start child process
  spawnChild();

  // Watch build directory for changes
  const watcher = chokidar.watch(BUILD_GLOB, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 120,
      pollInterval: 20
    }
  });

  watcher.on("all", async (event, file) => {
    console.error(`[mcp-wrapper] Build changed: ${event} ${file}`);
    await restartChild();
  });

  console.error("[mcp-wrapper] Hot-reload active! Edit TypeScript files to see changes.");
}

/**
 * Production Mode: single child + auto-restart on crash
 */
async function startProd() {
  console.error("[mcp-wrapper] ========================================");
  console.error("[mcp-wrapper] PRODUCTION MODE");
  console.error("[mcp-wrapper] ========================================");
  console.error("[mcp-wrapper] - Auto-restart: ON");
  console.error("[mcp-wrapper] - Rate limit:", MAX_RESTARTS_PER_MIN, "restarts/min");
  console.error("[mcp-wrapper] ========================================");

  spawnChild();
}

/**
 * Shutdown handler
 */
async function shutdown() {
  console.error("[mcp-wrapper] Shutting down...");

  await stopChild();
  await killChromeFromPidFile();

  if (tscProc && !tscProc.killed) {
    try {
      tscProc.kill("SIGTERM");
      console.error("[mcp-wrapper] Killed tsc -w");
    } catch {}
  }

  process.exit(0);
}

// ==== Signal Handling ====
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("uncaughtException", async (err) => {
  console.error("[mcp-wrapper] Uncaught exception:", err);
  await shutdown();
});

// ==== Start ====
if (isDev) {
  startDev();
} else {
  startProd();
}
