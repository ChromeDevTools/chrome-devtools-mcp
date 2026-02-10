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
 * Note: The bridge socket path is computed deterministically from the workspace
 * path — there's no need for a `bridgeSocketPath` field.
 */
export interface DevToolsConfig {
  /** Path to vsctk extension (relative to workspace or absolute). Used for --extensionDevelopmentPath. */
  extensionPath?: string;

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
 * Get default vsctk extension path (parent of vscode-devtools-mcp package)
 */
function getDefaultExtensionPath(): string {
  // Build output is in vscode-devtools-mcp/build/src/
  // Go up to vscode-devtools-mcp, then to parent (workspace root)
  const packageRoot = dirname(dirname(__dirname));
  const parentDir = dirname(packageRoot);

  // In this repo, the VS Code extension lives in the "extension" folder.
  const extensionFolder = join(parentDir, 'extension');
  const extensionPackageJson = join(extensionFolder, 'package.json');
  if (existsSync(extensionPackageJson)) return extensionFolder;

  // Fallback for repos where the extension lives at the workspace root.
  const rootPackageJson = join(parentDir, 'package.json');
  if (existsSync(rootPackageJson)) return parentDir;

  return parentDir;
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
  extensionDevelopmentPath?: string;
  // Legacy CLI args for backwards compatibility
  folder?: string;
  extensionBridgePath?: string;
  targetFolder?: string;
  devDiagnostic?: boolean;
  logFile?: string;
  headless?: boolean;
  experimentalVision?: boolean;
  experimentalStructuredContent?: boolean;
  categoryPerformance?: boolean;
  categoryNetwork?: boolean;
}): ResolvedConfig {
  // Workspace folder priority: CLI --workspace > legacy --folder
  const workspaceFolder =
    cliArgs.workspace ?? cliArgs.folder;

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

  // Resolve extension path with priority: CLI > config > default
  let extensionBridgePath: string;
  const cliExtensionPath = cliArgs.extensionDevelopmentPath ?? cliArgs.extensionBridgePath;
  if (cliExtensionPath) {
    extensionBridgePath = isAbsolute(cliExtensionPath)
      ? cliExtensionPath
      : resolve(absoluteWorkspace, cliExtensionPath);
  } else if (fileConfig.extensionPath) {
    extensionBridgePath =
      resolvePath(absoluteWorkspace, fileConfig.extensionPath) ??
      getDefaultExtensionPath();
  } else {
    extensionBridgePath = getDefaultExtensionPath();
  }

  // Resolve log file path
  const logFile =
    cliArgs.logFile ??
    resolvePath(absoluteWorkspace, fileConfig.logFile);

  return {
    hostWorkspace: getHostWorkspace(),
    workspaceFolder: absoluteWorkspace,
    extensionBridgePath,
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
