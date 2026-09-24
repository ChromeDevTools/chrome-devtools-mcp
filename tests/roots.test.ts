/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, it} from 'node:test';
import {pathToFileURL} from 'node:url';

import sinon from 'sinon';

import {McpContext} from '../src/McpContext.js';
import {resolveCanonicalPath} from '../src/utils/files.js';

import {createMockPuppeteerBrowser} from './mocks.js';
import {createTempDir, withMcpContext} from './utils.js';

describe('McpContext Roots', () => {
  it('should allow access to os.tmpdir() even if roots are empty', async () => {
    await withMcpContext(async (_response, context) => {
      context.setRoots([]);
      const tmpPath = path.join(os.tmpdir(), 'test-file.txt');
      const resolved = await context.validatePath(tmpPath);
      assert.strictEqual(resolved, await resolveCanonicalPath(tmpPath));
    });
  });

  it('should deny paths outside the temp directory when the client never negotiates roots', async () => {
    await withMcpContext(async (_response, context) => {
      // setRoots() is intentionally never called here, matching a client
      // that omits the optional MCP `roots` capability during initialize.
      const outsidePath = path.resolve(
        os.homedir(),
        'a_very_unlikely_path_name_never_negotiated_roots',
      );
      await assert.rejects(context.validatePath(outsidePath), /Access denied/);

      const tmpPath = path.join(os.tmpdir(), 'test-file.txt');
      // The temp directory must remain reachable even with no negotiated
      // roots, matching the existing "empty roots" behavior above.
      const resolved = await context.validatePath(tmpPath);
      assert.strictEqual(resolved, await resolveCanonicalPath(tmpPath));
    });
  });

  it('should allow access to os.tmpdir() when other roots are set', async () => {
    using otherRoot = createTempDir('other_workspace_root_for_test-');
    await withMcpContext(async (_response, context) => {
      context.setRoots([
        {uri: pathToFileURL(otherRoot.path).href, name: 'other'},
      ]);

      const tmpPath = path.join(os.tmpdir(), 'test-file.txt');
      const resolvedTmp = await context.validatePath(tmpPath);
      assert.strictEqual(resolvedTmp, await resolveCanonicalPath(tmpPath));

      // Other root should also be allowed.
      const otherFile = path.join(otherRoot.path, 'file.txt');
      const resolvedOther = await context.validatePath(otherFile);
      assert.strictEqual(resolvedOther, await resolveCanonicalPath(otherFile));

      // Outside should still be denied. Use a path that is definitely not a root or temp dir.
      const outsidePath = path.resolve(
        os.homedir(),
        'a_very_unlikely_path_name_12345',
      );
      await assert.rejects(context.validatePath(outsidePath), /Access denied/);
    });
  });

  it('should enforce extensions and validate the output path', async () => {
    using workspace = createTempDir('workspace-root-');
    await withMcpContext(async (_response, context) => {
      context.setRoots([
        {uri: pathToFileURL(workspace.path).href, name: 'workspace'},
      ]);

      const testCases: Array<{
        filePath: string;
        extension: '.json' | '.txt' | '.png' | '.zip';
        expected: string;
      }> = [
        {
          filePath: 'result',
          extension: '.json',
          expected: 'result.json',
        },
        {
          filePath: 'result.jpg',
          extension: '.txt',
          expected: 'result.txt',
        },
        {
          filePath: 'nested/result.jpg',
          extension: '.png',
          expected: 'nested/result.png',
        },
        {
          filePath: '.bashrc',
          extension: '.txt',
          expected: '.bashrc.txt',
        },
        {
          filePath: 'file.tar.gz',
          extension: '.zip',
          expected: 'file.tar.zip',
        },
      ];

      for (const testCase of testCases) {
        const resolvedPath = await context.ensureExtension(
          path.join(workspace.path, testCase.filePath),
          testCase.extension,
        );

        assert.strictEqual(
          resolvedPath,
          await resolveCanonicalPath(
            path.join(workspace.path, testCase.expected),
          ),
        );
      }
    });
  });

  it('should deny extension-enforced paths outside roots', async () => {
    using workspace = createTempDir('workspace-root-');
    await withMcpContext(async (_response, context) => {
      context.setRoots([
        {uri: pathToFileURL(workspace.path).href, name: 'workspace'},
      ]);

      await assert.rejects(
        context.ensureExtension(
          path.join(os.homedir(), 'outside-root-result'),
          '.json',
        ),
        /Access denied/,
      );
    });
  });
});

describe('McpContext path validation logging', () => {
  afterEach(() => sinon.restore());

  async function createContext(): Promise<McpContext> {
    const browser = createMockPuppeteerBrowser();
    browser.targets.returns([]);
    return await McpContext.from(browser, undefined, {
      experimentalDevToolsDebugging: false,
      performanceCrux: false,
    });
  }

  it('escapes the file path when it cannot be resolved', async () => {
    const context = await createContext();
    const filePath = path.join(
      os.tmpdir(),
      'file.txt',
      'x\n[MCP Context] injected line',
    );
    const errMsg = `ENOTDIR: not a directory, realpath '${filePath}'`;
    sinon
      .stub(fs, 'realpath')
      .rejects(Object.assign(new Error(errMsg), {code: 'ENOTDIR'}));
    const errorStub = sinon.stub(console, 'error');

    await assert.rejects(context.validatePath(filePath), /Access denied/);

    sinon.assert.calledOnceWithExactly(
      errorStub,
      `[MCP Context] Error resolving real path for ${JSON.stringify(filePath)}: ${JSON.stringify(errMsg)}`,
    );
  });

  it('escapes the root URI when a root cannot be resolved', async () => {
    const context = await createContext();
    const uri = 'file:///nonexistent-root\n[MCP Context] injected line';
    context.setRoots([{uri, name: 'unresolvable'}]);
    const warnStub = sinon.stub(console, 'warn');

    await context.validatePath(path.join(os.tmpdir(), 'test-file.txt'));

    sinon.assert.calledOnceWithMatch(
      warnStub,
      sinon.match(
        (message: string) =>
          message.startsWith(
            `[MCP Context] Could not resolve configured root ${JSON.stringify(uri)}: "`,
          ) && !message.includes('\n'),
      ),
    );
  });
});
