// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
/**
 * This class is responsible for resolving / updating the scope chain for a specific {@link SDK.DebuggerModel.CallFrame}
 * instance.
 *
 * There are several sources that can influence the scope view:
 *   - Debugger plugins can provide the whole scope info (e.g. from DWARF)
 *   - Source Maps can provide OR augment scope info
 *
 * Source maps can be enabled/disabled dynamically and debugger plugins can attach debug info after the fact.
 *
 * The {@link ScopeChainResolver} tracks all that and invalidates its cache accordingly. This class
 * sends events with the latest scope chain for a specific call frame.
 */
export class ScopeChainModel extends Common.ObjectWrapper.ObjectWrapper {
    #callFrame;
    #scopeChainResolver;
    /** We use the `Throttler` here to make sure that `#boundUpdate` is not run multiple times simultanously */
    #throttler = new Common.Throttler.Throttler(5);
    #boundUpdate = this.#update.bind(this);
    constructor(callFrame, scopeChainResolver) {
        super();
        this.#callFrame = callFrame;
        this.#scopeChainResolver = scopeChainResolver;
        this.#scopeChainResolver.addEventListener("ScopeChainInvalidated" /* ScopeChainResolverEvents.SCOPE_CHAIN_INVALIDATED */, this.#scopeChainInvalidated, this);
        void this.#throttler.schedule(this.#boundUpdate);
    }
    dispose() {
        this.#scopeChainResolver.removeEventListener("ScopeChainInvalidated" /* ScopeChainResolverEvents.SCOPE_CHAIN_INVALIDATED */, this.#scopeChainInvalidated, this);
        this.listeners?.clear();
    }
    resolveScopeChain() {
        return this.#scopeChainResolver.resolveScopeChain(this.#callFrame);
    }
    async #update() {
        const scopeChain = await this.resolveScopeChain();
        this.dispatchEventToListeners("ScopeChainUpdated" /* Events.SCOPE_CHAIN_UPDATED */, new ScopeChain(scopeChain));
    }
    #scopeChainInvalidated(event) {
        if (event.data === this.#callFrame.script) {
            void this.#throttler.schedule(this.#boundUpdate);
        }
    }
}
export var Events;
(function (Events) {
    Events["SCOPE_CHAIN_UPDATED"] = "ScopeChainUpdated";
})(Events || (Events = {}));
/**
 * A scope chain ready to be shown in the UI with debugging info applied.
 */
export class ScopeChain {
    scopeChain;
    constructor(scopeChain) {
        this.scopeChain = scopeChain;
    }
}
//# sourceMappingURL=ScopeChainModel.js.map