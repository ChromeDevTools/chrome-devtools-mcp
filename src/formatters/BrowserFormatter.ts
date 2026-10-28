/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {getDefaultUserDataDir} from '../config/browser-options.js';
import type {ParsedArguments} from '../config/mcp-options.js';

export interface BrowserDescription {
  /** How chrome-devtools-mcp reaches the browser. */
  connection: 'launched' | 'autoConnect' | 'browserUrl' | 'wsEndpoint';
  /** Host and port of `--browserUrl` or `--wsEndpoint`. */
  host?: string;
}

function describeEndpoint(
  connection: 'browserUrl' | 'wsEndpoint',
  url: string,
): BrowserDescription {
  try {
    // The host leaves out userinfo, path and query, which can carry secrets.
    return {connection, host: new URL(url).host};
  } catch {
    return {connection};
  }
}

/**
 * Describes the browser that this server instance controls, so that an agent
 * using several instances can tell their browsers apart.
 */
export class BrowserFormatter {
  readonly #args: Readonly<ParsedArguments>;

  constructor(args: Readonly<ParsedArguments>) {
    this.#args = args;
  }

  toJSON(): BrowserDescription {
    // Same precedence as BrowserManager uses to pick the connection.
    const {wsEndpoint, browserUrl, autoConnect} = this.#args;
    if (wsEndpoint) {
      return describeEndpoint('wsEndpoint', wsEndpoint);
    }
    if (browserUrl) {
      return describeEndpoint('browserUrl', browserUrl);
    }
    return {connection: autoConnect ? 'autoConnect' : 'launched'};
  }

  toString(): string {
    const {connection, host} = this.toJSON();
    switch (connection) {
      case 'launched':
        return 'a dedicated Chrome launched by chrome-devtools-mcp';
      case 'autoConnect':
        return "the user's running Chrome, attached via --autoConnect";
      case 'browserUrl':
      case 'wsEndpoint': {
        const at = host ? ` at ${host}` : '';
        return `a running Chrome${at}, attached via --${connection}`;
      }
    }
  }

  /**
   * The MCP server instructions, which clients may add to the system prompt.
   */
  toInstructions(): string {
    const {userDataDir, isolated} = this.#args;
    switch (this.toJSON().connection) {
      case 'launched': {
        // Same profile as BrowserManager launches Chrome with.
        let profile = userDataDir;
        if (!isolated && !profile) {
          profile = getDefaultUserDataDir(this.#args);
        }
        const profileLabel = profile
          ? `profile: ${profile}`
          : 'temporary profile, deleted when the browser closes';
        return `This server controls ${this.toString()} (${profileLabel}).`;
      }
      case 'autoConnect': {
        const profileLabel = userDataDir ? ` (profile: ${userDataDir})` : '';
        return (
          `This server controls ${this.toString()}${profileLabel}. ` +
          'Its tabs, cookies and signed-in sessions belong to the user.'
        );
      }
      case 'browserUrl':
      case 'wsEndpoint':
        return `This server controls ${this.toString()}.`;
    }
  }
}
