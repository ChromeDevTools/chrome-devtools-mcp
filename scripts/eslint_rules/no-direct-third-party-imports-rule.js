/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ESLint rule that prevents value (non-type) imports of third-party packages
 * that should go through the `src/third_party/index.ts` barrel file.
 *
 * Type-only imports are allowed because they are erased at compile time and
 * do not affect the bundle.
 *
 * This catches a class of bugs where a direct import works in development
 * (because devDependencies are installed) but fails once the package is
 * bundled and published via `npm pack`.
 *
 * The list of bundled packages is derived dynamically by scanning
 * `src/third_party/*.ts` for import/export statements at ESLint load time.
 *
 * See https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1123
 */

import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

const THIRD_PARTY_DIR = join(
  import.meta.dirname,
  '..',
  '..',
  'src',
  'third_party',
);

/**
 * Parse all .ts files in src/third_party/ and extract the bare package names
 * from import/export statements. Relative imports and node_modules paths
 * (used for chrome-devtools-frontend) are skipped.
 */
function discoverBundledPackages() {
  const packages = new Set();
  // Match `from 'pkg'` (may appear on a different line than `import`)
  // and side-effect imports like `import 'pkg'`.
  const fromRe = /from\s+['"]([^'"]+)['"]/g;
  const sideEffectRe = /^import\s+['"]([^'"]+)['"]/gm;

  let files;
  try {
    files = readdirSync(THIRD_PARTY_DIR).filter(f => f.endsWith('.ts'));
  } catch {
    return [];
  }

  for (const file of files) {
    const content = readFileSync(join(THIRD_PARTY_DIR, file), 'utf8');
    for (const re of [fromRe, sideEffectRe]) {
      re.lastIndex = 0;
      let match;
      while ((match = re.exec(content)) !== null) {
        const source = match[1];
        // Skip relative imports and node_modules paths.
        if (source.startsWith('.') || source.startsWith('/')) {
          continue;
        }
        // Extract the bare package name (handle scoped packages like @foo/bar).
        const parts = source.split('/');
        const pkg = source.startsWith('@')
          ? parts.slice(0, 2).join('/')
          : parts[0];
        packages.add(pkg);
      }
    }
  }

  return [...packages];
}

const THIRD_PARTY_PACKAGES = discoverBundledPackages();

/** Matches any import source that starts with one of the restricted packages. */
function isRestrictedSource(source) {
  return THIRD_PARTY_PACKAGES.some(
    pkg => source === pkg || source.startsWith(pkg + '/'),
  );
}

/** Returns true when the file is inside src/third_party/. */
function isThirdPartyBarrel(filename) {
  const normalized = filename.replace(/\\/g, '/');
  return normalized.includes('/src/third_party/');
}

export default {
  name: 'no-direct-third-party-imports',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow value imports of bundled third-party packages outside of src/third_party/',
    },
    schema: [],
    messages: {
      noDirectImport:
        'Do not import "{{source}}" directly. Use the re-export from "src/third_party/index.js" instead so the import survives bundling. (Type-only imports are fine.)',
    },
  },
  defaultOptions: [],
  create(context) {
    const filename = context.filename;
    if (isThirdPartyBarrel(filename)) {
      return {};
    }

    return {
      ImportDeclaration(node) {
        // `import type { Foo } from '...'` is always safe.
        if (node.importKind === 'type') {
          return;
        }

        const source = node.source.value;
        if (!isRestrictedSource(source)) {
          return;
        }

        // If every specifier is `type`, the import is still safe.
        // e.g. `import { type Foo, type Bar } from '...'`
        const hasValueSpecifier = node.specifiers.some(
          s => s.type !== 'ImportSpecifier' || s.importKind !== 'type',
        );

        if (!hasValueSpecifier) {
          return;
        }

        context.report({
          node,
          messageId: 'noDirectImport',
          data: {source},
        });
      },
    };
  },
};
