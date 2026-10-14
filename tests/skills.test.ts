/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import {describe, it} from 'node:test';

import {withMcpContext} from './utils.js';

describe('skills lighthouse_audit output directory', () => {
  it('does not reference denied /tmp/lh-report in skills', async () => {
    const a11ySkill = await fs.readFile(
      path.resolve('skills/a11y-debugging/SKILL.md'),
      'utf8',
    );
    const cookieSkill = await fs.readFile(
      path.resolve('skills/cookie-debugging/SKILL.md'),
      'utf8',
    );

    assert.doesNotMatch(
      a11ySkill,
      /\/tmp\/lh-report/,
      'skills/a11y-debugging/SKILL.md should not reference /tmp/lh-report',
    );
    assert.doesNotMatch(
      cookieSkill,
      /\/tmp\/lh-report/,
      'skills/cookie-debugging/SKILL.md should not reference /tmp/lh-report',
    );
  });

  it('rejects /tmp/lh-report on macOS under default roots and allows omitted outputDirPath', async () => {
    await withMcpContext(async (_response, context) => {
      if (process.platform === 'darwin') {
        await assert.rejects(
          context.validatePath('/tmp/lh-report'),
          /Access denied: path "\/tmp\/lh-report".*is not within any of the configured workspace roots/,
        );
      }
      const {filepath} = await context.saveTemporaryFile(
        new Uint8Array(),
        'report.json',
      );
      const validated = await context.validatePath(filepath);
      assert.strictEqual(typeof validated, 'string');
    });
  });
});
