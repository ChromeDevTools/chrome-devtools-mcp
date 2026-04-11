/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  cliOptions,
  pluginEnvVarName,
} from '../build/src/bin/chrome-devtools-mcp-cli-options.js';

const PLUGIN_MANIFEST_PATHS = [
  '.claude-plugin/plugin.json',
  '.github/plugin/plugin.json',
];

function optionDescription(optionConfig: (typeof cliOptions)[string]) {
  return optionConfig.description || optionConfig.describe || '';
}

function optionTitle(optionName: string) {
  return optionName
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\burl\b/gi, 'URL')
    .replace(/\bcli\b/gi, 'CLI')
    .replace(/\bmcp\b/gi, 'MCP')
    .replace(/\bws\b/gi, 'WebSocket')
    .replace(/\bffmpeg\b/gi, 'FFmpeg')
    .replace(/\bwebmcp\b/gi, 'WebMCP')
    .replace(/^\w/, character => character.toUpperCase());
}

function userConfigType(optionConfig: (typeof cliOptions)[string]) {
  switch (optionConfig.type) {
    case 'array':
      return 'string';
    case 'boolean':
    case 'number':
    case 'string':
      return optionConfig.type;
    default:
      return undefined;
  }
}

function generateUserConfig() {
  const userConfig: Record<string, unknown> = {};

  for (const [optionName, optionConfig] of Object.entries(cliOptions)) {
    if (optionConfig.hidden) {
      continue;
    }

    const type = userConfigType(optionConfig);
    if (!type) {
      continue;
    }

    userConfig[optionName] = {
      type,
      title: optionTitle(optionName),
      description: optionDescription(optionConfig),
      sensitive: false,
      ...(optionConfig.type === 'array' ? {multiple: true} : {}),
      ...(optionConfig.default !== undefined
        ? {default: optionConfig.default}
        : {}),
    };
  }

  return userConfig;
}

function generatePluginEnv() {
  const env: Record<string, string> = {};

  for (const [optionName, optionConfig] of Object.entries(cliOptions)) {
    if (optionConfig.hidden) {
      continue;
    }

    if (!userConfigType(optionConfig)) {
      continue;
    }

    env[pluginEnvVarName(optionName)] = `\${user_config.${optionName}}`;
  }

  return env;
}

function updatePluginManifest(manifestPath: string) {
  const absolutePath = path.join(import.meta.dirname, '..', manifestPath);
  const manifest = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  const server = manifest.mcpServers?.['chrome-devtools'];

  if (!server) {
    throw new Error(`${manifestPath} is missing mcpServers.chrome-devtools`);
  }

  manifest.userConfig = generateUserConfig();
  server.env = generatePluginEnv();

  fs.writeFileSync(absolutePath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Updated ${manifestPath}`);
}

for (const manifestPath of PLUGIN_MANIFEST_PATHS) {
  updatePluginManifest(manifestPath);
}
