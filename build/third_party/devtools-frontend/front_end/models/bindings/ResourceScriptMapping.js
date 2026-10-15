// Copyright 2012 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as TextUtils from '../../core/text_utils/text_utils.js';
import * as Formatter from '../formatter/formatter.js';
import * as Workspace from '../workspace/workspace.js';
import { ContentProviderBasedProject } from './ContentProviderBasedProject.js';
import { DebuggerWorkspaceBinding } from './DebuggerWorkspaceBinding.js';
import { NetworkProject } from './NetworkProject.js';
import { metadataForURL } from './ResourceUtils.js';
/**
 * The security origin of the URL that `target` (or its closest ancestor that has
 * one) is inspecting, or `null` if none of them has an inspected URL yet.
 */
function inspectedSecurityOrigin(target) {
    for (let current = target; current; current = current.parentTarget()) {
        if (current.inspectedURL()) {
            return current.inspectedSecurityOrigin();
        }
    }
    return null;
}
export class ResourceScriptMapping {
    debuggerModel;
    #workspace;
    debuggerWorkspaceBinding;
    #uiSourceCodeToScriptFile;
    #projects;
    #scriptToUISourceCode;
    #eventListeners;
    constructor(debuggerModel, workspace, debuggerWorkspaceBinding) {
        this.debuggerModel = debuggerModel;
        this.#workspace = workspace;
        this.debuggerWorkspaceBinding = debuggerWorkspaceBinding;
        this.#uiSourceCodeToScriptFile = new Map();
        this.#projects = new Map();
        this.#scriptToUISourceCode = new Map();
        const runtimeModel = debuggerModel.runtimeModel();
        this.#eventListeners = [
            this.debuggerModel.addEventListener(SDK.DebuggerModel.Events.ParsedScriptSource, event => this.addScript(event.data), this),
            this.debuggerModel.addEventListener(SDK.DebuggerModel.Events.GlobalObjectCleared, this.globalObjectCleared, this),
            runtimeModel.addEventListener(SDK.RuntimeModel.Events.ExecutionContextDestroyed, this.executionContextDestroyed, this),
            runtimeModel.target().targetManager().addEventListener("InspectedURLChanged" /* SDK.TargetManager.Events.INSPECTED_URL_CHANGED */, this.inspectedURLChanged, this),
        ];
    }
    project(script) {
        const prefix = script.isContentScript() ? 'js:extensions:' : 'js::';
        const projectId = prefix + this.debuggerModel.target().id() + ':' + script.frameId;
        let project = this.#projects.get(projectId);
        if (!project) {
            const projectType = script.isContentScript() ? Workspace.Workspace.projectTypes.ContentScripts :
                Workspace.Workspace.projectTypes.Network;
            project = new ContentProviderBasedProject(this.#workspace, projectId, projectType, '' /* displayName */, false /* isServiceProject */);
            NetworkProject.setTargetForProject(project, this.debuggerModel.target());
            this.#projects.set(projectId, project);
        }
        return project;
    }
    uiSourceCodeForScript(script) {
        return this.#scriptToUISourceCode.get(script) ?? null;
    }
    rawLocationToUILocation(rawLocation) {
        const script = rawLocation.script();
        if (!script) {
            return null;
        }
        const uiSourceCode = this.#scriptToUISourceCode.get(script);
        if (!uiSourceCode) {
            return null;
        }
        const scriptFile = this.#uiSourceCodeToScriptFile.get(uiSourceCode);
        if (!scriptFile) {
            return null;
        }
        if (scriptFile.script !== script) {
            return null;
        }
        const { lineNumber, columnNumber = 0 } = rawLocation;
        return uiSourceCode.uiLocation(lineNumber, columnNumber);
    }
    uiLocationToRawLocations(uiSourceCode, lineNumber, columnNumber) {
        const scriptFile = this.#uiSourceCodeToScriptFile.get(uiSourceCode);
        if (!scriptFile) {
            return [];
        }
        const { script } = scriptFile;
        if (!script) {
            return [];
        }
        return [this.debuggerModel.createRawLocation(script, lineNumber, columnNumber)];
    }
    uiLocationRangeToRawLocationRanges(uiSourceCode, { startLine, startColumn, endLine, endColumn }) {
        const scriptFile = this.#uiSourceCodeToScriptFile.get(uiSourceCode);
        if (!scriptFile) {
            return null;
        }
        const { script } = scriptFile;
        if (!script) {
            return null;
        }
        const start = this.debuggerModel.createRawLocation(script, startLine, startColumn);
        const end = this.debuggerModel.createRawLocation(script, endLine, endColumn);
        return [{ start, end }];
    }
    inspectedURLChanged(event) {
        for (let target = this.debuggerModel.target(); target !== event.data; target = target.parentTarget()) {
            if (target === null) {
                return;
            }
        }
        // `//# sourceURL=` annotations are resolved relative to the inspected URL, so remove and
        // readd the scripts whose resolved URL changed to ensure their URLs are reflected correctly.
        // All other scripts are left alone, since re-adding them is expensive for pages with many scripts.
        const scripts = Array.from(this.#scriptToUISourceCode)
            .filter(([script, uiSourceCode]) => this.#resolvedSourceURLChanged(script, uiSourceCode))
            .map(([script]) => script);
        this.removeScripts(scripts);
        for (const script of scripts) {
            this.addScript(script);
        }
    }
    /**
     * Whether `uiSourceCode` no longer reflects the `//# sourceURL=` annotation of `script` when
     * resolved against the current inspected URL. Scripts without such an annotation are not
     * affected by changes to the inspected URL.
     */
    #resolvedSourceURLChanged(script, uiSourceCode) {
        if (!script.hasSourceURL) {
            return false;
        }
        const url = SDK.SourceMapManager.SourceMapManager.resolveRelativeSourceURL(script.debuggerModel.target(), script.sourceURL);
        return url !== uiSourceCode.url() || !this.#isTrustworthySourceURL(script, url);
    }
    async functionBoundsAtRawLocation(rawLocation) {
        const script = rawLocation.script();
        if (!script) {
            return null;
        }
        const uiSourceCode = this.#scriptToUISourceCode.get(script);
        if (!uiSourceCode) {
            return null;
        }
        const scopeTreeAndText = script ? await SDK.ScopeTreeCache.scopeTreeForScript(script) : null;
        if (!scopeTreeAndText) {
            return null;
        }
        // Find the inner-most scope that maps to the given position.
        const offset = scopeTreeAndText.text.offsetFromPosition(rawLocation.lineNumber, rawLocation.columnNumber);
        const results = [];
        (function walk(nodes) {
            for (const node of nodes) {
                if (!(offset >= node.start && offset < node.end)) {
                    continue;
                }
                results.push(node);
                walk(node.children);
            }
        })([scopeTreeAndText.scopeTree]);
        const result = results.findLast(node => node.kind === 2 /* Formatter.FormatterWorkerPool.ScopeKind.FUNCTION */ ||
            node.kind === 4 /* Formatter.FormatterWorkerPool.ScopeKind.ARROW_FUNCTION */);
        if (!result) {
            return null;
        }
        // Map back to positions.
        const startPosition = scopeTreeAndText.text.positionFromOffset(result.start);
        const endPosition = scopeTreeAndText.text.positionFromOffset(result.end);
        const name = ''; // TODO(crbug.com/452333154): update ScopeVariableAnalysis to include function name.
        const range = new TextUtils.TextRange.TextRange(startPosition.lineNumber, startPosition.columnNumber, endPosition.lineNumber, endPosition.columnNumber);
        return new Workspace.UISourceCode.UIFunctionBounds(uiSourceCode, range, name);
    }
    addScript(script) {
        if (script.isBreakpointCondition) {
            return;
        }
        let url = script.sourceURL;
        if (!url) {
            return;
        }
        if (script.hasSourceURL) {
            // Try to resolve `//# sourceURL=` annotations relative to
            // the base URL, according to the sourcemap specification.
            url = SDK.SourceMapManager.SourceMapManager.resolveRelativeSourceURL(script.debuggerModel.target(), url);
            // `//# sourceURL=` annotations are fully controlled by the page, so don't let
            // them impersonate a resource of a different origin (b/553931271).
            if (!this.#isTrustworthySourceURL(script, url)) {
                return;
            }
            // Don't let a synthetic source evict the `UISourceCode` of a script that was
            // actually fetched from the network under the same URL.
            const previousUISourceCode = this.project(script).uiSourceCodeForURL(url);
            if (previousUISourceCode && !NetworkProject.isSourceURLSynthesized(previousUISourceCode)) {
                return;
            }
        }
        else {
            // Ignore inline <script>s without `//# sourceURL` annotation here.
            if (script.isInlineScript()) {
                return;
            }
            // Filter out embedder injected content scripts.
            if (script.isContentScript()) {
                const parsedURL = new Common.ParsedURL.ParsedURL(url);
                if (!parsedURL.isValid) {
                    return;
                }
            }
        }
        // Remove previous UISourceCode, if any
        const project = this.project(script);
        const oldUISourceCode = project.uiSourceCodeForURL(url);
        if (oldUISourceCode) {
            const oldScriptFile = this.#uiSourceCodeToScriptFile.get(oldUISourceCode);
            if (oldScriptFile?.script) {
                this.removeScripts([oldScriptFile.script]);
            }
        }
        // Create UISourceCode.
        const originalContentProvider = script.originalContentProvider();
        const uiSourceCode = project.createUISourceCode(url, originalContentProvider.contentType());
        if (script.hasSourceURL) {
            NetworkProject.setSourceURLSynthesized(uiSourceCode);
        }
        NetworkProject.setInitialFrameAttribution(uiSourceCode, script.frameId);
        const metadata = metadataForURL(this.debuggerModel.target(), script.frameId, url);
        // Bind UISourceCode to scripts.
        const scriptFile = new ResourceScriptFile(this, uiSourceCode, script);
        this.#uiSourceCodeToScriptFile.set(uiSourceCode, scriptFile);
        this.#scriptToUISourceCode.set(script, uiSourceCode);
        const mimeType = script.isWasm() ? 'application/wasm' : 'text/javascript';
        project.addUISourceCodeWithProvider(uiSourceCode, originalContentProvider, metadata, mimeType);
        void this.debuggerWorkspaceBinding.updateLocations(script);
    }
    /**
     * Whether the (already resolved) `//# sourceURL=` annotation `url` of `script` may
     * be used as-is.
     *
     * Only `http(s)` URLs can collide with genuine network resources, so an origin is
     * only enforced for those. Annotations using other schemes (e.g. `webpack-internal://`,
     * `snippet://` or `chrome-extension://` for content scripts) cannot impersonate a
     * network resource and are always accepted.
     *
     * The origin of the script's frame is authoritative. For targets that don't have a
     * frame (e.g. workers) we fall back to the inspected URL of the target (or of its
     * closest ancestor that has one). If no origin can be established at all, the
     * annotation is rejected, since we cannot rule out that it spoofs another origin.
     */
    #isTrustworthySourceURL(script, url) {
        if (script.isContentScript()) {
            return true;
        }
        const parsedURL = Common.ParsedURL.ParsedURL.fromString(url);
        if (!parsedURL || !['http', 'https'].includes(parsedURL.scheme)) {
            return true;
        }
        const target = script.debuggerModel.target();
        const frame = script.frameId ?
            target.model(SDK.ResourceTreeModel.ResourceTreeModel)?.frameForId(script.frameId) ?? null :
            null;
        const securityOrigin = frame ? frame.securityOrigin() : inspectedSecurityOrigin(target);
        if (!securityOrigin) {
            return false;
        }
        return SDK.SecurityOrigin.SecurityOrigin.create(url).isSameOriginWith(securityOrigin);
    }
    scriptFile(uiSourceCode) {
        return this.#uiSourceCodeToScriptFile.get(uiSourceCode) || null;
    }
    removeScripts(scripts) {
        const uiSourceCodesByProject = new Platform.MapUtilities.Multimap();
        for (const script of scripts) {
            const uiSourceCode = this.#scriptToUISourceCode.get(script);
            if (!uiSourceCode) {
                continue;
            }
            this.#uiSourceCodeToScriptFile.delete(uiSourceCode);
            this.#scriptToUISourceCode.delete(script);
            uiSourceCodesByProject.set(uiSourceCode.project(), uiSourceCode);
            void this.debuggerWorkspaceBinding.updateLocations(script);
        }
        for (const project of uiSourceCodesByProject.keysArray()) {
            const uiSourceCodes = uiSourceCodesByProject.get(project);
            // Check if all the ui source codes in the project are in |uiSourceCodes|.
            let allInProjectRemoved = true;
            for (const projectSourceCode of project.uiSourceCodes()) {
                if (!uiSourceCodes.has(projectSourceCode)) {
                    allInProjectRemoved = false;
                    break;
                }
            }
            // Drop the whole project if no source codes are left in it.
            if (allInProjectRemoved) {
                this.#projects.delete(project.id());
                project.removeProject();
            }
            else {
                // Otherwise, announce the removal of each UI source code individually.
                uiSourceCodes.forEach(c => project.removeUISourceCode(c.url()));
            }
        }
    }
    executionContextDestroyed(event) {
        const executionContext = event.data;
        this.removeScripts(this.debuggerModel.scriptsForExecutionContext(executionContext));
    }
    globalObjectCleared() {
        const scripts = Array.from(this.#scriptToUISourceCode.keys());
        this.removeScripts(scripts);
    }
    resetForTest() {
        this.globalObjectCleared();
    }
    dispose() {
        Common.EventTarget.removeEventListeners(this.#eventListeners);
        this.globalObjectCleared();
    }
}
export class ResourceScriptFile {
    #resourceScriptMapping;
    uiSourceCode;
    script;
    constructor(resourceScriptMapping, uiSourceCode, script) {
        this.#resourceScriptMapping = resourceScriptMapping;
        this.uiSourceCode = uiSourceCode;
        this.script = this.uiSourceCode.contentType().isScript() ? script : null;
    }
    addSourceMapURL(sourceMapURL, provenance) {
        if (!this.script) {
            return;
        }
        this.script.debuggerModel.setSourceMapURL(this.script, sourceMapURL, provenance);
    }
    addDebugInfoURL(debugInfoURL) {
        if (!this.script) {
            return;
        }
        // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
        const { pluginManager } = DebuggerWorkspaceBinding.instance();
        pluginManager.setDebugInfoURL(this.script, debugInfoURL);
    }
    hasSourceMapURL() {
        return Boolean(this.script?.sourceMapURL);
    }
    async missingSymbolFiles() {
        if (!this.script) {
            return null;
        }
        const { pluginManager } = this.#resourceScriptMapping.debuggerWorkspaceBinding;
        const sources = await pluginManager.getSourcesForScript(this.script);
        return sources && 'missingSymbolFiles' in sources ? sources.missingSymbolFiles : null;
    }
}
//# sourceMappingURL=ResourceScriptMapping.js.map