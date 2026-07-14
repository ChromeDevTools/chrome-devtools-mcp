/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';
import {pathToFileURL} from 'node:url';

import {withMcpContext} from './utils.js';

describe('McpContext Roots', () => {
  it('should allow access to os.tmpdir() even if roots are empty', async () => {
    await withMcpContext(async (_response, context) => {
      context.setRoots([]);
      const tmpPath = path.join(os.tmpdir(), 'test-file.txt');
      // This should not throw
      await context.validatePath(tmpPath);
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
      await context.validatePath(tmpPath);
    });
  });

  it('should allow access to os.tmpdir() when other roots are set', async () => {
    await withMcpContext(async (_response, context) => {
      const otherRoot = path.resolve(
        os.tmpdir(),
        'other_workspace_root_for_test',
      );
      await fs.mkdir(otherRoot, {recursive: true});
      try {
        context.setRoots([{uri: pathToFileURL(otherRoot).href, name: 'other'}]);

        const tmpPath = path.join(os.tmpdir(), 'test-file.txt');
        // This should not throw.
        await context.validatePath(tmpPath);

        // Other root should also be allowed.
        await context.validatePath(path.join(otherRoot, 'file.txt'));

        // Outside should still be denied. Use a path that is definitely not a root or temp dir.
        const outsidePath = path.resolve(
          os.homedir(),
          'a_very_unlikely_path_name_12345',
        );
        await assert.rejects(
          context.validatePath(outsidePath),
          /Access denied/,
        );
      } finally {
        await fs.rm(otherRoot, {recursive: true, force: true});
      }
    });
  });

  it('should enforce extensions and validate the output path', async () => {
    await withMcpContext(async (_response, context) => {
      const workspacePath = await fs.mkdtemp(
        path.join(os.tmpdir(), 'workspace-root-'),
      );
      try {
        context.setRoots([
          {uri: pathToFileURL(workspacePath).href, name: 'workspace'},
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
            path.join(workspacePath, testCase.filePath),
            testCase.extension,
          );

          assert.strictEqual(
            resolvedPath,
            path.join(workspacePath, testCase.expected),
          );
        }
      } finally {
        await fs.rm(workspacePath, {recursive: true, force: true});
      }
    });
  });

  it('should deny extension-enforced paths outside roots', async () => {
    await withMcpContext(async (_response, context) => {
      const workspacePath = await fs.mkdtemp(
        path.join(os.tmpdir(), 'workspace-root-'),
      );
      try {
        context.setRoots([
          {uri: pathToFileURL(workspacePath).href, name: 'workspace'},
        ]);

        await assert.rejects(
          context.ensureExtension(
            path.join(os.homedir(), 'outside-root-result'),
            '.json',
          ),
          /Access denied/,
        );
      } finally {
        await fs.rm(workspacePath, {recursive: true, force: true});
      }
    });
  });
});
