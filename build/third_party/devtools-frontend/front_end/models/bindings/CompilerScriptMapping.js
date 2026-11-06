// Copyright 2012 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as TextUtils from '../../core/text_utils/text_utils.js';
// eslint-disable-next-line @devtools/es-modules-import
import * as StackTraceImpl from '../stack_trace/stack_trace_impl.js';
import * as Workspace from '../workspace/workspace.js';
import { ContentProviderBasedProject } from './ContentProviderBasedProject.js';
import { NetworkProject } from './NetworkProject.js';
/**
 * The `CompilerScriptMapping` maps script entities from source maps to scripts and vice versa.
 * It is part of the {@link DebuggerWorkspaceBinding} and operates on top of the
 * {@link SDK.SourceMapManager.SourceMapManager}.
 *
 * The `CompilerScriptMapping` maintains a list of {@link ContentProviderBasedProject}s, in which it
 * creates the `UISourceCode`s for the source-mapped entities. The mapping is implemented in various
 * layers:
 *
 * - `#sourceMapToProject` holds a mapping of all the attached `SourceMap`s to their respective
 *   `ContentBasedProviderBasedProject`s. When resolving raw to UI locations this is the first
 *   place to check.
 * - `#uiSourceCodeToSourceMaps` maps every `UISourceCode` created herein to the `SourceMap` that
 *   it originated from. This is the authoritative source of information: The `#projects` might
 *   contain `UISourceCode` objects that were created from this `CompilerScriptMapping`, but which
 *   have become stale, and `#uiSourceCodeToSourceMaps` represents these as having no source maps.
 *
 * @see {@link SDK.SourceMap.SourceMap}
 * @see {@link SDK.SourceMapManager.SourceMapManager}
 */
export class CompilerScriptMapping {
    #sourceMapManager;
    #debuggerWorkspaceBinding;
    #stubUISourceCodes = new Map();
    #stubProject;
    #eventListeners;
    #projects = new Map();
    #sourceMapToProject = new Map();
    #uiSourceCodeToSourceMaps = new Platform.MapUtilities.Multimap();
    #debuggerModel;
    #ignoreListManager;
    constructor(debuggerModel, workspace, debuggerWorkspaceBinding) {
        this.#sourceMapManager = debuggerModel.sourceMapManager();
        this.#debuggerWorkspaceBinding = debuggerWorkspaceBinding;
        this.#debuggerModel = debuggerModel;
        this.#ignoreListManager = debuggerWorkspaceBinding.ignoreListManager;
        this.#stubProject =
            new ContentProviderBasedProject(workspace, 'jsSourceMaps:stub:' + debuggerModel.target().id(), Workspace.Workspace.projectTypes.Service, '', true /* isServiceProject */);
        this.#eventListeners = [
            this.#sourceMapManager.addEventListener(SDK.SourceMapManager.Events.SourceMapWillAttach, this.sourceMapWillAttach, this),
            this.#sourceMapManager.addEventListener(SDK.SourceMapManager.Events.SourceMapFailedToAttach, this.sourceMapFailedToAttach, this),
            this.#sourceMapManager.addEventListener(SDK.SourceMapManager.Events.SourceMapAttached, this.sourceMapAttached, this),
            this.#sourceMapManager.addEventListener(SDK.SourceMapManager.Events.SourceMapDetached, this.sourceMapDetached, this),
        ];
    }
    setFunctionRanges(uiSourceCode, ranges) {
        for (const sourceMap of this.#uiSourceCodeToSourceMaps.get(uiSourceCode)) {
            sourceMap.augmentWithScopes(uiSourceCode.url(), ranges);
            // The scopes information changed, so stack traces of the script need to be re-translated.
            const script = this.#sourceMapManager.clientForSourceMap(sourceMap);
            if (script) {
                void this.#debuggerWorkspaceBinding.updateLocations(script);
            }
        }
    }
    addStubUISourceCode(script) {
        const stubUISourceCode = this.#stubProject.addContentProvider(Common.ParsedURL.ParsedURL.concatenate(script.sourceURL, ':sourcemap'), TextUtils.StaticContentProvider.StaticContentProvider.fromString(script.sourceURL, Common.ResourceType.resourceTypes.Script, '\n\n\n\n\n// Please wait a bit.\n// Compiled script is not shown while source map is being loaded!'), 'text/javascript');
        this.#stubUISourceCodes.set(script, stubUISourceCode);
    }
    removeStubUISourceCode(script) {
        const uiSourceCode = this.#stubUISourceCodes.get(script);
        this.#stubUISourceCodes.delete(script);
        if (uiSourceCode) {
            this.#stubProject.removeUISourceCode(uiSourceCode.url());
        }
    }
    /** @returns whether `uiSourceCode` is a placeholder for a script whose source map is still loading. */
    isStubUISourceCode(uiSourceCode) {
        return uiSourceCode.project() === this.#stubProject;
    }
    getLocationRangesForSameSourceLocation(rawLocation) {
        const debuggerModel = rawLocation.debuggerModel;
        const script = rawLocation.script();
        if (!script) {
            return [];
        }
        const sourceMap = this.#sourceMapManager.sourceMapForClient(script);
        if (!sourceMap) {
            return [];
        }
        // Find the source location for the raw location.
        const { lineNumber, columnNumber } = script.rawLocationToRelativeLocation(rawLocation);
        const entry = sourceMap.findEntry(lineNumber, columnNumber);
        if (!entry?.sourceURL) {
            return [];
        }
        const project = this.#sourceMapToProject.get(sourceMap);
        if (!project) {
            return [];
        }
        const uiSourceCode = project.uiSourceCodeForURL(entry.sourceURL);
        if (!uiSourceCode) {
            return [];
        }
        // Check that the reverse is also true and we have a binding for this |uiSourceCode|
        // that is referred to from the |sourceMap| of the |script|.
        if (!this.#uiSourceCodeToSourceMaps.hasValue(uiSourceCode, sourceMap)) {
            return [];
        }
        // Map the source location back to raw location ranges.
        const ranges = sourceMap.findReverseRanges(entry.sourceURL, entry.sourceLineNumber, entry.sourceColumnNumber);
        return ranges.map(({ startLine, startColumn, endLine, endColumn }) => {
            const start = script.relativeLocationToRawLocation({ lineNumber: startLine, columnNumber: startColumn });
            const end = script.relativeLocationToRawLocation({ lineNumber: endLine, columnNumber: endColumn });
            return {
                start: debuggerModel.createRawLocation(script, start.lineNumber, start.columnNumber),
                end: debuggerModel.createRawLocation(script, end.lineNumber, end.columnNumber),
            };
        });
    }
    uiSourceCodeForURL(url, isContentScript) {
        const projectType = isContentScript ? Workspace.Workspace.projectTypes.ContentScripts : Workspace.Workspace.projectTypes.Network;
        for (const project of this.#projects.values()) {
            if (project.type() !== projectType) {
                continue;
            }
            const uiSourceCode = project.uiSourceCodeForURL(url);
            if (uiSourceCode) {
                return uiSourceCode;
            }
        }
        return null;
    }
    /**
     * Resolves the source-mapped entity mapped from the given `rawLocation` if any. If the `rawLocation`
     * does not point into a script with a source map, `null` is returned from here, while if the source
     * map for the script is currently being loaded, a stub `UISourceCode` is returned meanwhile. Otherwise,
     * if the script has a source map entry for the position identified by the `rawLocation`, this method
     * will compute the location in the source-mapped file by a reverse lookup on the source map.
     *
     * If `rawLocation` points to a script with a source map managed by this `CompilerScriptMapping`, which
     * is stale (because it was overridden by a more recent mapping), `null` will be returned.
     *
     * @param rawLocation script location.
     * @returns the {@link Workspace.UISourceCode.UILocation} for the `rawLocation` if any.
     */
    rawLocationToUILocation(rawLocation) {
        const script = rawLocation.script();
        if (!script) {
            return null;
        }
        const { lineNumber, columnNumber } = script.rawLocationToRelativeLocation(rawLocation);
        const stubUISourceCode = this.#stubUISourceCodes.get(script);
        if (stubUISourceCode) {
            return new Workspace.UISourceCode.UILocation(stubUISourceCode, lineNumber, columnNumber);
        }
        const sourceMap = this.#sourceMapManager.sourceMapForClient(script);
        if (!sourceMap) {
            return null;
        }
        const project = this.#sourceMapToProject.get(sourceMap);
        if (!project) {
            return null;
        }
        const entry = sourceMap.findEntry(lineNumber, columnNumber);
        if (!entry?.sourceURL) {
            return null;
        }
        const uiSourceCode = project.uiSourceCodeForURL(entry.sourceURL);
        if (!uiSourceCode) {
            return null;
        }
        // Check that the reverse is also true and we have a binding for this `uiSourceCode`
        // that is referred to from the `sourceMap` of the `script`.
        if (!this.#uiSourceCodeToSourceMaps.hasValue(uiSourceCode, sourceMap)) {
            return null;
        }
        return uiSourceCode.uiLocation(entry.sourceLineNumber, entry.sourceColumnNumber);
    }
    /**
     * Resolves a location within a source mapped entity managed by the `CompilerScriptMapping`
     * to its script locations. If the `uiSourceCode` does not belong to this mapping or if its
     * mapping is stale, an empty list will be returned.
     *
     * A single UI location can map to multiple different {@link SDK.DebuggerModel.RawLocation}s,
     * and these raw locations don't even need to belong to the same script (e.g. multiple bundles
     * can reference the same shared source file in case of code splitting, and locations within
     * this shared source file will then resolve to locations in all the bundles).
     *
     * @param uiSourceCode the source mapped entity.
     * @param lineNumber the line number in terms of the {@link uiSourceCode}.
     * @param columnNumber the column number in terms of the {@link uiSourceCode}.
     * @returns a list of raw locations that correspond to the UI location.
     */
    uiLocationToRawLocations(uiSourceCode, lineNumber, columnNumber) {
        const locations = [];
        for (const sourceMap of this.#uiSourceCodeToSourceMaps.get(uiSourceCode)) {
            const firstEntry = sourceMap.sourceLineMapping(uiSourceCode.url(), lineNumber, columnNumber);
            if (!firstEntry) {
                continue;
            }
            const entries = sourceMap.findReverseEntries(uiSourceCode.url(), firstEntry.sourceLineNumber, firstEntry.sourceColumnNumber, true);
            if (entries.length === 0) {
                continue;
            }
            const script = this.#sourceMapManager.clientForSourceMap(sourceMap);
            if (!script) {
                continue;
            }
            for (const entry of entries) {
                const location = script.relativeLocationToRawLocation(entry);
                locations.push(script.debuggerModel.createRawLocation(script, location.lineNumber, location.columnNumber));
            }
        }
        return locations;
    }
    uiLocationRangeToRawLocationRanges(uiSourceCode, textRange) {
        if (!this.#uiSourceCodeToSourceMaps.has(uiSourceCode)) {
            return null;
        }
        const ranges = [];
        for (const sourceMap of this.#uiSourceCodeToSourceMaps.get(uiSourceCode)) {
            const script = this.#sourceMapManager.clientForSourceMap(sourceMap);
            if (!script) {
                continue;
            }
            for (const scriptTextRange of sourceMap.reverseMapTextRanges(uiSourceCode.url(), textRange)) {
                const startLocation = script.relativeLocationToRawLocation(scriptTextRange.start);
                const endLocation = script.relativeLocationToRawLocation(scriptTextRange.end);
                const start = script.debuggerModel.createRawLocation(script, startLocation.lineNumber, startLocation.columnNumber);
                const end = script.debuggerModel.createRawLocation(script, endLocation.lineNumber, endLocation.columnNumber);
                ranges.push({ start, end });
            }
        }
        return ranges;
    }
    async functionBoundsAtRawLocation(rawLocation) {
        const script = rawLocation.script();
        if (!script) {
            return null;
        }
        const sourceMap = this.#sourceMapManager.sourceMapForClient(script);
        if (!sourceMap) {
            return null;
        }
        await sourceMap.waitForScopeInfo();
        const { lineNumber, columnNumber } = script.rawLocationToRelativeLocation(rawLocation);
        const { url, scope } = sourceMap.findOriginalFunctionScope({ line: lineNumber, column: columnNumber }) ?? {};
        if (!scope || !url) {
            return null;
        }
        const project = this.#sourceMapToProject.get(sourceMap);
        if (!project) {
            return null;
        }
        const uiSourceCode = project.uiSourceCodeForURL(url);
        if (!uiSourceCode) {
            return null;
        }
        // If there's no original source content, callers can't get the source code for
        // the given scope. Presently that's the only reason to get a function's bounds,
        // so in that case return null and allow ResourceScriptMapping to fulfill this
        // request.
        const contentData = await uiSourceCode.requestContentData();
        if ('error' in contentData) {
            return null;
        }
        const name = scope.name ?? '';
        const range = new TextUtils.TextRange.TextRange(scope.start.line, scope.start.column, scope.end.line, scope.end.column);
        return new Workspace.UISourceCode.UIFunctionBounds(uiSourceCode, range, name);
    }
    /**
     * Translates a raw frame using the "scopes" information of its script's source map. Frames of compiler helpers
     * are dropped (see {@link SDK.SourceMapScopesInfo.GeneratedFrameKind}).
     *
     * Outlined frames are merged at read time by the stack_trace model (see `consolidate`). The function keys
     * tell it which authored function the top and bottom frames of a translation belong to. A frame at an
     * unmapped position still gets its keys from the generated ranges; it shows the generated location, named
     * after the authored function.
     *
     * @returns null if the raw frame can't be translated via "scopes" information, e.g. because the script doesn't
     * have a source map (with scopes information), the source map is still loading, or neither mappings nor
     * generated ranges know the position. It's then left to the default mapping.
     */
    async translateRawFrame(rawFrame) {
        const translation = await this.#scopesTranslation(rawFrame);
        if (!translation) {
            return null;
        }
        if (translation.kind === "HIDDEN" /* SDK.SourceMapScopesInfo.GeneratedFrameKind.HIDDEN */) {
            // Compiler helpers don't represent any authored code.
            return { kind: "HIDDEN" /* StackTraceImpl.Trie.FrameKind.HIDDEN */, frames: [] };
        }
        const { frames } = translation;
        if (!frames.length) {
            return null;
        }
        return {
            kind: translation.kind === "OUTLINED" /* SDK.SourceMapScopesInfo.GeneratedFrameKind.OUTLINED */ ? "OUTLINED" /* StackTraceImpl.Trie.FrameKind.OUTLINED */ : "VISIBLE" /* StackTraceImpl.Trie.FrameKind.VISIBLE */,
            frames: await this.#toUIFrames(translation, rawFrame),
            functionKeys: { top: functionKey(frames[0]), bottom: functionKey(frames[frames.length - 1]) },
        };
    }
    /** The raw translation of `rawFrame` by the "scopes" information of its script's source map, if any. */
    async #scopesTranslation(rawFrame) {
        if (StackTraceImpl.Trie.isBuiltinFrame(rawFrame)) {
            return null;
        }
        const script = this.#debuggerModel.scriptForId(rawFrame.scriptId ?? '');
        if (!script || this.#stubUISourceCodes.has(script)) {
            // Use fallback while source map is being loaded.
            return null;
        }
        const sourceMap = script.sourceMap();
        await sourceMap?.waitForScopeInfo();
        if (!sourceMap?.hasScopeInfo()) {
            return null;
        }
        const { lineNumber, columnNumber } = script.rawLocationToRelativeLocation(rawFrame);
        const translation = sourceMap.translateRawFrame(lineNumber, columnNumber);
        return translation ? { ...translation, sourceMap, script } : null;
    }
    /**
     * Switch out url for UISourceCode where we have it. A top frame without position (unmapped generated position)
     * gets the generated location of `rawFrame`.
     */
    async #toUIFrames({ sourceMap, script, frames }, rawFrame) {
        const project = this.#sourceMapToProject.get(sourceMap);
        return await Promise.all(frames.map(async ({ line, column, name, url }) => {
            if (line === undefined || column === undefined) {
                return { ...await this.#generatedUIFrame(script, rawFrame), name };
            }
            const uiSourceCode = url ? project?.uiSourceCodeForURL(url) : undefined;
            return { line, column, name, url: uiSourceCode ? undefined : url, uiSourceCode: uiSourceCode ?? undefined };
        }));
    }
    /** The location of `rawFrame` in terms of the generated `script`, as the non-compiler mappings would show it. */
    async #generatedUIFrame(script, rawFrame) {
        const rawLocation = this.#debuggerModel.createRawLocation(script, rawFrame.lineNumber, rawFrame.columnNumber);
        // Goes through the DebuggerWorkspaceBinding so that e.g. inline scripts resolve to their document.
        const uiLocation = await this.#debuggerWorkspaceBinding.rawLocationToUILocation(rawLocation);
        if (uiLocation) {
            const { uiSourceCode, lineNumber: line, columnNumber } = uiLocation;
            return { uiSourceCode, line, column: columnNumber ?? -1 };
        }
        return { url: rawFrame.url, line: rawFrame.lineNumber, column: rawFrame.columnNumber };
    }
    /**
     * Computes the set of line numbers which are source-mapped to a script within the
     * given {@link uiSourceCode}.
     *
     * @param uiSourceCode the source mapped entity.
     * @returns a set of source-mapped line numbers or `null` if the {@link uiSourceCode}
     *         is not provided by this {@link CompilerScriptMapping} instance.
     */
    getMappedLines(uiSourceCode) {
        if (!this.#uiSourceCodeToSourceMaps.has(uiSourceCode)) {
            return null;
        }
        const mappedLines = new Set();
        for (const sourceMap of this.#uiSourceCodeToSourceMaps.get(uiSourceCode)) {
            for (const entry of sourceMap.mappings()) {
                if (entry.sourceURL !== uiSourceCode.url()) {
                    continue;
                }
                mappedLines.add(entry.sourceLineNumber);
            }
        }
        return mappedLines;
    }
    /**
     * Invoked by the {@link SDK.SourceMapManager.SourceMapManager} whenever it starts loading the
     * source map for a given {@link SDK.Script.Script}. The `CompilerScriptMapping` will set up a
     * {@link Workspace.UISourceCode.UISourceCode} stub for the time that the source map is being
     * loaded to avoid showing the generated code when the DevTools front-end is stopped early (for
     * example on a breakpoint).
     *
     * @param event holds the {@link SDK.Script.Script} whose source map is being loaded.
     */
    sourceMapWillAttach(event) {
        const { client: script } = event.data;
        // Create stub UISourceCode for the time source mapping is being loaded.
        this.addStubUISourceCode(script);
        void this.#debuggerWorkspaceBinding.updateLocations(script);
        if (this.#ignoreListManager.isUserIgnoreListedURL(script.sourceURL, { isContentScript: script.isContentScript() })) {
            this.#sourceMapManager.cancelAttachSourceMap(script);
        }
    }
    /**
     * Invoked by the {@link SDK.SourceMapManager.SourceMapManager} after an attempt to load the
     * source map for a given {@link SDK.Script.Script} failed. The `CompilerScriptMapping` will
     * remove the {@link Workspace.UISourceCode.UISourceCode} stub, and from this time on won't
     * report any mappings for the `client` script.
     *
     * @param event holds the {@link SDK.Script.Script} whose source map failed to load.
     */
    sourceMapFailedToAttach(event) {
        const { client: script } = event.data;
        this.removeStubUISourceCode(script);
        void this.#debuggerWorkspaceBinding.updateLocations(script);
    }
    /**
     * Invoked by the {@link SDK.SourceMapManager.SourceMapManager} after an attempt to load the
     * source map for a given {@link SDK.Script.Script} succeeded. The `CompilerScriptMapping` will
     * now create {@link Workspace.UISourceCode.UISourceCode}s for all the sources mentioned in the
     * `sourceMap`.
     *
     * In case of a conflict this method creates a new {@link Workspace.UISourceCode.UISourceCode}
     * and copies over all the mappings from the other source maps that were registered for the
     * same URL and which are compatible (agree on the content and ignore-list hint for the given
     * URL). If they are considered incompatible, the original `UISourceCode` will simply be
     * removed and a new mapping will be established, unless the original `UISourceCode` is
     * mapped by a newer script, which happens when source maps finish loading out of parse order.
     *
     * @param event holds the {@link SDK.Script.Script} and its {@link SDK.SourceMap.SourceMap}.
     */
    sourceMapAttached(event) {
        const { client: script, sourceMap } = event.data;
        const scripts = new Set([script]);
        this.removeStubUISourceCode(script);
        const target = script.target();
        const securityOrigin = script.securityOrigin();
        const originPart = securityOrigin.isOpaque() ? '' : `:${securityOrigin.siteId()}`;
        const projectId = `jsSourceMaps:${script.isContentScript() ? 'extensions' : ''}:${target.id()}${originPart}`;
        let project = this.#projects.get(projectId);
        if (!project) {
            const projectType = script.isContentScript() ? Workspace.Workspace.projectTypes.ContentScripts :
                Workspace.Workspace.projectTypes.Network;
            project = new ContentProviderBasedProject(this.#stubProject.workspace(), projectId, projectType, 
            /* displayName */ '', /* isServiceProject */ false, securityOrigin);
            NetworkProject.setTargetForProject(project, target);
            this.#projects.set(projectId, project);
        }
        this.#sourceMapToProject.set(sourceMap, project);
        const scriptParseOrder = new Map(this.#debuggerModel.scripts().map((script, index) => [script, index]));
        for (const url of sourceMap.sourceURLs()) {
            const existingUISourceCode = project.uiSourceCodeForURL(url);
            // Source maps can finish loading out of parse order (e.g. when DevTools attaches after a
            // script was replaced on hot reload), so a stale source map must not override the mapping
            // of a newer script.
            if (!this.#shouldUseSourceMapForURL(existingUISourceCode, url, script, sourceMap, scriptParseOrder)) {
                continue;
            }
            const contentType = Common.ResourceType.resourceTypes.SourceMapScript;
            const uiSourceCode = project.createUISourceCode(url, contentType);
            if (sourceMap.hasIgnoreListHint(url)) {
                uiSourceCode.markKnownThirdParty();
            }
            const content = sourceMap.embeddedContentByURL(url);
            const contentProvider = content !== null ?
                TextUtils.StaticContentProvider.StaticContentProvider.fromString(url, contentType, content) :
                new SDK.CompilerSourceMappingContentProvider.CompilerSourceMappingContentProvider(url, contentType, script.createPageResourceLoadInitiator(), target.targetManager().getPageResourceLoader());
            let metadata = null;
            if (content !== null) {
                const encoder = new TextEncoder();
                metadata = new Workspace.UISourceCode.UISourceCodeMetadata(null, encoder.encode(content).length);
            }
            const mimeType = Common.ResourceType.ResourceType.mimeFromURL(url) ?? contentType.canonicalMimeType();
            this.#uiSourceCodeToSourceMaps.set(uiSourceCode, sourceMap);
            NetworkProject.setInitialFrameAttribution(uiSourceCode, script.frameId);
            // Check if there was already an `UISourceCode` for the given `url`, and if so, discard
            // the previous one. While it would be possible to keep the previous one and just add
            // the new mapping (from the `sourceMap`) to it as long as there's no conflict, this
            // doesn't really work with the way the `BreakpointManager` and other parts of the front-end
            // work, which only listen for additions/removals of `UISourceCode`s, since there's no
            // notion of a 'UISourceCodeChanged` event (yet).
            //
            // Therefore, unless we discard any previous `UISourceCode` for the `url` and publish the
            // new `uiSourceCode`, the `BreakpointManager` will not restore / set breakpoints in newly
            // added scripts in case of code-splitting, since it won't find out about these new mappings.
            // By removing and (re)adding a `UISourceCode` for the `url` we effectively force restoration
            // of breakpoints.
            if (existingUISourceCode !== null) {
                // Copy the existing source mappings from the `existingUISourceCode` over as long as
                // they are compatible with the `sourceMap` wrt. `url`. While doing so, also clean
                // up the `existingUISourceCode` (in particular its frame attributions).
                for (const otherSourceMap of this.#uiSourceCodeToSourceMaps.get(existingUISourceCode)) {
                    this.#uiSourceCodeToSourceMaps.delete(existingUISourceCode, otherSourceMap);
                    const otherScript = this.#sourceMapManager.clientForSourceMap(otherSourceMap);
                    if (!otherScript) {
                        continue;
                    }
                    NetworkProject.removeFrameAttribution(existingUISourceCode, otherScript.frameId);
                    if (sourceMap.compatibleForURL(url, otherSourceMap)) {
                        this.#uiSourceCodeToSourceMaps.set(uiSourceCode, otherSourceMap);
                        NetworkProject.addFrameAttribution(uiSourceCode, otherScript.frameId);
                    }
                    scripts.add(otherScript);
                }
                project.removeUISourceCode(url);
            }
            project.addUISourceCodeWithProvider(uiSourceCode, contentProvider, metadata, mimeType);
        }
        void Promise.all([...scripts].map(script => this.#debuggerWorkspaceBinding.updateLocations(script)))
            .then(() => this.sourceMapAttachedForTest(sourceMap));
    }
    #shouldUseSourceMapForURL(existingUISourceCode, url, script, sourceMap, scriptParseOrder) {
        if (existingUISourceCode === null) {
            return true;
        }
        for (const existingSourceMap of this.#uiSourceCodeToSourceMaps.get(existingUISourceCode)) {
            const existingScript = this.#sourceMapManager.clientForSourceMap(existingSourceMap);
            // Compatible source maps agree on the source code of `url` (e.g. code splitting) and
            // complement each other. Incompatible ones mean a different script replaced the source code
            // of `url` (e.g. on hot reload), so only the source map of the newest script should be used.
            if (!existingScript || sourceMap.compatibleForURL(url, existingSourceMap)) {
                continue;
            }
            const isExistingScriptNewer = (scriptParseOrder.get(existingScript) ?? -1) > (scriptParseOrder.get(script) ?? -1);
            if (isExistingScriptNewer) {
                return false;
            }
        }
        return true;
    }
    /**
     * Invoked by the {@link SDK.SourceMapManager.SourceMapManager} when the source map for a given
     * {@link SDK.Script.Script} is removed, which could be either because the target is execution
     * context was destroyed, or the user manually asked to replace the source map for a given
     * script.
     *
     * @param event holds the {@link SDK.Script.Script} and {@link SDK.SourceMap.SourceMap} that
     *              should be detached.
     */
    sourceMapDetached(event) {
        const { client: script, sourceMap } = event.data;
        const project = this.#sourceMapToProject.get(sourceMap);
        if (!project) {
            return;
        }
        // Remove all the files in the `project` that (still) belong to the `sourceMap`.
        // In case of conflicts or overrides (for example due to HMR), not all the files
        // that were originally provided by the `sourceMap` might still belong to it.
        for (const uiSourceCode of project.uiSourceCodes()) {
            if (this.#uiSourceCodeToSourceMaps.delete(uiSourceCode, sourceMap)) {
                NetworkProject.removeFrameAttribution(uiSourceCode, script.frameId);
                if (!this.#uiSourceCodeToSourceMaps.has(uiSourceCode)) {
                    project.removeUISourceCode(uiSourceCode.url());
                }
            }
        }
        this.#sourceMapToProject.delete(sourceMap);
        void this.#debuggerWorkspaceBinding.updateLocations(script);
    }
    scriptsForUISourceCode(uiSourceCode) {
        const scripts = [];
        for (const sourceMap of this.#uiSourceCodeToSourceMaps.get(uiSourceCode)) {
            const script = this.#sourceMapManager.clientForSourceMap(sourceMap);
            if (script) {
                scripts.push(script);
            }
        }
        return scripts;
    }
    sourceMapURLsForUISourceCode(uiSourceCode) {
        return [...this.#uiSourceCodeToSourceMaps.get(uiSourceCode)].map(sourceMap => sourceMap.url());
    }
    sourceMapAttachedForTest(_sourceMap) {
    }
    dispose() {
        Common.EventTarget.removeEventListeners(this.#eventListeners);
        for (const project of this.#projects.values()) {
            project.dispose();
        }
        this.#stubProject.dispose();
    }
}
/**
 * Identifies the authored function of a translated frame. The frames can originate from different source maps
 * (bundles), so we can't compare original scopes directly. The start position tells apart anonymous and
 * same-named functions in one file. All top-level code of a file shares a key.
 */
function functionKey(frame) {
    const start = frame.functionStart ? `${frame.functionStart.line}:${frame.functionStart.column}` : '';
    return `${frame.url ?? ''}\n${frame.name ?? ''}\n${start}`;
}
//# sourceMappingURL=CompilerScriptMapping.js.map