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

const HOST_CONFIG_TEMPLATE = `// VS Code DevTools MCP — Host Configuration (JSONC)
//
// This file configures the VS Code DevTools MCP Server at the host level.
// It determines which client workspace to control and which extension to load.
// Logs are written to stderr and appear in VS Code's MCP output channel.

{
  // Path to the client workspace folder (absolute, or relative to host workspace root).
  // This is the VS Code window that the MCP server controls.
  // If omitted, the host workspace root is used.
  // "clientWorkspace": "my-project",

  // Path to the vscode-devtools extension folder (absolute, or relative to host workspace root).
  // If omitted, no extension is loaded in the client workspace.
  // "extensionPath": "extension",
}
`;

const CLIENT_CONFIG_TEMPLATE = `// VS Code DevTools MCP — Client Configuration (JSONC)
//
// This file configures runtime behavior of the client VS Code window
// controlled by the MCP server.

{
  // Enable extra diagnostic tools (debug_evaluate).
  "devDiagnostic": false,

  // Run VS Code headless (Linux only).
  "headless": false,

  // Enable experimental vision tools.
  "experimentalVision": false,

  // Enable experimental structured content output.
  "experimentalStructuredContent": false,

  // VS Code launch flags for the client VS Code window.
  "launch": {
    // Open the client workspace in a new window.
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
 * Host configuration read from .devtools/host.config.jsonc.
 * Controls which client workspace and extension to use.
 */
export interface HostConfig {
  /** Path to the client workspace (absolute or relative to host root). Defaults to host root. */
  clientWorkspace?: string;
  /** Path to the extension folder (absolute or relative to host root). If omitted, no extension is loaded. */
  extensionPath?: string;
}

/**
 * Client configuration read from .devtools/client.config.jsonc.
 * Controls runtime behavior of the client VS Code window.
 */
export interface ClientConfig {
  /** Enable diagnostic tools (debug_evaluate) */
  devDiagnostic?: boolean;

  /** Run VS Code headless (Linux only) */
  headless?: boolean;

  /** Enable experimental vision tools */
  experimentalVision?: boolean;

  /** Enable experimental structured content output */
  experimentalStructuredContent?: boolean;

  /** VS Code launch flags for the client VS Code window */
  launch?: Partial<LaunchFlags>;
}

/**
 * Resolved configuration with all paths made absolute
 */
export interface ResolvedConfig {
  /** The host workspace where VS Code is running */
  hostWorkspace: string;
  /** The client workspace that the MCP server controls */
  clientWorkspace: string;
  /** Path to the extension folder, or empty string when no extension is configured */
  extensionBridgePath: string;
  /** True when extensionPath was explicitly set in host config */
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

function coerceHostConfig(value: unknown): HostConfig {
  if (!isRecord(value)) {return {};}

  const config: HostConfig = {};

  const clientWorkspace = readOptionalString(value, 'clientWorkspace');
  if (clientWorkspace) {config.clientWorkspace = clientWorkspace;}

  const extensionPath = readOptionalString(value, 'extensionPath');
  if (extensionPath) {config.extensionPath = extensionPath;}

  return config;
}

function coerceClientConfig(value: unknown): ClientConfig {
  if (!isRecord(value)) {return {};}

  const config: ClientConfig = {};

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
 * Load host config from <hostRoot>/.devtools/host.config.jsonc.
 * Contains clientWorkspace and extensionPath.
 */
function loadHostConfig(hostRoot: string): HostConfig {
  const configPath = join(hostRoot, '.devtools', 'host.config.jsonc');

  if (!existsSync(configPath)) {
    logger(`No host config found, creating template at ${configPath}`);
    mkdirSync(join(hostRoot, '.devtools'), {recursive: true});
    writeFileSync(configPath, HOST_CONFIG_TEMPLATE + '\n');
    return {};
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const parsed: unknown = parse(content);
    const config = coerceHostConfig(parsed);
    logger(`Loaded host config from ${configPath}`);
    return config;
  } catch (error) {
    logger(`Failed to parse host config at ${configPath}: ${error}`);
    return {};
  }
}

/**
 * Load client config from <clientRoot>/.devtools/client.config.jsonc.
 * Contains runtime settings (headless, launch flags, etc.).
 */
function loadClientConfig(clientRoot: string): ClientConfig {
  const configDir = join(clientRoot, '.devtools');
  const configPath = join(configDir, 'client.config.jsonc');

  if (!existsSync(configPath)) {
    logger(`No client config found, creating template at ${configPath}`);
    mkdirSync(configDir, {recursive: true});
    writeFileSync(configPath, CLIENT_CONFIG_TEMPLATE + '\n');
    return {
      launch: {...DEFAULT_LAUNCH_FLAGS},
    };
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const parsed: unknown = parse(content);
    const config = coerceClientConfig(parsed);
    logger(`Loaded client config from ${configPath}`);
    return config;
  } catch (error) {
    logger(`Failed to parse client config at ${configPath}: ${error}`);
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

// Module-level storage for the resolved client workspace path.
// Set during loadConfig(), read via getClientWorkspace().
let _resolvedClientWorkspace: string | undefined;

/**
 * Get the client workspace that the MCP server controls.
 * Falls back to the host workspace if loadConfig() hasn't been called yet.
 */
export function getClientWorkspace(): string {
  return _resolvedClientWorkspace ?? getHostWorkspace();
}

/**
 * Load and resolve configuration from host and client config files.
 *
 * Host config (.devtools/host.config.jsonc): clientWorkspace, extensionPath
 * Client config (.devtools/client.config.jsonc): runtime settings (headless, launch, etc.)
 */
export function loadConfig(cliArgs: {
  devDiagnostic?: boolean;
  headless?: boolean;
  experimentalVision?: boolean;
  experimentalStructuredContent?: boolean;
}): ResolvedConfig {
  const hostRoot = getHostWorkspace();

  // 1. Read host config for clientWorkspace and extensionPath
  const hostConfig = loadHostConfig(hostRoot);

  // 2. Resolve client workspace: from host config, or host root if not set
  let clientWorkspace: string;
  if (hostConfig.clientWorkspace) {
    clientWorkspace = isAbsolute(hostConfig.clientWorkspace)
      ? hostConfig.clientWorkspace
      : resolve(hostRoot, hostConfig.clientWorkspace);
  } else {
    clientWorkspace = hostRoot;
  }

  // Store for getClientWorkspace() access by tools
  _resolvedClientWorkspace = clientWorkspace;

  // 3. Resolve extension path: from host config, or empty string (no extension)
  let extensionBridgePath = '';
  const explicitExtensionDevelopmentPath = typeof hostConfig.extensionPath === 'string';
  if (hostConfig.extensionPath) {
    extensionBridgePath = isAbsolute(hostConfig.extensionPath)
      ? hostConfig.extensionPath
      : resolve(hostRoot, hostConfig.extensionPath);
  }

  // 4. Read client config for runtime settings
  const clientConfig = loadClientConfig(clientWorkspace);

  return {
    hostWorkspace: hostRoot,
    clientWorkspace,
    extensionBridgePath,
    explicitExtensionDevelopmentPath,
    devDiagnostic: cliArgs.devDiagnostic ?? clientConfig.devDiagnostic ?? false,
    headless: cliArgs.headless ?? clientConfig.headless ?? false,
    experimentalVision:
      cliArgs.experimentalVision ?? clientConfig.experimentalVision ?? false,
    experimentalStructuredContent:
      cliArgs.experimentalStructuredContent ??
      clientConfig.experimentalStructuredContent ??
      false,
    launch: resolveLaunchFlags(clientConfig.launch),
  };
}
