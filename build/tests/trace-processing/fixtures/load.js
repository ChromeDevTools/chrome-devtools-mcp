/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
/**
 * Reads a gzipped JSON file, decompresses it, parses the JSON,
 * and returns a Uint8Array buffer of the parsed data.
 * @param filePath The path to the .json.gz file.
 * @returns A Uint8Array containing the stringified JSON data.
 */
export function loadTraceAsBuffer(filePath) {
    try {
        const compressedData = fs.readFileSync(path.join(import.meta.dirname, 
        // Get back up to the root directory as fixtures aren't moved ito the build/ dir.
        '..', '..', '..', '..', 'tests', 'trace-processing', 'fixtures', filePath));
        const decompressedData = zlib.gunzipSync(compressedData);
        const jsonString = decompressedData.toString('utf-8');
        const jsonObject = JSON.parse(jsonString);
        const finalBuffer = Buffer.from(JSON.stringify(jsonObject));
        const uint8Array = new Uint8Array(finalBuffer);
        return uint8Array;
    }
    catch (error) {
        console.error('Error parsing the file:', error);
        throw error;
    }
}
//# sourceMappingURL=load.js.map