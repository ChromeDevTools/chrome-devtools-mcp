
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {execSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

// Resolve the vscode-devtools-mcp directory from this script's location so
// `pnpm run build` works regardless of the caller's process.cwd().
const scriptDir = dirname(fileURLToPath(import.meta.url));
const serverDir = dirname(scriptDir);

const entryUrl = new URL('../build/src/index.js', import.meta.url);
if (!existsSync(entryUrl)) {
	execSync('pnpm run build', {stdio: 'inherit', cwd: serverDir});
}

await import(entryUrl.toString());
