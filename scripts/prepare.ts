/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {execSync} from 'node:child_process';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const projectRoot = process.cwd();

/**
 * Removes the conflicting global HTMLElementEventMap declaration from
 * @paulirish/trace_engine/models/trace/ModelImpl.d.ts to avoid TS2717 error
 * when both devtools-frontend and @paulirish/trace_engine declare
 * the same property.
 */
function removeConflictingGlobalDeclaration(): void {
  const filePath = resolve(
    projectRoot,
    'node_modules/@paulirish/trace_engine/models/trace/ModelImpl.d.ts',
  );
  if (!existsSync(filePath)) {
    return;
  }
  console.log(
    'Removing conflicting global declaration from @paulirish/trace_engine...',
  );
  const content = readFileSync(filePath, 'utf-8');
  // Remove the declare global block using regex
  // Matches: declare global { ... interface HTMLElementEventMap { ... } ... }
  const newContent = content.replace(
    /declare global\s*\{\s*interface HTMLElementEventMap\s*\{[^}]*\[ModelUpdateEvent\.eventName\]:\s*ModelUpdateEvent;\s*\}\s*\}/s,
    '',
  );
  writeFileSync(filePath, newContent, 'utf-8');
  console.log('Successfully removed conflicting global declaration.');
}

function ensureSubmodule(): void {
  const devtoolsFrontendDir = resolve(
    projectRoot,
    'third_party',
    'devtools-frontend',
  );
  const mcpEntry = resolve(devtoolsFrontendDir, 'mcp', 'mcp.ts');

  if (existsSync(mcpEntry)) {
    console.log('devtools-frontend submodule is ready.');
    return;
  }

  console.log(
    'Initializing devtools-frontend submodule with sparse checkout...',
  );
  try {
    // 1. Clone only the tree structure of the default branch (no blobs)
    execSync(
      'git clone --no-checkout --depth 1 --filter=blob:none https://github.com/ChromeDevTools/devtools-frontend.git third_party/devtools-frontend',
      {
        cwd: projectRoot,
        stdio: 'inherit',
      },
    );

    // 2. Set the sparse checkout configuration
    execSync(
      'git sparse-checkout set --no-cone "/*" "!/*/" "/front_end/" "!/front_end/panels/" "!/front_end/ui/" "/mcp/" "/extension-api/"',
      {
        cwd: devtoolsFrontendDir,
        stdio: 'inherit',
      },
    );

    // 3. Move the submodule's .git directory to the superproject's .git/modules
    execSync('git submodule absorbgitdirs third_party/devtools-frontend', {
      cwd: projectRoot,
      stdio: 'inherit',
    });

    // 4. Update the submodule to the correct commit (this fetches the commit and only downloads the blobs for the sparse checkout)
    execSync(
      'git submodule update --force --checkout third_party/devtools-frontend',
      {
        cwd: projectRoot,
        stdio: 'inherit',
      },
    );
  } catch (error) {
    console.error('Failed to initialize devtools-frontend:', error);
  }
}

function main(): void {
  ensureSubmodule();
  removeConflictingGlobalDeclaration();
}

main();
