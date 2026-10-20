/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {describe, it} from 'node:test';
import {promisify} from 'node:util';

import {DEFAULT_MAX_NAVIGATION_SAVED} from '../src/collectors/constants.js';

import {createTempDir} from './utils.js';

describe('generate-docs', () => {
  it('documents the default navigation limit for console messages and network requests', async () => {
    using tmp = createTempDir();
    const docsPath = path.join(tmp.path, 'docs');
    await fs.mkdir(docsPath);
    await fs.writeFile(
      path.join(docsPath, 'configuration.md'),
      '<!-- BEGIN AUTO GENERATED OPTIONS -->\n<!-- END AUTO GENERATED OPTIONS -->\n',
    );

    await promisify(execFile)(
      process.execPath,
      [path.resolve(import.meta.dirname, '../../scripts/generate-docs.ts')],
      {cwd: tmp.path},
    );

    const reference = await fs.readFile(
      path.join(docsPath, 'tool-reference.md'),
      'utf8',
    );
    for (const resource of ['messages', 'requests']) {
      assert.ok(
        reference.includes(
          `Set to true to return the preserved ${resource} over the last ${DEFAULT_MAX_NAVIGATION_SAVED} navigations.`,
        ),
        `The ${resource} description must include the default navigation limit`,
      );
    }
  });
});
