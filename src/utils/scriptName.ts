/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const MCP_SCRIPT_NAME_ENV = 'CHROME_DEVTOOLS_MCP_SCRIPT_NAME';
export const CLI_SCRIPT_NAME_ENV = 'CHROME_DEVTOOLS_MCP_CLI_SCRIPT_NAME';

const DEFAULT_MCP_SCRIPT_NAME = 'chrome-devtools-mcp';
const NPX_MCP_SCRIPT_NAME = 'npx chrome-devtools-mcp@latest';
const DEFAULT_CLI_SCRIPT_NAME = 'chrome-devtools';

function readEnvOverride(
  env: NodeJS.ProcessEnv,
  envVar: string,
): string | undefined {
  const value = env[envVar]?.trim();
  return value || undefined;
}

function isInvokedViaNpx(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): boolean {
  return (
    env['npm_lifecycle_event'] === 'npx' ||
    (argv.length > 1 && /[/\\]_npx[/\\]/.test(argv[1]))
  );
}

export function resolveMcpScriptName(
  argv: readonly string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const override = readEnvOverride(env, MCP_SCRIPT_NAME_ENV);
  if (override) {
    return override;
  }
  return isInvokedViaNpx(argv, env)
    ? NPX_MCP_SCRIPT_NAME
    : DEFAULT_MCP_SCRIPT_NAME;
}

export function resolveCliScriptName(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return readEnvOverride(env, CLI_SCRIPT_NAME_ENV) ?? DEFAULT_CLI_SCRIPT_NAME;
}

export function formatMissingPeerDependencyError(
  format: 'toon' | 'gcf',
  packageName: string,
  options?: {
    argv?: readonly string[];
    env?: NodeJS.ProcessEnv;
  },
): string {
  const argv = options?.argv ?? process.argv;
  const env = options?.env ?? process.env;
  const base =
    `The \`${packageName}\` package is required to use ` +
    `--experimentalDataFormat=${format}. ` +
    'Make sure the peer dependency is installed';
  if (
    readEnvOverride(env, MCP_SCRIPT_NAME_ENV) ||
    readEnvOverride(env, CLI_SCRIPT_NAME_ENV)
  ) {
    return `${base}.`;
  }
  if (isInvokedViaNpx(argv, env)) {
    return (
      `${base}:\n` +
      `- For npx: npx --package ${DEFAULT_MCP_SCRIPT_NAME}@latest ` +
      `--package ${packageName}@latest ${DEFAULT_MCP_SCRIPT_NAME} ` +
      `--experimentalDataFormat=${format}`
    );
  }
  return (
    `${base}:\n` +
    `- For npm: npm install ${packageName} (add -g if installed globally)`
  );
}

export function formatMcpUpdateMessage(
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (readEnvOverride(env, MCP_SCRIPT_NAME_ENV)) {
    return (
      `Update your ${DEFAULT_MCP_SCRIPT_NAME} installation to the latest ` +
      'version.'
    );
  }
  return `Run \`npm install ${DEFAULT_MCP_SCRIPT_NAME}@latest\` to update.`;
}

export function formatCliUpdateMessage(
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (readEnvOverride(env, CLI_SCRIPT_NAME_ENV)) {
    return (
      `Update ${DEFAULT_MCP_SCRIPT_NAME} and run ` +
      `\`${resolveCliScriptName(env)} start\` to restart the daemon.`
    );
  }
  return (
    `Run \`npm install -g ${DEFAULT_MCP_SCRIPT_NAME}@latest\` and ` +
    `\`${DEFAULT_CLI_SCRIPT_NAME} start\` to update and restart the daemon.`
  );
}
