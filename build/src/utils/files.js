/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
export async function getTempFilePath(filename) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'chrome-devtools-mcp-'));
    const filepath = path.join(dir, filename);
    return filepath;
}
export async function resolveCanonicalPath(filePath) {
    const absolutePath = path.resolve(filePath);
    try {
        // Get the true canonical path, resolving all symlinks.
        return await fs.realpath(absolutePath);
    }
    catch (err) {
        if (err &&
            typeof err === 'object' &&
            'code' in err &&
            err.code === 'ENOENT') {
            // Find the nearest existing ancestor directory on the filesystem.
            let current = absolutePath;
            const missingSegments = [];
            while (true) {
                const parent = path.dirname(current);
                if (parent === current) {
                    // Reached root directory but still couldn't resolve anything.
                    throw err;
                }
                try {
                    const canonicalParent = await fs.realpath(parent);
                    return path.join(canonicalParent, path.basename(current), ...missingSegments);
                }
                catch (parentErr) {
                    if (parentErr &&
                        typeof parentErr === 'object' &&
                        'code' in parentErr &&
                        parentErr.code === 'ENOENT') {
                        missingSegments.unshift(path.basename(current));
                        current = parent;
                    }
                    else {
                        throw parentErr;
                    }
                }
            }
        }
        else {
            throw err;
        }
    }
}
//# sourceMappingURL=files.js.map