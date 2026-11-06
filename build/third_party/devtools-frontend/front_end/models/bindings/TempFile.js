// Copyright 2013 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { ChunkedFileReader } from './FileUtils.js';
export class TempFile {
    #lastBlob = null;
    #console;
    constructor(console) {
        this.#console = console;
    }
    write(pieces) {
        if (this.#lastBlob) {
            pieces.unshift(this.#lastBlob);
        }
        this.#lastBlob = new Blob(pieces, { type: 'text/plain' });
    }
    read() {
        return this.readRange();
    }
    size() {
        return this.#lastBlob ? this.#lastBlob.size : 0;
    }
    async readRange(startOffset, endOffset) {
        if (!this.#lastBlob) {
            this.#console.error('Attempt to read a temp file that was never written');
            return '';
        }
        const blob = typeof startOffset === 'number' || typeof endOffset === 'number' ?
            this.#lastBlob.slice(startOffset, endOffset) :
            this.#lastBlob;
        try {
            return await blob.text();
        }
        catch (error) {
            this.#console.error('Failed to read from temp file: ' + error.message);
            return null;
        }
    }
    async copyToOutputStream(outputStream, progress) {
        if (!this.#lastBlob) {
            void outputStream.close();
            return null;
        }
        const reader = new ChunkedFileReader(this.#lastBlob, 10 * 1000 * 1000, progress);
        return await reader.read(outputStream).then(success => success ? null : reader.error());
    }
    remove() {
        this.#lastBlob = null;
    }
}
//# sourceMappingURL=TempFile.js.map