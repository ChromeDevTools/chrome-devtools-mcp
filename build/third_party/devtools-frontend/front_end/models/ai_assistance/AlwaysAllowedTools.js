// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as AiUtils from '../ai-utils/ai-utils.js';
/**
 * AI tools the user allowed with "Yes, always allow".
 */
export const alwaysAllowedToolsSettingDescriptor = {
    name: 'ai-assistance-always-allowed-tools',
    type: "array" /* Common.Settings.SettingType.ARRAY */,
    defaultValue: [],
};
export var Events;
(function (Events) {
    Events["TOOLS_CHANGED"] = "ToolsChanged";
})(Events || (Events = {}));
export class AlwaysAllowedTools extends Common.ObjectWrapper.ObjectWrapper {
    #impl;
    constructor(settings) {
        super();
        const onChange = () => this.dispatchEventToListeners("ToolsChanged" /* Events.TOOLS_CHANGED */);
        this.#impl =
            AiUtils.AiUtils.isNaturalLanguageInterfaceEnabled() ? new SettingImpl(settings, onChange) : new DisabledImpl();
    }
    isAllowed(toolName) {
        return this.#impl.isAllowed(toolName);
    }
    allow(toolName) {
        this.#impl.allow(toolName);
    }
    remove(toolName) {
        this.#impl.remove(toolName);
    }
    list() {
        return this.#impl.list();
    }
}
/**
 * Actual implementation.
 */
class SettingImpl {
    #setting;
    constructor(settings, onChange) {
        this.#setting = settings.resolve(alwaysAllowedToolsSettingDescriptor);
        this.#setting.addChangeListener(onChange);
    }
    isAllowed(toolName) {
        return this.#setting.get().includes(toolName);
    }
    allow(toolName) {
        this.#setting.set([...new Set([...this.#setting.get(), toolName])]);
    }
    remove(toolName) {
        const toolNames = this.#setting.get().filter(tn => tn !== toolName);
        this.#setting.set([...new Set(toolNames)]);
    }
    list() {
        return [...new Set(this.#setting.get())];
    }
}
/**
 * Fake implementation when natural language interface is disabled.
 */
class DisabledImpl {
    isAllowed() {
        return false;
    }
    allow() {
    }
    remove() {
    }
    list() {
        return [];
    }
}
//# sourceMappingURL=AlwaysAllowedTools.js.map