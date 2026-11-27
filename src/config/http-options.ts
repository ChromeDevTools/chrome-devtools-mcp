/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {isIP} from 'node:net';

import type {McpOption, McpOptionsFor} from './category-options.js';

export const DEFAULT_HTTP_HOST = '127.0.0.1';
export const DEFAULT_HTTP_PORT = 3000;
export const HTTP_ENDPOINT_PATH = '/mcp';
export const HTTP_TOKEN_ENV_VAR = 'CHROME_DEVTOOLS_MCP_HTTP_TOKEN';

export interface HttpArguments {
  transport: 'stdio' | 'http';
  host: string;
  port: number;
  allowedHosts?: string[];
  allowedOrigins?: string[];
  allowUnauthenticatedHttp: boolean;
  httpToken?: string;
}

export type HttpOptions = McpOptionsFor<HttpArguments, McpOption>;

export const HTTP_ONLY_OPTION_KEYS: ReadonlyArray<
  Exclude<keyof HttpArguments, 'transport'>
> = [
  'host',
  'port',
  'allowedHosts',
  'allowedOrigins',
  'allowUnauthenticatedHttp',
  'httpToken',
];

export const CONFIG_FILE_ONLY_OPTION_KEYS: readonly ['httpToken'] = [
  'httpToken',
];

function parseIpv6Half(part: string): number[] | undefined {
  if (!part) {
    return [];
  }
  const segments = part.split(':');
  const groups: number[] = [];
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment.includes('.')) {
      if (i !== segments.length - 1 || isIP(segment) !== 4) {
        return undefined;
      }
      const octets = segment
        .split('.')
        .map(octet => Number.parseInt(octet, 10));
      groups.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
    } else {
      const parsed = Number.parseInt(segment, 16);
      if (Number.isNaN(parsed) || parsed < 0 || parsed > 0xffff) {
        return undefined;
      }
      groups.push(parsed);
    }
  }
  return groups;
}

function parseIpv6Groups(address: string): number[] | undefined {
  if (isIP(address) !== 6) {
    return undefined;
  }
  const halves = address.toLowerCase().split('::');
  if (halves.length > 2) {
    return undefined;
  }
  const left = parseIpv6Half(halves[0]);
  if (!left) {
    return undefined;
  }
  if (halves.length === 1) {
    return left.length === 8 ? left : undefined;
  }
  const right = parseIpv6Half(halves[1]);
  if (!right) {
    return undefined;
  }
  const missing = 8 - (left.length + right.length);
  if (missing < 1) {
    return undefined;
  }
  const groups: number[] = [...left];
  for (let i = 0; i < missing; i++) {
    groups.push(0);
  }
  groups.push(...right);
  return groups;
}

function isLoopbackIpv6(address: string): boolean {
  const groups = parseIpv6Groups(address);
  if (!groups) {
    return false;
  }
  const hasZeroPrefix =
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0;
  if (!hasZeroPrefix) {
    return false;
  }
  if (groups[5] === 0 && groups[6] === 0 && groups[7] === 1) {
    return true;
  }
  return groups[5] === 0xffff && groups[6] >> 8 === 127;
}

/**
 * Returns true if `host` refers to a loopback address (`localhost`, IPv4
 * `127.0.0.0/8`, IPv6 `::1`, or IPv4-mapped IPv6 `::ffff:127.0.0.0/8`).
 */
export function isLoopbackHost(host: string): boolean {
  const trimmed = host.trim();
  if (!trimmed) {
    return false;
  }

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return isLoopbackIpv6(trimmed.slice(1, -1));
  }

  const lower = trimmed.toLowerCase();
  const withoutTrailingDot = lower.endsWith('.') ? lower.slice(0, -1) : lower;
  if (withoutTrailingDot === 'localhost') {
    return true;
  }

  const ipVersion = isIP(trimmed);
  if (ipVersion === 4) {
    return trimmed.startsWith('127.');
  }
  if (ipVersion === 6) {
    return isLoopbackIpv6(trimmed);
  }
  return false;
}

export const httpOptions: HttpOptions = {
  transport: {
    type: 'string',
    choices: ['stdio', 'http'],
    default: 'stdio',
    describe:
      'Transport mode for the MCP server. "stdio" (default) communicates over standard input/output. "http" starts a stateless 2026-07-28 MCP HTTP server.',
  },
  host: {
    type: 'string',
    default: DEFAULT_HTTP_HOST,
    describe:
      'Hostname or IP address to bind the HTTP server to when --transport http is set.',
    coerce: (value: string | undefined): string | undefined => {
      if (value === undefined) {
        return;
      }
      const trimmed = value.trim();
      if (!trimmed) {
        throw new Error(
          'Invalid host: expected a non-empty hostname or IP address.',
        );
      }
      return trimmed;
    },
  },
  port: {
    type: 'number',
    default: DEFAULT_HTTP_PORT,
    describe:
      'TCP port to bind the HTTP server to when --transport http is set. Use 0 to let the OS assign an ephemeral port.',
    coerce: (value: number | undefined): number | undefined => {
      if (value === undefined) {
        return;
      }
      if (!Number.isInteger(value) || value < 0 || value > 65535) {
        throw new Error(
          `Invalid port ${value}. Expected an integer between 0 and 65535.`,
        );
      }
      return value;
    },
  },
  allowedHosts: {
    type: 'array',
    string: true,
    describe:
      'Additional hostnames (without ports) allowed in the HTTP Host header when --transport http is set. May be specified more than once.',
  },
  allowedOrigins: {
    type: 'array',
    string: true,
    describe:
      'Additional origin hostnames (without scheme or port) allowed in the HTTP Origin header when --transport http is set. May be specified more than once.',
  },
  allowUnauthenticatedHttp: {
    type: 'boolean',
    default: false,
    describe:
      'Allow binding a non-loopback --host in HTTP mode without a Bearer token. Use with caution.',
  },
  httpToken: {
    type: 'string',
    describe: `Static Bearer token for authenticating HTTP requests. Accepted only in the JSON config file or via the ${HTTP_TOKEN_ENV_VAR} environment variable (not as a CLI flag).`,
    coerce: (value: string | undefined): string | undefined => {
      if (value === undefined) {
        return;
      }
      const trimmed = value.trim();
      if (!trimmed) {
        throw new Error(
          'Invalid httpToken: expected a non-empty Bearer token.',
        );
      }
      return trimmed;
    },
  },
};
