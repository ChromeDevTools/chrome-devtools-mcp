/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {readFile, rm, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const projectRoot = process.cwd();

const filesToRemove = [
  'node_modules/chrome-devtools-frontend/package.json',
  'node_modules/chrome-devtools-frontend/front_end/models/trace/lantern/testing',
  'node_modules/chrome-devtools-frontend/front_end/third_party/intl-messageformat/package/package.json',
];

interface FilePatch {
  file: string;
  patches: Array<{search: string; replace: string}>;
}

const filesToPatch: FilePatch[] = [
  {
    file: 'node_modules/chrome-devtools-frontend/front_end/entrypoints/formatter_worker/ESTreeWalker.ts',
    patches: [
      {
        search: 'const walkOrder = WALK_ORDER[node.type];',
        replace: 'const walkOrder = WALK_ORDER[node.type as keyof typeof WALK_ORDER];',
      },
      {
        search: '// @ts-expect-error We are doing type traversal here, but the strings',
        replace: '// @ts-ignore We are doing type traversal here, but the strings',
      },
    ],
  },
  {
    file: 'node_modules/chrome-devtools-frontend/front_end/entrypoints/formatter_worker/JavaScriptFormatter.ts',
    patches: [
      {
        search: '// @ts-expect-error Technically, the acorn Node type is a subclass of Acorn.ESTree.Node.',
        replace: '// @ts-ignore Technically, the acorn Node type is a subclass of Acorn.ESTree.Node.',
      },
      {
        search: '// @ts-expect-error Same reason as above about Acorn types and ESTree types',
        replace: '// @ts-ignore Same reason as above about Acorn types and ESTree types',
      },
      {
        search: '// @ts-expect-error We are doing a subtype check, without properly checking whether',
        replace: '// @ts-ignore We are doing a subtype check, without properly checking whether',
      },
    ],
  },
  {
    file: 'node_modules/chrome-devtools-frontend/front_end/entrypoints/formatter_worker/ScopeParser.ts',
    patches: [
      {
        search: 'node.elements.forEach(item => this.#processNode(item));',
        replace: 'node.elements.forEach((item: Acorn.ESTree.Node) => this.#processNode(item));',
      },
      {
        search: 'node.body.forEach(item => this.#processNode(item));',
        replace: 'node.body.forEach((item: Acorn.ESTree.Node) => this.#processNode(item));',
      },
    ],
  },
];

async function patchFile(filePatch: FilePatch): Promise<void> {
  const fullPath = resolve(projectRoot, filePatch.file);
  let content = await readFile(fullPath, 'utf-8');
  
  for (const patch of filePatch.patches) {
    if (content.includes(patch.search)) {
      content = content.replaceAll(patch.search, patch.replace);
      console.log(`Patched: ${filePatch.file} - replaced "${patch.search.substring(0, 50)}..."`);
    }
  }
  
  await writeFile(fullPath, content, 'utf-8');
}

async function main() {
  console.log('Running prepare script to clean up chrome-devtools-frontend...');
  for (const file of filesToRemove) {
    const fullPath = resolve(projectRoot, file);
    console.log(`Removing: ${file}`);
    try {
      await rm(fullPath, {recursive: true, force: true});
    } catch (error) {
      console.error(`Failed to remove ${file}:`, error);
      process.exit(1);
    }
  }
  
  console.log('Patching chrome-devtools-frontend TypeScript issues...');
  for (const filePatch of filesToPatch) {
    try {
      await patchFile(filePatch);
    } catch (error) {
      console.error(`Failed to patch ${filePatch.file}:`, error);
      process.exit(1);
    }
  }
  
  console.log('Clean up of chrome-devtools-frontend complete.');
}

void main();
