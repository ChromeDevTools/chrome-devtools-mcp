// Copyright 2014 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Root from '../root/root.js';
import { ObjectWrapper } from './Object.js';
import { reveal } from './Revealer.js';
export class Console extends ObjectWrapper {
    #messages = [];
    static instance(opts) {
        if (!Root.DevToolsContext.globalInstance().has(Console) || opts?.forceNew) {
            Root.DevToolsContext.globalInstance().set(Console, new Console());
        }
        return Root.DevToolsContext.globalInstance().get(Console);
    }
    static removeInstance() {
        Root.DevToolsContext.globalInstance().delete(Console);
    }
    /**
     * Add a message to the Console panel.
     *
     * @param text the message text.
     * @param level the message level.
     * @param show whether to show the Console panel (if it's not already shown).
     * @param source the message source.
     */
    addMessage(text, level = "info" /* MessageLevel.INFO */, show = false, source) {
        const message = new Message(text, level, Date.now(), show, source);
        this.#messages.push(message);
        this.dispatchEventToListeners("messageAdded" /* Events.MESSAGE_ADDED */, message);
    }
    log(text) {
        this.addMessage(text, "info" /* MessageLevel.INFO */);
    }
    warn(text, source) {
        this.addMessage(text, "warning" /* MessageLevel.WARNING */, undefined, source);
    }
    /**
     * Adds an error message to the Console panel.
     *
     * @param text the message text.
     * @param show whether to show the Console panel (if it's not already shown).
     */
    error(text, show = true) {
        this.addMessage(text, "error" /* MessageLevel.ERROR */, show);
    }
    messages() {
        return this.#messages;
    }
    show() {
        void this.showPromise();
    }
    showPromise() {
        return reveal(this);
    }
}
export var FrontendMessageSource;
(function (FrontendMessageSource) {
    FrontendMessageSource["CSS"] = "css";
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Used by web_tests.
    FrontendMessageSource["ConsoleAPI"] = "console-api";
    FrontendMessageSource["ISSUE_PANEL"] = "issue-panel";
    FrontendMessageSource["SELF_XSS"] = "self-xss";
})(FrontendMessageSource || (FrontendMessageSource = {}));
export class Message {
    text;
    level;
    timestamp;
    show;
    source;
    constructor(text, level, timestamp, show, source) {
        this.text = text;
        this.level = level;
        this.timestamp = (typeof timestamp === 'number') ? timestamp : Date.now();
        this.show = show;
        if (source) {
            this.source = source;
        }
    }
}
//# sourceMappingURL=Console.js.map