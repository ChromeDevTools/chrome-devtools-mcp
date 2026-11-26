/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import path from 'node:path';
import {describe, it} from 'node:test';

import {
  CLI_SCRIPT_NAME_ENV,
  formatCliUpdateMessage,
  formatMcpUpdateMessage,
  formatMissingPeerDependencyError,
  MCP_SCRIPT_NAME_ENV,
  resolveCliScriptName,
  resolveMcpScriptName,
} from '../../src/utils/scriptName.js';

describe('scriptName', () => {
  describe('resolveMcpScriptName', () => {
    it('uses trimmed CHROME_DEVTOOLS_MCP_SCRIPT_NAME over npx', () => {
      assert.strictEqual(
        resolveMcpScriptName(
          [
            '/usr/bin/node',
            '/home/user/.npm/_npx/1234/node_modules/.bin/chrome-devtools-mcp',
          ],
          {
            [MCP_SCRIPT_NAME_ENV]: '  custom-mcp  ',
            npm_lifecycle_event: 'npx',
          },
        ),
        'custom-mcp',
      );
    });

    it('ignores whitespace-only CHROME_DEVTOOLS_MCP_SCRIPT_NAME', () => {
      assert.strictEqual(
        resolveMcpScriptName(['node', '/usr/local/bin/chrome-devtools-mcp'], {
          [MCP_SCRIPT_NAME_ENV]: '   ',
        }),
        'chrome-devtools-mcp',
      );
      assert.strictEqual(
        resolveMcpScriptName(['node', '/project/.bin/chrome-devtools-mcp'], {
          [MCP_SCRIPT_NAME_ENV]: '   ',
          npm_lifecycle_event: 'npx',
        }),
        'npx chrome-devtools-mcp@latest',
      );
    });

    it('detects npx via npm_lifecycle_event', () => {
      assert.strictEqual(
        resolveMcpScriptName(['node', '/project/.bin/chrome-devtools-mcp'], {
          npm_lifecycle_event: 'npx',
        }),
        'npx chrome-devtools-mcp@latest',
      );
    });

    it('detects npx via POSIX and Windows _npx paths', () => {
      assert.strictEqual(
        resolveMcpScriptName(
          [
            '/usr/bin/node',
            '/home/user/.npm/_npx/1234/node_modules/.bin/chrome-devtools-mcp',
          ],
          {},
        ),
        'npx chrome-devtools-mcp@latest',
      );
      assert.strictEqual(
        resolveMcpScriptName(
          [
            'C:\\Program Files\\nodejs\\node.exe',
            path.win32.join(
              'C:\\Users\\user\\AppData\\Local\\npm-cache',
              '_npx',
              '1234',
              'node_modules',
              'chrome-devtools-mcp',
              'out',
              'Default',
              'gen',
              'src',
              'bin',
              'chrome-devtools-mcp.js',
            ),
          ],
          {},
        ),
        'npx chrome-devtools-mcp@latest',
      );
    });

    it('defaults to chrome-devtools-mcp otherwise', () => {
      assert.strictEqual(
        resolveMcpScriptName(
          ['node', '/usr/local/bin/chrome-devtools-mcp'],
          {},
        ),
        'chrome-devtools-mcp',
      );
      assert.strictEqual(
        resolveMcpScriptName(['node', '/project/.bin/chrome-devtools-mcp'], {
          npm_lifecycle_event: 'start',
        }),
        'chrome-devtools-mcp',
      );
      assert.strictEqual(
        resolveMcpScriptName(['node'], {}),
        'chrome-devtools-mcp',
      );
    });
  });

  describe('resolveCliScriptName', () => {
    it('defaults to chrome-devtools', () => {
      assert.strictEqual(resolveCliScriptName({}), 'chrome-devtools');
    });

    it('uses trimmed CHROME_DEVTOOLS_MCP_CLI_SCRIPT_NAME when set', () => {
      assert.strictEqual(
        resolveCliScriptName({[CLI_SCRIPT_NAME_ENV]: '  custom-devtools  '}),
        'custom-devtools',
      );
    });

    it('ignores whitespace-only CHROME_DEVTOOLS_MCP_CLI_SCRIPT_NAME', () => {
      assert.strictEqual(
        resolveCliScriptName({[CLI_SCRIPT_NAME_ENV]: ' \t\n '}),
        'chrome-devtools',
      );
    });
  });

  describe('formatMissingPeerDependencyError', () => {
    const formats: Array<{
      format: 'toon' | 'gcf';
      packageName: string;
    }> = [
      {format: 'toon', packageName: '@toon-format/toon'},
      {format: 'gcf', packageName: '@blackwell-systems/gcf'},
    ];

    for (const {format, packageName} of formats) {
      for (const envVar of [MCP_SCRIPT_NAME_ENV, CLI_SCRIPT_NAME_ENV]) {
        it(`omits npm and npx for ${format} when ${envVar} is set`, () => {
          const message = formatMissingPeerDependencyError(
            format,
            packageName,
            {
              argv: ['node', '/home/user/.npm/_npx/123/chrome-devtools-mcp.js'],
              env: {[envVar]: 'custom-wrapper', npm_lifecycle_event: 'npx'},
            },
          );
          assert.strictEqual(
            message,
            `The \`${packageName}\` package is required to use ` +
              `--experimentalDataFormat=${format}. ` +
              'Make sure the peer dependency is installed.',
          );
          assert.doesNotMatch(message, /\bnpx\b|\bnpm\b/);
        });
      }

      it(`prints npx install command for ${format} under npx`, () => {
        const message = formatMissingPeerDependencyError(format, packageName, {
          argv: ['node', '/project/.bin/chrome-devtools-mcp'],
          env: {npm_lifecycle_event: 'npx'},
        });
        assert.match(
          message,
          new RegExp(
            `- For npx: npx --package chrome-devtools-mcp@latest ` +
              `--package ${packageName}@latest chrome-devtools-mcp ` +
              `--experimentalDataFormat=${format}$`,
          ),
        );
        assert.doesNotMatch(message, /- For npm:/);
      });

      it(`prints npm install command for ${format} by default`, () => {
        const message = formatMissingPeerDependencyError(format, packageName, {
          argv: ['node', '/usr/local/bin/chrome-devtools-mcp'],
          env: {},
        });
        assert.match(
          message,
          new RegExp(
            `- For npm: npm install ${packageName} ` +
              '\\(add -g if installed globally\\)$',
          ),
        );
        assert.doesNotMatch(message, /- For npx:/);
      });
    }
  });

  describe('formatMcpUpdateMessage', () => {
    it('returns npm update command by default', () => {
      assert.strictEqual(
        formatMcpUpdateMessage({}),
        'Run `npm install chrome-devtools-mcp@latest` to update.',
      );
      assert.strictEqual(
        formatMcpUpdateMessage({[MCP_SCRIPT_NAME_ENV]: '   '}),
        'Run `npm install chrome-devtools-mcp@latest` to update.',
      );
    });

    it('omits npm install when CHROME_DEVTOOLS_MCP_SCRIPT_NAME is set', () => {
      const message = formatMcpUpdateMessage({
        [MCP_SCRIPT_NAME_ENV]: 'custom-mcp',
      });
      assert.strictEqual(
        message,
        'Update your chrome-devtools-mcp installation to the latest version.',
      );
      assert.doesNotMatch(message, /npm install/);
    });
  });

  describe('formatCliUpdateMessage', () => {
    it('returns npm update command by default', () => {
      assert.strictEqual(
        formatCliUpdateMessage({}),
        'Run `npm install -g chrome-devtools-mcp@latest` and ' +
          '`chrome-devtools start` to update and restart the daemon.',
      );
      assert.strictEqual(
        formatCliUpdateMessage({[CLI_SCRIPT_NAME_ENV]: '   '}),
        'Run `npm install -g chrome-devtools-mcp@latest` and ' +
          '`chrome-devtools start` to update and restart the daemon.',
      );
    });

    it('uses trimmed override and omits npm install when set', () => {
      const message = formatCliUpdateMessage({
        [CLI_SCRIPT_NAME_ENV]: '  custom-devtools  ',
      });
      assert.strictEqual(
        message,
        'Update chrome-devtools-mcp and run `custom-devtools start` to ' +
          'restart the daemon.',
      );
      assert.doesNotMatch(message, /npm install/);
    });
  });
});
