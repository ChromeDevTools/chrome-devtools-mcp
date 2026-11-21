/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import path from 'node:path';
import {describe, it} from 'node:test';

import {zod} from '../src/third_party/index.js';

import {BUILD_SRC, findImportPath} from './importGraph.js';

const CLI_ENTRY = path.join(BUILD_SRC, 'bin', 'chrome-devtools.js');
const FULL_BUNDLE = path.join(BUILD_SRC, 'third_party', 'index.js');

describe('chrome-devtools CLI imports', () => {
  it('does not load the full third-party bundle', () => {
    const chain = findImportPath(CLI_ENTRY, FULL_BUNDLE, {
      includeDynamicImports: true,
    });
    assert.strictEqual(
      chain,
      undefined,
      `The CLI must import from third_party/cli.js only. Import chain:\n  ${chain?.join('\n  -> ')}`,
    );
  });

  it('does not re-export unused zod locales from the third-party barrel', () => {
    assert.strictEqual('locales' in zod, false);
  });
});
