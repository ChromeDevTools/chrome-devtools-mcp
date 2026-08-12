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

  console.log('Initializing devtools-frontend submodule...');
  try {
    execSync('git submodule update --init --depth 1', {
      cwd: projectRoot,
      stdio: 'inherit',
    });
  } catch (submoduleError) {
    console.warn('git submodule update failed:', submoduleError);
  }

  if (!existsSync(mcpEntry)) {
    console.log('Fetching devtools-frontend...');
    try {
      execSync(
        'git clone --depth 1 https://github.com/ChromeDevTools/devtools-frontend.git third_party/devtools-frontend',
        {
          cwd: projectRoot,
          stdio: 'inherit',
        },
      );
    } catch (cloneError) {
      console.error('Failed to clone devtools-frontend:', cloneError);
    }
  }
}

function main(): void {
  ensureSubmodule();
  removeConflictingGlobalDeclaration();
}

main();
