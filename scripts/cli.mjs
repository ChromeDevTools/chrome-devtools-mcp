#!/usr/bin/env node
/**
 * CLI Entry Point for chrome-devtools-mcp-for-extension
 *
 * This is the entry point when users run:
 *   npx chrome-devtools-mcp-for-extension
 *   chrome-devtools-mcp-for-extension (if globally installed)
 *
 * Launches the MCP server with browser globals mock:
 * - Loads browser-globals-mock.mjs BEFORE main.js
 * - Ensures chrome-devtools-frontend modules work in Node.js
 * - Simple execution: no wrapper, no hot-reload
 */

import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Resolve paths
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mockPath = path.join(__dirname, "browser-globals-mock.mjs");
const mainPath = path.join(__dirname, "..", "build", "src", "main.js");

// Launch MCP server with --import flag
const child = spawn(process.execPath, [
  "--import", mockPath,
  mainPath,
  ...process.argv.slice(2) // Forward CLI arguments
], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(1);
  }
  process.exit(code ?? 0);
});

// Forward signals
process.on("SIGTERM", () => child?.kill("SIGTERM"));
process.on("SIGINT", () => child?.kill("SIGINT"));
