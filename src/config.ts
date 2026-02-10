/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {existsSync, readFileSync} from 'node:fs';
import {dirname, isAbsolute, join, resolve} from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {logger} from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Configuration schema for .vscode/devtools.json
 * 
 * Note: `bridgeSocketPath` is injected at runtime by extension-bridge
 * when VS Code starts - it's not user-configurable.
 */
export interface DevToolsConfig {
  /** Path to extension-bridge extension (relative to workspace or absolute) */
  extensionBridgePath?: string;

  /** Enable dev mode with file watching and auto-rebuild */
  dev?: boolean;

  /** Enable diagnostic tools (debug_evaluate) */
  devDiagnostic?: boolean;

  /** Path to log file (relative to workspace or absolute) */
  logFile?: string;

  /** Run VS Code headless (Linux only) */
  headless?: boolean;

  /** Enable experimental vision tools */
  experimentalVision?: boolean;

  /** Enable experimental structured content output */
  experimentalStructuredContent?: boolean;

  /** Category toggles */
  categories?: {
    performance?: boolean;
    network?: boolean;
  };
}

/**
 * Resolved configuration with all paths made absolute
 */
export interface ResolvedConfig {
  /** The host workspace where VS Code is running (contains .vscode/sockpath) */
  hostWorkspace: string;
  /** The target workspace to open in the debug window */
  workspaceFolder: string;
  extensionBridgePath: string;
  dev: boolean;
  devDiagnostic: boolean;
  logFile?: string;
  headless: boolean;
  experimentalVision: boolean;
  experimentalStructuredContent: boolean;
  categoryPerformance: boolean;
  categoryNetwork: boolean;
}

/**
 * Load devtools.json from workspace's .vscode folder
 */
function loadConfigFile(workspaceFolder: string): DevToolsConfig {
  const configPath = join(workspaceFolder, '.vscode', 'devtools.json');

  if (!existsSync(configPath)) {
    logger(`No config file found at ${configPath}, using defaults`);
    return {};
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content) as DevToolsConfig;
    logger(`Loaded config from ${configPath}`);
    return config;
  } catch (error) {
    logger(`Failed to parse config at ${configPath}: ${error}`);
    return {};
  }
}

/**
 * Resolve a path relative to workspace folder, or return absolute path as-is
 */
function resolvePath(
  basePath: string,
  relativePath: string | undefined,
): string | undefined {
  if (!relativePath) return undefined;
  if (isAbsolute(relativePath)) return relativePath;
  return resolve(basePath, relativePath);
}

/**
 * Get default extension-bridge path (adjacent to vscode-devtools-mcp package)
 */
function getDefaultExtensionBridgePath(): string {
  // Build output is in vscode-devtools-mcp/build/src/
  // Go up to vscode-devtools-mcp, then to parent, then to extension-bridge
  const packageRoot = dirname(dirname(__dirname));
  const parentDir = dirname(packageRoot);
  return join(parentDir, 'extension-bridge');
}

/**
 * Get the host workspace where VS Code is running.
 * This is the parent of the vscode-devtools-mcp package.
 */
function getHostWorkspace(): string {
  // Build output is in vscode-devtools-mcp/build/src/
  // Go up to vscode-devtools-mcp, then to parent (the host workspace)
  const packageRoot = dirname(dirname(__dirname));
  return dirname(packageRoot);
}

/**
 * Load and resolve configuration from workspace's devtools.json
 * Priority: CLI args > env vars > config file defaults
 */
export function loadConfig(cliArgs: {
  workspace?: string;
  // Legacy CLI args for backwards compatibility
  folder?: string;
  extensionBridgePath?: string;
  targetFolder?: string;
  dev?: boolean;
  devDiagnostic?: boolean;
  logFile?: string;
  headless?: boolean;
  experimentalVision?: boolean;
  experimentalStructuredContent?: boolean;
  categoryPerformance?: boolean;
  categoryNetwork?: boolean;
}): ResolvedConfig {
  // Workspace folder priority: CLI --workspace > env "workspace" > legacy --folder
  const workspaceFolder =
    cliArgs.workspace ?? process.env.workspace ?? cliArgs.folder;

  if (!workspaceFolder) {
    throw new Error(
      'Workspace folder is required. Use --workspace /path/to/workspace',
    );
  }

  const absoluteWorkspace = isAbsolute(workspaceFolder)
    ? workspaceFolder
    : resolve(process.cwd(), workspaceFolder);

  // Load config from workspace's .vscode/devtools.json
  const fileConfig = loadConfigFile(absoluteWorkspace);

  // Resolve extension bridge path with priority: CLI > config > default
  let extensionBridgePath: string;
  if (cliArgs.extensionBridgePath) {
    extensionBridgePath = isAbsolute(cliArgs.extensionBridgePath)
      ? cliArgs.extensionBridgePath
      : resolve(absoluteWorkspace, cliArgs.extensionBridgePath);
  } else if (fileConfig.extensionBridgePath) {
    extensionBridgePath =
      resolvePath(absoluteWorkspace, fileConfig.extensionBridgePath) ??
      getDefaultExtensionBridgePath();
  } else {
    extensionBridgePath = getDefaultExtensionBridgePath();
  }

  // Resolve log file path
  const logFile =
    cliArgs.logFile ??
    resolvePath(absoluteWorkspace, fileConfig.logFile);

  return {
    hostWorkspace: getHostWorkspace(),
    workspaceFolder: absoluteWorkspace,
    extensionBridgePath,
    dev: cliArgs.dev ?? fileConfig.dev ?? false,
    devDiagnostic: cliArgs.devDiagnostic ?? fileConfig.devDiagnostic ?? false,
    logFile,
    headless: cliArgs.headless ?? fileConfig.headless ?? false,
    experimentalVision:
      cliArgs.experimentalVision ?? fileConfig.experimentalVision ?? false,
    experimentalStructuredContent:
      cliArgs.experimentalStructuredContent ??
      fileConfig.experimentalStructuredContent ??
      false,
    categoryPerformance:
      cliArgs.categoryPerformance ?? fileConfig.categories?.performance ?? true,
    categoryNetwork:
      cliArgs.categoryNetwork ?? fileConfig.categories?.network ?? true,
  };
}
