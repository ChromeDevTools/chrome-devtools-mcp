// Copyright 2021 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export var Category;
(function (Category) {
    Category["ANIMATION"] = "animation";
    Category["AUCTION_WORKLET"] = "auction-worklet";
    Category["CANVAS"] = "canvas";
    Category["CLIPBOARD"] = "clipboard";
    Category["CONTROL"] = "control";
    Category["DEVICE"] = "device";
    Category["DOM_MUTATION"] = "dom-mutation";
    Category["DRAG_DROP"] = "drag-drop";
    Category["GEOLOCATION"] = "geolocation";
    Category["KEYBOARD"] = "keyboard";
    Category["LOAD"] = "load";
    Category["MEDIA"] = "media";
    Category["MOUSE"] = "mouse";
    Category["NOTIFICATION"] = "notification";
    Category["PARSE"] = "parse";
    Category["PICTURE_IN_PICTURE"] = "picture-in-picture";
    Category["POINTER"] = "pointer";
    Category["SCRIPT"] = "script";
    Category["TIMER"] = "timer";
    Category["TOUCH"] = "touch";
    Category["TRUSTED_TYPE_VIOLATION"] = "trusted-type-violation";
    Category["WEB_AUDIO"] = "web-audio";
    Category["WINDOW"] = "window";
    Category["WORKER"] = "worker";
    Category["XHR"] = "xhr";
})(Category || (Category = {}));
export class CategorizedBreakpoint {
    /**
     * The name of this breakpoint as passed to 'setInstrumentationBreakpoint',
     * 'setEventListenerBreakpoint' and 'setBreakOnCSPViolation'.
     *
     * Note that the backend adds a 'listener:' and 'instrumentation:' prefix
     * to this name in the 'Debugger.paused' CDP event.
     */
    name;
    #category;
    #enabled;
    constructor(category, name) {
        this.#category = category;
        this.name = name;
        this.#enabled = false;
    }
    category() {
        return this.#category;
    }
    enabled() {
        return this.#enabled;
    }
    setEnabled(enabled) {
        this.#enabled = enabled;
    }
}
//# sourceMappingURL=CategorizedBreakpoint.js.map