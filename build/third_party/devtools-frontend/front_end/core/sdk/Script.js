// Copyright 2021 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/*
 * Copyright (C) 2008 Apple Inc. All Rights Reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. ``AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL APPLE INC. OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
 * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import * as Platform from '../../core/platform/platform.js';
import * as Common from '../common/common.js';
import * as i18n from '../i18n/i18n.js';
import * as TextUtils from '../text_utils/text_utils.js';
import { COND_BREAKPOINT_SOURCE_URL, Location, LOGPOINT_SOURCE_URL, } from './DebuggerModel.js';
import { ResourceTreeModel } from './ResourceTreeModel.js';
import { SecurityOrigin } from './SecurityOrigin.js';
const UIStrings = {
    /**
     * @description Error message for when a script can't be loaded because it was removed or deleted.
     */
    scriptRemovedOrDeleted: 'Script removed or deleted',
    /**
     * @description Error message when failing to load a script source text.
     */
    unableToFetchScriptSource: 'Unable to fetch script source',
};
const str_ = i18n.i18n.registerUIStrings('core/sdk/Script.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
let scriptCacheInstance = null;
export class Script {
    debuggerModel;
    scriptId;
    /**
     * The URL of the script. When `hasSourceURL` is true, this value comes from a `//# sourceURL=` directive. Otherwise,
     * it's the original `src` URL from which the script was loaded.
     */
    sourceURL;
    lineOffset;
    columnOffset;
    endLine;
    endColumn;
    executionContextId;
    hash;
    #isContentScript;
    sourceMapURL;
    debugSymbols;
    hasSourceURL;
    contentLength;
    originStackTrace;
    #codeOffset;
    #language;
    #contentPromise;
    #embedderName;
    #securityOrigin;
    isModule;
    buildId;
    constructor(debuggerModel, scriptId, sourceURL, startLine, startColumn, endLine, endColumn, executionContextId, hash, isContentScript, sourceMapURL, hasSourceURL, length, isModule, originStackTrace, codeOffset, scriptLanguage, debugSymbols, embedderName, buildId) {
        this.debuggerModel = debuggerModel;
        this.scriptId = scriptId;
        this.sourceURL = sourceURL;
        this.lineOffset = startLine;
        this.columnOffset = startColumn;
        this.endLine = endLine;
        this.endColumn = endColumn;
        this.isModule = isModule;
        this.buildId = buildId;
        this.executionContextId = executionContextId;
        this.hash = hash;
        this.#isContentScript = isContentScript;
        this.sourceMapURL = sourceMapURL;
        this.debugSymbols = debugSymbols;
        this.hasSourceURL = hasSourceURL;
        this.contentLength = length;
        this.originStackTrace = originStackTrace;
        this.#codeOffset = codeOffset;
        this.#language = scriptLanguage;
        this.#contentPromise = null;
        this.#embedderName = embedderName;
        this.#securityOrigin = SecurityOrigin.create(this.#embedderName ?? '');
    }
    embedderName() {
        return this.#embedderName;
    }
    /**
     * Returns the security origin of the script derived exclusively from its
     * embedder/network URL (`#embedderName`), or a unique opaque origin if the
     * script has no valid network provenance (e.g. `eval()` or buffer-based Wasm).
     *
     * Security note: Do NOT fall back to `this.sourceURL` or
     * `this.target().inspectedSecurityOrigin()`:
     * - `sourceURL` is overwritten by `//# sourceURL=` comments, allowing a script
     *   to spoof an arbitrary origin.
     * - Third-party scripts (`<script src="https://attacker.example/...">`) run in
     *   the same target/frame as the main page; falling back to the target's
     *   origin would allow them to launder their origin by dynamically evaluating
     *   code via `eval()` or `WebAssembly.instantiate(buffer)`.
     */
    securityOrigin() {
        return this.#securityOrigin;
    }
    target() {
        return this.debuggerModel.target();
    }
    static trimSourceURLComment(source) {
        let sourceURLIndex = source.lastIndexOf('//# sourceURL=');
        if (sourceURLIndex === -1) {
            sourceURLIndex = source.lastIndexOf('//@ sourceURL=');
            if (sourceURLIndex === -1) {
                return source;
            }
        }
        const sourceURLLineIndex = source.lastIndexOf('\n', sourceURLIndex);
        if (sourceURLLineIndex === -1) {
            return source;
        }
        const sourceURLLine = source.substr(sourceURLLineIndex + 1);
        if (!sourceURLLine.match(sourceURLRegex)) {
            return source;
        }
        return source.substr(0, sourceURLLineIndex);
    }
    isContentScript() {
        return this.#isContentScript;
    }
    codeOffset() {
        return this.#codeOffset;
    }
    isJavaScript() {
        return this.#language === "JavaScript" /* Protocol.Debugger.ScriptLanguage.JavaScript */;
    }
    isWasm() {
        return this.#language === "WebAssembly" /* Protocol.Debugger.ScriptLanguage.WebAssembly */;
    }
    scriptLanguage() {
        return this.#language;
    }
    executionContext() {
        return this.debuggerModel.runtimeModel().executionContext(this.executionContextId);
    }
    contentURL() {
        return this.sourceURL;
    }
    contentType() {
        return Common.ResourceType.resourceTypes.Script;
    }
    async loadTextContent() {
        const result = await this.debuggerModel.target().debuggerAgent().invoke_getScriptSource({ scriptId: this.scriptId });
        if (result.getError()) {
            throw new Error(result.getError());
        }
        const { scriptSource, bytecode } = result;
        if (bytecode) {
            return new TextUtils.ContentData.ContentData(bytecode, /* isBase64 */ true, 'application/wasm');
        }
        let content = scriptSource || '';
        if (this.hasSourceURL && Common.ParsedURL.schemeIs(this.sourceURL, 'snippet:')) {
            // TODO(crbug.com/1330846): Find a better way to establish the snippet automapping binding then adding
            // a sourceURL comment before evaluation and removing it here.
            content = Script.trimSourceURLComment(content);
        }
        return new TextUtils.ContentData.ContentData(content, /* isBase64 */ false, 'text/javascript');
    }
    async loadWasmContent() {
        if (!this.isWasm()) {
            throw new Error('Not a wasm script');
        }
        const result = await this.debuggerModel.target().debuggerAgent().invoke_disassembleWasmModule({ scriptId: this.scriptId });
        if (result.getError()) {
            // Fall through to text content loading if v8-based disassembly fails. This is to ensure backwards compatibility with
            // older v8 versions.
            const contentData = await this.loadTextContent();
            return await disassembleWasm(contentData.base64);
        }
        const { streamId, functionBodyOffsets, chunk: { lines, bytecodeOffsets } } = result;
        const lineChunks = [];
        const bytecodeOffsetChunks = [];
        let totalLength = lines.reduce((sum, line) => sum + line.length + 1, 0);
        const truncationMessage = '<truncated>';
        // This is a magic number used in code mirror which, when exceeded, sends it into an infinite loop.
        const cmSizeLimit = 1000000000 - truncationMessage.length;
        if (streamId) {
            while (true) {
                const result = await this.debuggerModel.target().debuggerAgent().invoke_nextWasmDisassemblyChunk({ streamId });
                if (result.getError()) {
                    throw new Error(result.getError());
                }
                const { chunk: { lines: linesChunk, bytecodeOffsets: bytecodeOffsetsChunk } } = result;
                totalLength += linesChunk.reduce((sum, line) => sum + line.length + 1, 0);
                if (linesChunk.length === 0) {
                    break;
                }
                if (totalLength >= cmSizeLimit) {
                    lineChunks.push([truncationMessage]);
                    bytecodeOffsetChunks.push([0]);
                    break;
                }
                lineChunks.push(linesChunk);
                bytecodeOffsetChunks.push(bytecodeOffsetsChunk);
            }
        }
        const functionBodyRanges = [];
        // functionBodyOffsets contains a sequence of pairs of start and end offsets
        for (let i = 0; i < functionBodyOffsets.length; i += 2) {
            functionBodyRanges.push({ start: functionBodyOffsets[i], end: functionBodyOffsets[i + 1] });
        }
        return new TextUtils.WasmDisassembly.WasmDisassembly(lines.concat(...lineChunks), bytecodeOffsets.concat(...bytecodeOffsetChunks), functionBodyRanges);
    }
    requestContentData() {
        if (!this.#contentPromise) {
            const fileSizeToCache = 65535; // We won't bother cacheing files under 64K
            if (this.hash && this.contentLength > fileSizeToCache) {
                // For large files that have a hash, we keep a content-addressed cache
                // so we don't need to load multiple copies or disassemble wasm modules multiple times.
                if (!scriptCacheInstance) {
                    // Initialize script cache singleton. Add a finalizer for removing keys from the map.
                    scriptCacheInstance = {
                        cache: new Map(),
                        registry: new FinalizationRegistry(hashCode => scriptCacheInstance?.cache.delete(hashCode)),
                    };
                }
                // This key should be sufficient to identify scripts that are known to have the same content.
                const fullHash = [
                    this.#language,
                    this.contentLength,
                    this.lineOffset,
                    this.columnOffset,
                    this.endLine,
                    this.endColumn,
                    this.#codeOffset,
                    this.hash,
                ].join(':');
                const cachedContentPromise = scriptCacheInstance.cache.get(fullHash)?.deref();
                if (cachedContentPromise) {
                    this.#contentPromise = cachedContentPromise;
                }
                else {
                    this.#contentPromise = this.#requestContent();
                    scriptCacheInstance.cache.set(fullHash, new WeakRef(this.#contentPromise));
                    scriptCacheInstance.registry.register(this.#contentPromise, fullHash);
                }
            }
            else {
                this.#contentPromise = this.#requestContent();
            }
        }
        return this.#contentPromise;
    }
    async #requestContent() {
        if (!this.scriptId) {
            return { error: i18nString(UIStrings.scriptRemovedOrDeleted) };
        }
        try {
            return this.isWasm() ? await this.loadWasmContent() : await this.loadTextContent();
        }
        catch {
            // TODO(bmeurer): Propagate errors as exceptions / rejections.
            return { error: i18nString(UIStrings.unableToFetchScriptSource) };
        }
    }
    async getWasmBytecode() {
        const base64 = await this.debuggerModel.target().debuggerAgent().invoke_getWasmBytecode({ scriptId: this.scriptId });
        const response = await fetch(`data:application/wasm;base64,${base64.bytecode}`);
        return await response.arrayBuffer();
    }
    originalContentProvider() {
        return new TextUtils.StaticContentProvider.StaticContentProvider(this.contentURL(), this.contentType(), () => this.requestContentData());
    }
    async searchInContent(query, caseSensitive, isRegex) {
        if (!this.scriptId) {
            return [];
        }
        const matches = await this.debuggerModel.target().debuggerAgent().invoke_searchInContent({ scriptId: this.scriptId, query, caseSensitive, isRegex });
        return TextUtils.TextUtils.performSearchInSearchMatches(matches.result || [], query, caseSensitive, isRegex);
    }
    rawLocation(lineNumber, columnNumber) {
        if (this.containsLocation(lineNumber, columnNumber)) {
            return new Location(this.debuggerModel, this.scriptId, lineNumber, columnNumber);
        }
        return null;
    }
    isInlineScript() {
        const startsAtZero = !this.lineOffset && !this.columnOffset;
        return !this.isWasm() && Boolean(this.sourceURL) && !startsAtZero;
    }
    isAnonymousScript() {
        return !this.sourceURL;
    }
    async setBlackboxedRanges(positions) {
        const response = await this.debuggerModel.target().debuggerAgent().invoke_setBlackboxedRanges({ scriptId: this.scriptId, positions });
        return !response.getError();
    }
    containsLocation(lineNumber, columnNumber) {
        const afterStart = (lineNumber === this.lineOffset && columnNumber >= this.columnOffset) || lineNumber > this.lineOffset;
        const beforeEnd = lineNumber < this.endLine || (lineNumber === this.endLine && columnNumber <= this.endColumn);
        return afterStart && beforeEnd;
    }
    get frameId() {
        // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
        // @ts-expect-error
        if (typeof this[frameIdSymbol] !== 'string') {
            // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
            // @ts-expect-error
            this[frameIdSymbol] = frameIdForScript(this);
        }
        // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration
        // @ts-expect-error
        return this[frameIdSymbol];
    }
    /**
     * @returns true, iff this script originates from a breakpoint/logpoint condition
     */
    get isBreakpointCondition() {
        return [COND_BREAKPOINT_SOURCE_URL, LOGPOINT_SOURCE_URL].includes(this.sourceURL);
    }
    /**
     * @returns the currently attached source map for this Script or `undefined` if there is none or it
     * hasn't loaded yet.
     */
    sourceMap() {
        return this.debuggerModel.sourceMapManager().sourceMapForClient(this);
    }
    createPageResourceLoadInitiator() {
        return { target: this.target(), frameId: this.frameId, initiatorUrl: this.embedderName() };
    }
    debugId() {
        return this.buildId;
    }
    rawLocationToRelativeLocation(rawLocation) {
        let { lineNumber, columnNumber } = rawLocation;
        if (!this.hasSourceURL && this.isInlineScript()) {
            lineNumber -= this.lineOffset;
            if (lineNumber === 0 && columnNumber !== undefined) {
                columnNumber -= this.columnOffset;
            }
        }
        return { lineNumber, columnNumber };
    }
    relativeLocationToRawLocation(relativeLocation) {
        let { lineNumber, columnNumber } = relativeLocation;
        if (!this.hasSourceURL && this.isInlineScript()) {
            if (lineNumber === 0 && columnNumber !== undefined) {
                columnNumber += this.columnOffset;
            }
            lineNumber += this.lineOffset;
        }
        return { lineNumber, columnNumber };
    }
}
const frameIdSymbol = Symbol('frameid');
function frameIdForScript(script) {
    const executionContext = script.executionContext();
    if (executionContext) {
        return executionContext.frameId || null;
    }
    // This is to overcome compilation cache which doesn't get reset.
    const resourceTreeModel = script.debuggerModel.target().model(ResourceTreeModel);
    if (!resourceTreeModel?.mainFrame) {
        return null;
    }
    return resourceTreeModel.mainFrame.id;
}
export const sourceURLRegex = /^[\x20\t]*\/\/[@#] sourceURL=\s*(\S*?)\s*$/;
export async function disassembleWasm(content) {
    const worker = Platform.HostRuntime.HOST_RUNTIME.createWorker(new URL('../../entrypoints/wasmparser_worker/wasmparser_worker-entrypoint.js', import.meta.url).toString());
    const promise = new Promise((resolve, reject) => {
        worker.onmessage = ({ data }) => {
            if ('method' in data) {
                switch (data.method) {
                    case 'disassemble':
                        if ('error' in data) {
                            reject(data.error);
                        }
                        else if ('result' in data) {
                            const { lines, offsets, functionBodyOffsets } = data.result;
                            resolve(new TextUtils.WasmDisassembly.WasmDisassembly(lines, offsets, functionBodyOffsets));
                        }
                        break;
                }
            }
        };
        worker.onerror = reject;
    });
    worker.postMessage({ method: 'disassemble', params: { content } });
    try {
        return await promise; // The await is important here or we terminate the worker too early.
    }
    finally {
        worker.terminate();
    }
}
//# sourceMappingURL=Script.js.map