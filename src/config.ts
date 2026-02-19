/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, isAbsolute, join, resolve} from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {parse} from 'jsonc-parser';

import {logger} from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * VS Code launch flags that control the Extension Development Host window.
 * Flags marked "always present" are injected by the launcher and cannot be
 * overridden here (remote-debugging-port, inspect-extensions,
 * extensionDevelopmentPath, user-data-dir, target folder).
 */
export interface LaunchFlags {
  /** Open in a new window (--new-window). */
  newWindow: boolean;
  /** Disable all extensions except those in enableExtensions (--disable-extensions). */
  disableExtensions: boolean;
  /** Suppress the release-notes tab (--skip-release-notes). */
  skipReleaseNotes: boolean;
  /** Suppress the welcome tab (--skip-welcome). */
  skipWelcome: boolean;
  /** Disable GPU hardware acceleration (--disable-gpu). */
  disableGpu: boolean;
  /** Disable workspace-trust dialog (--disable-workspace-trust). */
  disableWorkspaceTrust: boolean;
  /** Enable verbose logging (--verbose). */
  verbose: boolean;
  /** Set the display language, e.g. "en" (--locale). null = OS default. */
  locale: string | null;
  /** Extension IDs to keep enabled when disableExtensions is true. */
  enableExtensions: string[];
  /** Arbitrary extra CLI flags forwarded verbatim. */
  extraArgs: string[];
}

export const DEFAULT_LAUNCH_FLAGS: LaunchFlags = {
  newWindow: true,
  disableExtensions: true,
  skipReleaseNotes: true,
  skipWelcome: true,
  disableGpu: false,
  disableWorkspaceTrust: false,
  verbose: false,
  locale: null,
  enableExtensions: [
    'vscode.typescript-language-features',
    'github.copilot-chat',
  ],
  extraArgs: [],
};

const DEFAULT_CONFIG_TEMPLATE = `// VS Code DevTools MCP configuration (JSONC)
//
// This file supports comments and trailing commas.
// Only the keys you set are applied; omitted keys use defaults.

{
  // NOTE: This file should live at: <workspace>/.devtools/devtools.jsonc

  // Path to the vscode-devtools VS Code extension folder (absolute or relative to this workspace).
  // If omitted, defaults to the repo's "extension/" folder when present.
  // "extensionPath": "extension",

  // Enable extra diagnostic tools (debug_evaluate).
  "devDiagnostic": false,

  // Write logs to a file (absolute or relative path).
  // Logs are written to stderr and appear in VS Code's MCP output channel.

  // Run VS Code headless (Linux only).
  "headless": false,

  // Enable experimental vision tools.
  "experimentalVision": false,

  // Enable experimental structured content output.
  "experimentalStructuredContent": false,

  // VS Code launch flags for the spawned Extension Development Host window.
  "launch": {
    // Open the target workspace in a new window.
    "newWindow": true,

    // Disable all extensions except those explicitly enabled below.
    "disableExtensions": true,

    // Hide release notes / welcome UI on startup.
    "skipReleaseNotes": true,
    "skipWelcome": true,

    // Optional switches.
    "disableGpu": false,
    "disableWorkspaceTrust": false,
    "verbose": false,

    // Force a VS Code UI locale (e.g. "en", "de"). Use null to keep OS default.
    "locale": null,

    // Extensions to enable when disableExtensions=true.
    "enableExtensions": [
      "vscode.typescript-language-features",
      "github.copilot-chat",
    ],

    // Extra raw flags forwarded to VS Code as-is.
    // Example: ["--log=trace", "--disable-updates"]
    "extraArgs": [],
  },
}
`;

/**
 * Configuration schema for .devtools/devtools.jsonc
 * 
 * Note: The bridge socket path is computed deterministically from the workspace
 * path — there's no need for a `bridgeSocketPath` field.
 */
export interface DevToolsConfig {
  /** Path to vscode-devtools extension (relative to workspace or absolute). Used for --extensionDevelopmentPath. */
  extensionPath?: string;

  /** Enable diagnostic tools (debug_evaluate) */
  devDiagnostic?: boolean;

  /** Run VS Code headless (Linux only) */
  headless?: boolean;

  /** Enable experimental vision tools */
  experimentalVision?: boolean;

  /** Enable experimental structured content output */
  experimentalStructuredContent?: boolean;

  /** VS Code launch flags for the Extension Development Host window */
  launch?: Partial<LaunchFlags>;
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
  /** True when the extension dev path was explicitly supplied via CLI args. */
  explicitExtensionDevelopmentPath: boolean;
  devDiagnostic: boolean;
  headless: boolean;
  experimentalVision: boolean;
  experimentalStructuredContent: boolean;
  launch: LaunchFlags;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalString(
  obj: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = obj[key];
  return typeof value === 'string' ? value : undefined;
}

function readOptionalBoolean(
  obj: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = obj[key];
  return typeof value === 'boolean' ? value : undefined;
}

function readOptionalStringArray(
  obj: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const value = obj[key];
  if (!Array.isArray(value)) {return undefined;}
  const strings: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {return undefined;}
    strings.push(item);
  }
  return strings;
}

function coerceDevToolsConfig(value: unknown): DevToolsConfig {
  if (!isRecord(value)) {return {};}

  const config: DevToolsConfig = {};

  const extensionPath = readOptionalString(value, 'extensionPath');
  if (extensionPath) {config.extensionPath = extensionPath;}

  const devDiagnostic = readOptionalBoolean(value, 'devDiagnostic');
  if (typeof devDiagnostic === 'boolean') {config.devDiagnostic = devDiagnostic;}

  const headless = readOptionalBoolean(value, 'headless');
  if (typeof headless === 'boolean') {config.headless = headless;}

  const experimentalVision = readOptionalBoolean(value, 'experimentalVision');
  if (typeof experimentalVision === 'boolean') {config.experimentalVision = experimentalVision;}

  const experimentalStructuredContent = readOptionalBoolean(
    value,
    'experimentalStructuredContent',
  );
  if (typeof experimentalStructuredContent === 'boolean') {
    config.experimentalStructuredContent = experimentalStructuredContent;
  }

  const launchValue = value['launch'];
  if (isRecord(launchValue)) {
    const launch: Partial<LaunchFlags> = {};

    const newWindow = readOptionalBoolean(launchValue, 'newWindow');
    if (typeof newWindow === 'boolean') {launch.newWindow = newWindow;}

    const disableExtensions = readOptionalBoolean(launchValue, 'disableExtensions');
    if (typeof disableExtensions === 'boolean') {launch.disableExtensions = disableExtensions;}

    const skipReleaseNotes = readOptionalBoolean(launchValue, 'skipReleaseNotes');
    if (typeof skipReleaseNotes === 'boolean') {launch.skipReleaseNotes = skipReleaseNotes;}

    const skipWelcome = readOptionalBoolean(launchValue, 'skipWelcome');
    if (typeof skipWelcome === 'boolean') {launch.skipWelcome = skipWelcome;}

    const disableGpu = readOptionalBoolean(launchValue, 'disableGpu');
    if (typeof disableGpu === 'boolean') {launch.disableGpu = disableGpu;}

    const disableWorkspaceTrust = readOptionalBoolean(launchValue, 'disableWorkspaceTrust');
    if (typeof disableWorkspaceTrust === 'boolean') {
      launch.disableWorkspaceTrust = disableWorkspaceTrust;
    }

    const verbose = readOptionalBoolean(launchValue, 'verbose');
    if (typeof verbose === 'boolean') {launch.verbose = verbose;}

    const localeValue = launchValue['locale'];
    if (localeValue === null) {
      launch.locale = null;
    } else if (typeof localeValue === 'string') {
      launch.locale = localeValue;
    }

    const enableExtensions = readOptionalStringArray(launchValue, 'enableExtensions');
    if (enableExtensions) {launch.enableExtensions = enableExtensions;}

    const extraArgs = readOptionalStringArray(launchValue, 'extraArgs');
    if (extraArgs) {launch.extraArgs = extraArgs;}

    config.launch = launch;
  }

  return config;
}

/**
 * Load devtools config from the target workspace.
 *
 * Prefers `.devtools/devtools.jsonc` (JSON-with-comments) but still supports
 * `.devtools/devtools.json` and legacy `.vscode/devtools.jsonc|devtools.json`
 * for backwards compatibility.
 */
function loadConfigFile(workspaceFolder: string): DevToolsConfig {
  const configDirPreferred = join(workspaceFolder, '.devtools');
  const configPathJsoncPreferred = join(configDirPreferred, 'devtools.jsonc');
  const configPathJsonPreferred = join(configDirPreferred, 'devtools.json');

  const configDirLegacy = join(workspaceFolder, '.vscode');
  const configPathJsoncLegacy = join(configDirLegacy, 'devtools.jsonc');
  const configPathJsonLegacy = join(configDirLegacy, 'devtools.json');

  const configPath =
    (existsSync(configPathJsoncPreferred) ? configPathJsoncPreferred : undefined) ??
    (existsSync(configPathJsonPreferred) ? configPathJsonPreferred : undefined) ??
    (existsSync(configPathJsoncLegacy) ? configPathJsoncLegacy : undefined) ??
    (existsSync(configPathJsonLegacy) ? configPathJsonLegacy : undefined);

  if (!configPath) {
    logger(
      `No config file found, creating template at ${configPathJsoncPreferred}`,
    );
    mkdirSync(configDirPreferred, {recursive: true});
    writeFileSync(configPathJsoncPreferred, DEFAULT_CONFIG_TEMPLATE + '\n');
    return {
      launch: {...DEFAULT_LAUNCH_FLAGS},
    };
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const parsed: unknown = parse(content);
    const config = coerceDevToolsConfig(parsed);
    logger(`Loaded config from ${configPath}`);
    return config;
  } catch (error) {
    logger(`Failed to parse config at ${configPath}: ${error}`);
    return {};
  }
}

/** Merge partial launch flags over defaults. */
function resolveLaunchFlags(partial?: Partial<LaunchFlags>): LaunchFlags {
  if (!partial) {return {...DEFAULT_LAUNCH_FLAGS};}
  return {
    ...DEFAULT_LAUNCH_FLAGS,
    ...partial,
    // Arrays must be explicitly provided or fall back to defaults
    enableExtensions: partial.enableExtensions ?? DEFAULT_LAUNCH_FLAGS.enableExtensions,
    extraArgs: partial.extraArgs ?? DEFAULT_LAUNCH_FLAGS.extraArgs,
  };
}

/**
 * Resolve a path relative to workspace folder, or return absolute path as-is
 */
function resolvePath(
  basePath: string,
  relativePath: string | undefined,
): string | undefined {
  if (!relativePath) {return undefined;}
  if (isAbsolute(relativePath)) {return relativePath;}
  return resolve(basePath, relativePath);
}

/**
 * Get default vscode-devtools extension path (parent of mcp-server package)
 */
function getDefaultExtensionPath(): string {
  // Build output is in mcp-server/build/src/
  // Go up to mcp-server, then to parent (workspace root)
  const packageRoot = dirname(dirname(__dirname));
  const parentDir = dirname(packageRoot);

  // In this repo, the VS Code extension lives in the "extension" folder.
  const extensionFolder = join(parentDir, 'extension');
  const extensionPackageJson = join(extensionFolder, 'package.json');
  if (existsSync(extensionPackageJson)) {return extensionFolder;}

  // Fallback for repos where the extension lives at the workspace root.
  const rootPackageJson = join(parentDir, 'package.json');
  if (existsSync(rootPackageJson)) {return parentDir;}

  return parentDir;
}

/**
 * Get the host workspace where VS Code is running.
 * This is the parent of the mcp-server package.
 */
export function getHostWorkspace(): string {
  // Build output is in mcp-server/build/src/
  // Go up to mcp-server, then to parent (the host workspace)
  const packageRoot = dirname(dirname(__dirname));
  return dirname(packageRoot);
}

/**
 * Load and resolve configuration from workspace's devtools.json
 * Priority: CLI args > env vars > config file defaults
 */
export function loadConfig(cliArgs: {
  testWorkspace?: string;
  extension?: string;
  // Backwards-compatibility aliases
  workspace?: string;
  extensionDevelopmentPath?: string;
  // Legacy CLI args for backwards compatibility
  folder?: string;
  extensionBridgePath?: string;
  targetFolder?: string;
  devDiagnostic?: boolean;
  headless?: boolean;
  experimentalVision?: boolean;
  experimentalStructuredContent?: boolean;
}): ResolvedConfig {
  // Workspace folder priority: CLI --test-workspace > legacy --workspace > legacy --folder > host devtools.jsonc
  let workspaceFolder =
    cliArgs.testWorkspace ?? cliArgs.workspace ?? cliArgs.folder;

  // Fallback: read testWorkspace from the host workspace's devtools.jsonc
  const hostRoot = getHostWorkspace();
  if (!workspaceFolder) {
    const hostConfigPath = join(hostRoot, '.devtools', 'devtools.jsonc');
    if (existsSync(hostConfigPath)) {
      try {
        const raw = readFileSync(hostConfigPath, 'utf8');
        const parsed = parse(raw);
        if (typeof parsed?.testWorkspace === 'string') {
          // Resolve relative paths against host workspace root
          workspaceFolder = isAbsolute(parsed.testWorkspace)
            ? parsed.testWorkspace
            : resolve(hostRoot, parsed.testWorkspace);
          console.log(`[config] Using testWorkspace from host devtools.jsonc: ${workspaceFolder}`);
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  if (!workspaceFolder) {
    throw new Error(
      'Workspace folder is required. Use --test-workspace /path/to/workspace or set testWorkspace in .devtools/devtools.jsonc',
    );
  }

  const absoluteWorkspace = isAbsolute(workspaceFolder)
    ? workspaceFolder
    : resolve(process.cwd(), workspaceFolder);

  // Load config from workspace's .vscode/devtools.json
  const fileConfig = loadConfigFile(absoluteWorkspace);

  const explicitExtensionDevelopmentPath =
    typeof cliArgs.extension === 'string' ||
    typeof cliArgs.extensionDevelopmentPath === 'string' ||
    typeof cliArgs.extensionBridgePath === 'string';

  // Resolve extension path with priority: CLI > config > default
  let extensionBridgePath: string;
  const cliExtensionPath =
    cliArgs.extension ??
    cliArgs.extensionDevelopmentPath ??
    cliArgs.extensionBridgePath;
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

  return {
    hostWorkspace: getHostWorkspace(),
    workspaceFolder: absoluteWorkspace,
    extensionBridgePath,
    explicitExtensionDevelopmentPath,
    devDiagnostic: cliArgs.devDiagnostic ?? fileConfig.devDiagnostic ?? false,
    headless: cliArgs.headless ?? fileConfig.headless ?? false,
    experimentalVision:
      cliArgs.experimentalVision ?? fileConfig.experimentalVision ?? false,
    experimentalStructuredContent:
      cliArgs.experimentalStructuredContent ??
      fileConfig.experimentalStructuredContent ??
      false,
    launch: resolveLaunchFlags(fileConfig.launch),
  };
}
