// Copyright 2012 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as TextUtils from '../../core/text_utils/text_utils.js';
import * as Workspace from '../workspace/workspace.js';
export class ChunkedFileReader {
    #file;
    #fileSize;
    #loadedSize;
    #streamReader;
    #chunkSize;
    #chunkTransferredCallback;
    #decoder = new TextDecoder();
    #isCanceled;
    #error;
    #transferFinished;
    #output;
    constructor(file, chunkSize, chunkTransferredCallback) {
        this.#file = file;
        this.#fileSize = file.size;
        this.#loadedSize = 0;
        this.#chunkSize = (chunkSize) ? chunkSize : Number.MAX_VALUE;
        this.#chunkTransferredCallback = chunkTransferredCallback;
        this.#isCanceled = false;
        this.#error = null;
        this.#streamReader = null;
    }
    async read(output) {
        if (this.#chunkTransferredCallback) {
            this.#chunkTransferredCallback(this);
        }
        if (this.#file?.type.endsWith('gzip')) {
            const fileStream = this.#file.stream();
            const stream = Common.Gzip.decompressStream(fileStream);
            this.#streamReader = stream.getReader();
        }
        this.#output = output;
        void this.loadChunk();
        return await new Promise(resolve => {
            this.#transferFinished = resolve;
        });
    }
    cancel() {
        this.#isCanceled = true;
    }
    loadedSize() {
        return this.#loadedSize;
    }
    fileSize() {
        return this.#fileSize;
    }
    fileName() {
        if (!this.#file) {
            return '';
        }
        return this.#file.name;
    }
    error() {
        return this.#error;
    }
    async decodeChunkBuffer(buffer, endOfFile) {
        if (!this.#output) {
            return;
        }
        const decodedString = this.#decoder.decode(buffer, { stream: !endOfFile });
        await this.#output.write(decodedString, endOfFile);
        if (this.#isCanceled) {
            return;
        }
        if (this.#chunkTransferredCallback) {
            this.#chunkTransferredCallback(this);
        }
        if (endOfFile) {
            void this.finishRead();
            return;
        }
        void this.loadChunk();
    }
    async finishRead() {
        if (!this.#output) {
            return;
        }
        this.#file = null;
        await this.#output.close();
        this.#transferFinished(!this.#error);
    }
    async loadChunk() {
        if (!this.#output || !this.#file) {
            return;
        }
        if (this.#streamReader) {
            const { value, done } = await this.#streamReader.read();
            if (done || !value) {
                // Write empty string to inform of file end
                await this.#output.write('', true);
                return await this.finishRead();
            }
            void this.decodeChunkBuffer(value.buffer, false);
            return;
        }
        const chunkStart = this.#loadedSize;
        const chunkEnd = Math.min(this.#fileSize, chunkStart + this.#chunkSize);
        const nextPart = this.#file.slice(chunkStart, chunkEnd);
        try {
            const buffer = await nextPart.arrayBuffer();
            if (this.#isCanceled) {
                return;
            }
            this.#loadedSize += buffer.byteLength;
            const endOfFile = this.#loadedSize === this.#fileSize;
            void this.decodeChunkBuffer(buffer, endOfFile);
        }
        catch (error) {
            this.#error = error;
            this.#transferFinished(false);
        }
    }
}
export class FileOutputStream {
    #fileManager;
    #writeCallbacks;
    #fileName;
    #closed;
    constructor(fileManager) {
        this.#fileManager = fileManager;
        this.#writeCallbacks = [];
    }
    async open(fileName) {
        this.#closed = false;
        this.#writeCallbacks = [];
        this.#fileName = fileName;
        const saveResponse = await this.#fileManager.save(this.#fileName, TextUtils.ContentData.EMPTY_TEXT_CONTENT_DATA, 
        /* forceSaveAs=*/ true);
        if (saveResponse) {
            this.#fileManager.addEventListener("AppendedToURL" /* Workspace.FileManager.Events.APPENDED_TO_URL */, this.onAppendDone, this);
        }
        return Boolean(saveResponse);
    }
    write(data) {
        return new Promise(resolve => {
            this.#writeCallbacks.push(resolve);
            this.#fileManager.append(this.#fileName, data);
        });
    }
    async close() {
        this.#closed = true;
        if (this.#writeCallbacks.length) {
            return;
        }
        this.#fileManager.removeEventListener("AppendedToURL" /* Workspace.FileManager.Events.APPENDED_TO_URL */, this.onAppendDone, this);
        this.#fileManager.close(this.#fileName);
    }
    onAppendDone(event) {
        if (event.data !== this.#fileName) {
            return;
        }
        const writeCallback = this.#writeCallbacks.shift();
        if (writeCallback) {
            writeCallback();
        }
        if (this.#writeCallbacks.length) {
            return;
        }
        if (!this.#closed) {
            return;
        }
        this.#fileManager.removeEventListener("AppendedToURL" /* Workspace.FileManager.Events.APPENDED_TO_URL */, this.onAppendDone, this);
        this.#fileManager.close(this.#fileName);
    }
}
//# sourceMappingURL=FileUtils.js.map