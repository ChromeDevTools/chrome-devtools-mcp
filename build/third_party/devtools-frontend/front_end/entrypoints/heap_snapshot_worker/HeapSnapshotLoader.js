// Copyright 2012 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../core/platform/platform.js';
import * as TextUtils from '../../core/text_utils/text_utils.js';
import { HeapSnapshotProgress, JSHeapSnapshot } from './HeapSnapshot.js';
export class HeapSnapshotLoader {
    #progress;
    #buffer;
    #dataCallback;
    #done;
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    #snapshot;
    #array;
    #arrayIndex;
    #json = '';
    parsingComplete;
    constructor(dispatcher) {
        this.#reset();
        this.#progress = new HeapSnapshotProgress(dispatcher);
        this.#buffer = [];
        this.#dataCallback = null;
        this.#done = false;
        this.parsingComplete = this.#parseInput();
        // Catch unhandled rejection so the error is preserved until buildSnapshot awaits it.
        this.parsingComplete.catch(() => { });
    }
    dispose() {
        this.#reset();
    }
    #reset() {
        this.#json = '';
        this.#snapshot = undefined;
    }
    close() {
        this.#done = true;
        if (this.#dataCallback) {
            this.#dataCallback('');
            this.#dataCallback = null;
        }
    }
    async buildSnapshot(secondWorker) {
        await this.parsingComplete;
        this.#snapshot = this.#snapshot || {};
        this.#progress.updateStatus('Processing snapshot…');
        const result = new JSHeapSnapshot(this.#snapshot, this.#progress);
        await result.initialize(secondWorker);
        this.#reset();
        return result;
    }
    /**
     * Parses (possibly negative) integers from `#json` into `#array`. Assumes
     * valid input. Returns true if more input is needed and false once the
     * closing bracket was reached.
     */
    #parseIntArray() {
        let index = 0;
        const char0 = '0'.charCodeAt(0);
        const char9 = '9'.charCodeAt(0);
        const minus = '-'.charCodeAt(0);
        const closingBracket = ']'.charCodeAt(0);
        const length = this.#json.length;
        while (true) {
            while (index < length) {
                const code = this.#json.charCodeAt(index);
                if ((char0 <= code && code <= char9) || code === minus) {
                    break;
                }
                else if (code === closingBracket) {
                    this.#json = this.#json.slice(index + 1);
                    return false;
                }
                ++index;
            }
            if (index === length) {
                this.#json = '';
                return true;
            }
            const startIndex = index;
            let negative = false;
            if (this.#json.charCodeAt(index) === minus) {
                negative = true;
                ++index;
            }
            let nextNumber = 0;
            while (index < length) {
                const code = this.#json.charCodeAt(index);
                if (char0 > code || code > char9) {
                    break;
                }
                nextNumber *= 10;
                nextNumber += (code - char0);
                ++index;
            }
            if (index === length) {
                this.#json = this.#json.slice(startIndex);
                return true;
            }
            if (!this.#array) {
                throw new Error('Array not instantiated');
            }
            this.#array.setValue(this.#arrayIndex++, negative ? -nextNumber : nextNumber);
        }
    }
    #parseStringsArray() {
        this.#progress.updateStatus('Parsing strings…');
        const closingBracketIndex = this.#json.lastIndexOf(']');
        if (closingBracketIndex === -1) {
            throw new Error('Incomplete JSON');
        }
        this.#json = this.#json.slice(0, closingBracketIndex + 1);
        if (!this.#snapshot) {
            throw new Error('No snapshot in parseStringsArray');
        }
        this.#snapshot.strings = JSON.parse(this.#json);
    }
    write(chunk) {
        // Do not push empty chunks into the buffer because this is the EOF marker returned from fetchChunk().
        if (!chunk) {
            return;
        }
        this.#buffer.push(chunk);
        if (!this.#dataCallback) {
            return;
        }
        this.#dataCallback(this.#buffer.shift());
        this.#dataCallback = null;
    }
    #fetchChunk() {
        // This method shoudln't be entered more than once since parsing happens
        // sequentially. This means it's fine to stash away a single #dataCallback
        // instead of an array of them.
        if (this.#buffer.length > 0) {
            return Promise.resolve(this.#buffer.shift());
        }
        if (this.#done) {
            // The empty string signals EOF.
            return Promise.resolve('');
        }
        const { promise, resolve } = Promise.withResolvers();
        this.#dataCallback = resolve;
        return promise;
    }
    async #findToken(token, startIndex) {
        while (true) {
            const pos = this.#json.indexOf(token, startIndex || 0);
            if (pos !== -1) {
                return pos;
            }
            startIndex = this.#json.length - token.length + 1;
            const chunk = await this.#fetchChunk();
            if (!chunk) {
                throw new Error(`Token ${token} not found (unexpected end of input)`);
            }
            this.#json += chunk;
        }
    }
    async #parseArray(name, title, length) {
        const nameIndex = await this.#findToken(name);
        const bracketIndex = await this.#findToken('[', nameIndex);
        this.#json = this.#json.slice(bracketIndex + 1);
        this.#array = length === undefined ? Platform.TypedArrayUtilities.createExpandableBigUint32Array() :
            Platform.TypedArrayUtilities.createFixedBigUint32Array(length);
        this.#arrayIndex = 0;
        while (this.#parseIntArray()) {
            if (length) {
                this.#progress.updateProgress(title, this.#arrayIndex, this.#array.length);
            }
            else {
                this.#progress.updateStatus(title);
            }
            const chunk = await this.#fetchChunk();
            if (!chunk) {
                throw new Error(`Unexpected end of input while ${title}`);
            }
            this.#json += chunk;
        }
        const result = this.#array;
        this.#array = null;
        return result;
    }
    async #parseInput() {
        const snapshotToken = '"snapshot"';
        const snapshotTokenIndex = await this.#findToken(snapshotToken);
        if (snapshotTokenIndex === -1) {
            throw new Error('Snapshot token not found');
        }
        this.#progress.updateStatus('Loading snapshot info…');
        const json = this.#json.slice(snapshotTokenIndex + snapshotToken.length + 1);
        let jsonTokenizerDone = false;
        const jsonTokenizer = new TextUtils.TextUtils.BalancedJSONTokenizer(metaJSON => {
            this.#json = jsonTokenizer.remainder();
            jsonTokenizerDone = true;
            this.#snapshot = this.#snapshot || {};
            this.#snapshot.snapshot = JSON.parse(metaJSON);
        });
        jsonTokenizer.write(json);
        while (!jsonTokenizerDone) {
            const chunk = await this.#fetchChunk();
            if (!chunk) {
                throw new Error('Unexpected end of input while loading snapshot info');
            }
            jsonTokenizer.write(chunk);
        }
        this.#snapshot = this.#snapshot || {};
        const nodes = await this.#parseArray('"nodes"', 'Loading nodes… {PH1}%', this.#snapshot.snapshot.meta.node_fields.length * this.#snapshot.snapshot.node_count);
        this.#snapshot.nodes = nodes;
        const edges = await this.#parseArray('"edges"', 'Loading edges… {PH1}%', this.#snapshot.snapshot.meta.edge_fields.length * this.#snapshot.snapshot.edge_count);
        this.#snapshot.edges = edges;
        if (this.#snapshot.snapshot.trace_function_count) {
            const traceFunctionInfos = await this.#parseArray('"trace_function_infos"', 'Loading allocation traces… {PH1}%', this.#snapshot.snapshot.meta.trace_function_info_fields.length *
                this.#snapshot.snapshot.trace_function_count);
            this.#snapshot.trace_function_infos = traceFunctionInfos.asUint32ArrayOrFail();
            const thisTokenEndIndex = await this.#findToken(':');
            const nextTokenIndex = await this.#findToken('"', thisTokenEndIndex);
            const openBracketIndex = this.#json.indexOf('[');
            const closeBracketIndex = this.#json.lastIndexOf(']', nextTokenIndex);
            this.#snapshot.trace_tree = JSON.parse(this.#json.substring(openBracketIndex, closeBracketIndex + 1));
            this.#json = this.#json.slice(closeBracketIndex + 1);
        }
        if (this.#snapshot.snapshot.meta.sample_fields) {
            const samples = await this.#parseArray('"samples"', 'Loading samples…');
            this.#snapshot.samples = samples.asArrayOrFail();
        }
        if (this.#snapshot.snapshot.meta['location_fields']) {
            const locations = await this.#parseArray('"locations"', 'Loading locations…');
            this.#snapshot.locations = locations.asArrayOrFail();
        }
        else {
            this.#snapshot.locations = [];
        }
        if (this.#snapshot.snapshot.meta.scope_fields) {
            const scopes = await this.#parseArray('"scopes"', 'Loading scopes…');
            this.#snapshot.scopes = scopes.asArrayOrFail();
        }
        if (this.#snapshot.snapshot.meta.scope_context_var_fields) {
            const scopeContextVars = await this.#parseArray('"scope_context_vars"', 'Loading scope context vars…');
            this.#snapshot.scope_context_vars = scopeContextVars.asArrayOrFail();
        }
        if (this.#snapshot.snapshot.meta.scope_use_fields) {
            const scopeUses = await this.#parseArray('"scope_uses"', 'Loading scope uses…');
            this.#snapshot.scope_uses = scopeUses.asArrayOrFail();
        }
        this.#progress.updateStatus('Loading strings…');
        const stringsTokenIndex = await this.#findToken('"strings"');
        const bracketIndex = await this.#findToken('[', stringsTokenIndex);
        this.#json = this.#json.slice(bracketIndex);
        while (this.#buffer.length > 0 || !this.#done) {
            this.#json += await this.#fetchChunk();
        }
        this.#parseStringsArray();
    }
}
//# sourceMappingURL=HeapSnapshotLoader.js.map