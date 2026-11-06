/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
const BUILD_SRC = path.resolve(import.meta.dirname, '..', 'src');
const CLI_ENTRY = path.join(BUILD_SRC, 'bin', 'chrome-devtools.js');
const FULL_BUNDLE = path.join(BUILD_SRC, 'third_party', 'index.js');
const IMPORT_RE = /\b(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;
/**
 * Walks the static and dynamic relative imports of the built JS files and
 * returns the first path from `entry` to `target`, or undefined.
 */
function findImportPath(entry, target) {
    const parents = new Map([[entry, undefined]]);
    const queue = [entry];
    while (queue.length > 0) {
        const file = queue.shift();
        if (file === undefined) {
            break;
        }
        if (file === target) {
            const chain = [];
            for (let f = file; f; f = parents.get(f)) {
                chain.unshift(path.relative(BUILD_SRC, f));
            }
            return chain;
        }
        if (!file.startsWith(BUILD_SRC)) {
            continue;
        }
        const source = readFileSync(file, 'utf8');
        for (const match of source.matchAll(IMPORT_RE)) {
            const next = path.resolve(path.dirname(file), match[1]);
            if (!parents.has(next)) {
                parents.set(next, file);
                queue.push(next);
            }
        }
    }
    return undefined;
}
describe('chrome-devtools CLI imports', () => {
    it('does not load the full third-party bundle', () => {
        const chain = findImportPath(CLI_ENTRY, FULL_BUNDLE);
        assert.strictEqual(chain, undefined, `The CLI must import from third_party/cli.js only. Import chain:\n  ${chain?.join('\n  -> ')}`);
    });
});
//# sourceMappingURL=cli-imports.test.js.map