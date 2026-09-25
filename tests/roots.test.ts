/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';
import {pathToFileURL} from 'node:url';

import {resolveCanonicalPath} from '../src/utils/files.js';

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

  it('should allow access below a root that already ends with a separator', async () => {
    await withMcpContext(async (_response, context) => {
      // The filesystem root is `/` on POSIX and `C:\` on Windows.
      const filesystemRoot = path.parse(process.cwd()).root;
      context.setRoots([
        {uri: pathToFileURL(filesystemRoot).href, name: 'filesystem-root'},
      ]);

      const outsidePath = path.resolve(
        os.homedir(),
        'a_very_unlikely_path_name_filesystem_root',
      );
      const resolved = await context.validatePath(outsidePath);
      assert.strictEqual(resolved, await resolveCanonicalPath(outsidePath));
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
