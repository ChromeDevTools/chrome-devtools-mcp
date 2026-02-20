/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {execSync} from 'node:child_process';

// Checks that the select build files are present using `npm publish --dry-run`.
function verifyPackageContents() {
  try {
    const output = execSync('npm publish --dry-run --json --silent', {
      encoding: 'utf8',
    });
    // skip non-JSON output from prepare.
    const data = JSON.parse(output.substring(output.indexOf('{')));
    const files = data.files.map(f => f.path);
    // Check some important files.
    const requiredPaths = [
      'build/src/index.js',
      'build/src/third_party/index.js',
    ];
    for (const requiredPath of requiredPaths) {
      const hasBuildFolder = files.some(path => path.startsWith(requiredPath));
      if (!hasBuildFolder) {
        console.error(
          `Assertion Failed: "${requiredPath}" not found in tarball.`,
        );
        process.exit(1);
      }
    }
    console.log(
      `npm publish --dry-run contained ${JSON.stringify(requiredPaths)}`,
    );
  } catch (err) {
    console.error('failed to parse npm publish output', err);
    process.exit(1);
  }
}

verifyPackageContents();
