// Copyright 2021 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
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