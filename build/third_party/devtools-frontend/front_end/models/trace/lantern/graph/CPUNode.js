// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { BaseNode } from './BaseNode.js';
class CPUNode extends BaseNode {
    _event;
    _childEvents;
    correctedEndTs;
    // TODO(crbug.com/568836981): Remove once v8.evaluateModule includes `url` in
    // all supported Chrome versions.
    #scriptUrlById;
    constructor(parentEvent, childEvents = [], correctedEndTs, scriptUrlById) {
        const nodeId = `${parentEvent.tid}.${parentEvent.ts}`;
        super(nodeId);
        this._event = parentEvent;
        this._childEvents = childEvents;
        this.correctedEndTs = correctedEndTs;
        this.#scriptUrlById = scriptUrlById;
    }
    get type() {
        return BaseNode.types.CPU;
    }
    get startTime() {
        return this._event.ts;
    }
    get endTime() {
        if (this.correctedEndTs) {
            return this.correctedEndTs;
        }
        return this._event.ts + this._event.dur;
    }
    get duration() {
        return this.endTime - this.startTime;
    }
    get event() {
        return this._event;
    }
    get childEvents() {
        return this._childEvents;
    }
    // TODO(crbug.com/568836981): Remove once v8.evaluateModule includes `url` in
    // all supported Chrome versions.
    getScriptUrlById(scriptId) {
        return this.#scriptUrlById?.get(scriptId);
    }
    /**
     * Returns true if this node contains a Layout task.
     */
    didPerformLayout() {
        return this._childEvents.some(evt => evt.name === 'Layout');
    }
    /**
     * Returns the script URLs that had their EvaluateScript or v8.evaluateModule events occur in this task.
     */
    getEvaluateScriptURLs() {
        const urls = new Set();
        for (const event of this._childEvents) {
            if (event.name === 'EvaluateScript' || event.name === 'v8.evaluateModule') {
                if (event.args.data?.url) {
                    urls.add(event.args.data.url);
                }
                continue;
            }
            // TODO(crbug.com/568836981): Remove this workaround once v8.evaluateModule
            // includes `args.data.url` in all supported Chrome versions.
            if (event.name === 'ModuleEvaluated' && event.args.data?.scriptId !== undefined) {
                const url = this.#scriptUrlById?.get(event.args.data.scriptId);
                if (url) {
                    urls.add(url);
                }
            }
        }
        return urls;
    }
    cloneWithoutRelationships() {
        return new CPUNode(this._event, this._childEvents, this.correctedEndTs, this.#scriptUrlById);
    }
}
export { CPUNode };
//# sourceMappingURL=CPUNode.js.map