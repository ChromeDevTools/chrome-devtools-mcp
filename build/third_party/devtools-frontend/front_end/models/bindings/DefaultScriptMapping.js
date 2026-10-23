// Copyright 2012 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as Workspace from '../workspace/workspace.js';
import { ContentProviderBasedProject } from './ContentProviderBasedProject.js';
import { NetworkProject } from './NetworkProject.js';
export class DefaultScriptMapping {
    #debuggerWorkspaceBinding;
    #project;
    #eventListeners;
    #uiSourceCodeToScript;
    #scriptToUISourceCode;
    constructor(debuggerModel, workspace, debuggerWorkspaceBinding) {
        defaultScriptMappings.add(this);
        this.#debuggerWorkspaceBinding = debuggerWorkspaceBinding;
        this.#project =
            new ContentProviderBasedProject(workspace, 'debugger:' + debuggerModel.target().id(), Workspace.Workspace.projectTypes.Debugger, '', true /* isServiceProject */);
        NetworkProject.setTargetForProject(this.#project, debuggerModel.target());
        this.#eventListeners = [
            debuggerModel.addEventListener(SDK.DebuggerModel.Events.GlobalObjectCleared, this.globalObjectCleared, this),
            debuggerModel.addEventListener(SDK.DebuggerModel.Events.ParsedScriptSource, this.parsedScriptSource, this),
            debuggerModel.addEventListener(SDK.DebuggerModel.Events.DiscardedAnonymousScriptSource, this.discardedScriptSource, this),
        ];
        this.#uiSourceCodeToScript = new Map();
        this.#scriptToUISourceCode = new Map();
    }
    static createV8ScriptURL(script) {
        const name = Common.ParsedURL.ParsedURL.extractName(script.sourceURL);
        const url = 'debugger:///VM' + script.scriptId + (name ? ' ' + name : '');
        return url;
    }
    static scriptForUISourceCode(uiSourceCode) {
        for (const defaultScriptMapping of defaultScriptMappings) {
            const script = defaultScriptMapping.scriptForUISourceCode(uiSourceCode);
            if (script !== null) {
                return script;
            }
        }
        return null;
    }
    scriptForUISourceCode(uiSourceCode) {
        return this.#uiSourceCodeToScript.get(uiSourceCode) ?? null;
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
        const { lineNumber, columnNumber } = script.rawLocationToRelativeLocation(rawLocation);
        return uiSourceCode.uiLocation(lineNumber, columnNumber);
    }
    uiLocationToRawLocations(uiSourceCode, lineNumber, columnNumber) {
        const script = this.#uiSourceCodeToScript.get(uiSourceCode);
        if (!script) {
            return [];
        }
        ({ lineNumber, columnNumber } = script.relativeLocationToRawLocation({ lineNumber, columnNumber }));
        return [script.debuggerModel.createRawLocation(script, lineNumber, columnNumber ?? 0)];
    }
    uiLocationRangeToRawLocationRanges(uiSourceCode, { startLine, startColumn, endLine, endColumn }) {
        const script = this.#uiSourceCodeToScript.get(uiSourceCode);
        if (!script) {
            return [];
        }
        ({ lineNumber: startLine, columnNumber: startColumn } =
            script.relativeLocationToRawLocation({ lineNumber: startLine, columnNumber: startColumn }));
        ({ lineNumber: endLine, columnNumber: endColumn } =
            script.relativeLocationToRawLocation({ lineNumber: endLine, columnNumber: endColumn }));
        const start = script.debuggerModel.createRawLocation(script, startLine, startColumn);
        const end = script.debuggerModel.createRawLocation(script, endLine, endColumn);
        return [{ start, end }];
    }
    parsedScriptSource(event) {
        const script = event.data;
        const url = DefaultScriptMapping.createV8ScriptURL(script);
        const uiSourceCode = this.#project.createUISourceCode(url, Common.ResourceType.resourceTypes.Script);
        if (script.isBreakpointCondition) {
            uiSourceCode.markAsUnconditionallyIgnoreListed();
        }
        this.#uiSourceCodeToScript.set(uiSourceCode, script);
        this.#scriptToUISourceCode.set(script, uiSourceCode);
        const mimeType = script.isWasm() ? 'application/wasm' : 'text/javascript';
        this.#project.addUISourceCodeWithProvider(uiSourceCode, script, null, mimeType);
        void this.#debuggerWorkspaceBinding.updateLocations(script);
    }
    discardedScriptSource(event) {
        const script = event.data;
        const uiSourceCode = this.#scriptToUISourceCode.get(script);
        if (uiSourceCode === undefined) {
            return;
        }
        this.#scriptToUISourceCode.delete(script);
        this.#uiSourceCodeToScript.delete(uiSourceCode);
        this.#project.removeUISourceCode(uiSourceCode.url());
    }
    globalObjectCleared() {
        this.#scriptToUISourceCode.clear();
        this.#uiSourceCodeToScript.clear();
        this.#project.reset();
    }
    dispose() {
        defaultScriptMappings.delete(this);
        Common.EventTarget.removeEventListeners(this.#eventListeners);
        this.globalObjectCleared();
        this.#project.dispose();
    }
}
// TODO(bmeurer): Remove the static methods from DefaultScriptMapping
// and get rid of this global table.
const defaultScriptMappings = new Set();
//# sourceMappingURL=DefaultScriptMapping.js.map