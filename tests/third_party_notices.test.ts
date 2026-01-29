/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, it} from 'node:test';

describe('THIRD_PARTY_NOTICES', () => {
  it('matches snapshot if exists', t => {
    const noticesPath = path.join(
      process.cwd(),
      'build/src/third_party/THIRD_PARTY_NOTICES',
    );
    if (fs.existsSync(noticesPath)) {
      const content = fs.readFileSync(noticesPath, 'utf-8');
      t.assert.snapshot?.(content);
    }
  });
});
