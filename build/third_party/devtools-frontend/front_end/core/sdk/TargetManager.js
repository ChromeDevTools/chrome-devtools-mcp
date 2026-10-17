// Copyright 2021 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as Host from '../host/host.js';
import * as Platform from '../platform/platform.js';
import { assertNotNullOrUndefined } from '../platform/platform.js';
import * as Root from '../root/root.js';
import { FrameManager } from './FrameManager.js';
import { MultitargetNetworkManager } from './NetworkManager.js';
import { PageResourceLoader } from './PageResourceLoader.js';
import { SDKModel } from './SDKModel.js';
import { Target, Type as TargetType } from './Target.js';
export class TargetManager extends Common.ObjectWrapper.ObjectWrapper {
    /**
     * @deprecated
     *
     * Intended for {@link SDKModel} classes to be able to retrieve scoped singletons like
     * the "PageResourceLoader" or the "FrameManager".
     *
     * This is only an intermediate step to migrate towards our "layering vision" where
     * SDKModels don't require things from the next layer.
     */
    context;
    #targets;
    #observers;
    get settings() {
        return this.context.get(Common.Settings.Settings);
    }
    // TODO(crbug.com/493763857): Remove fallback once all unit tests use TestUniverse.
    getConsole() {
        if ('has' in this.context && typeof this.context.has === 'function' && !this.context.has(Common.Console.Console)) {
            // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
            return Common.Console.Console.instance();
        }
        return this.context.get(Common.Console.Console);
    }
    // TODO(crbug.com/493763857): Remove fallback once all unit tests use TestUniverse.
    getFrameManager() {
        if ('has' in this.context && typeof this.context.has === 'function' && !this.context.has(FrameManager)) {
            // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
            return FrameManager.instance();
        }
        return this.context.get(FrameManager);
    }
    // TODO(crbug.com/493763857): Remove fallback once all unit tests use TestUniverse.
    getNetworkManager() {
        if ('has' in this.context && typeof this.context.has === 'function' &&
            !this.context.has(MultitargetNetworkManager)) {
            // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
            return MultitargetNetworkManager.instance();
        }
        return this.context.get(MultitargetNetworkManager);
    }
    // TODO(crbug.com/493763857): Remove fallback once all unit tests use TestUniverse.
    getPageResourceLoader() {
        if ('has' in this.context && typeof this.context.has === 'function' && !this.context.has(PageResourceLoader)) {
            // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
            return PageResourceLoader.instance();
        }
        return this.context.get(PageResourceLoader);
    }
    /* eslint-disable @typescript-eslint/no-explicit-any */
    #modelListeners;
    #modelObservers;
    #scopedObservers;
    /* eslint-enable @typescript-eslint/no-explicit-any */
    #isSuspended;
    #browserTarget;
    #scopeTarget;
    #defaultScopeSet;
    #scopeChangeListeners;
    #overrideAutoStartModels;
    /**
     * @param overrideAutoStartModels If provided, then the `autostart` flag on {@link RegistrationInfo} will be ignored.
     */
    constructor(context, overrideAutoStartModels) {
        super();
        this.context = context;
        this.#targets = new Set();
        this.#observers = new Set();
        this.#modelListeners = new Platform.MapUtilities.Multimap();
        this.#modelObservers = new Platform.MapUtilities.Multimap();
        this.#isSuspended = false;
        this.#browserTarget = null;
        this.#scopeTarget = null;
        this.#scopedObservers = new WeakSet();
        this.#defaultScopeSet = false;
        this.#scopeChangeListeners = new Set();
        this.#overrideAutoStartModels = overrideAutoStartModels;
    }
    static instance({ forceNew } = { forceNew: false }) {
        if (!Root.DevToolsContext.globalInstance().has(TargetManager) || forceNew) {
            Root.DevToolsContext.globalInstance().set(TargetManager, new TargetManager(Root.DevToolsContext.globalInstance()));
        }
        return Root.DevToolsContext.globalInstance().get(TargetManager);
    }
    static removeInstance() {
        Root.DevToolsContext.globalInstance().delete(TargetManager);
    }
    // TODO(crbug.com/542394587): Should be `Symbol.dispose`
    dispose() {
        for (const target of this.targets()) {
            target.dispose('TargetManager disposed');
        }
        if (this.#browserTarget) {
            this.#browserTarget.dispose('TargetManager disposed');
            this.#browserTarget = null;
        }
        this.#targets.clear();
        this.#observers.clear();
        this.#modelObservers.clear();
        this.#modelListeners.clear();
        this.#scopeChangeListeners.clear();
        this.#scopeTarget = null;
        this.#scopedObservers = new WeakSet();
    }
    onInspectedURLChange(target) {
        if (target !== this.#scopeTarget) {
            return;
        }
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.inspectedURLChanged(target.inspectedURL() || Platform.DevToolsPath.EmptyUrlString);
        this.dispatchEventToListeners("InspectedURLChanged" /* Events.INSPECTED_URL_CHANGED */, target);
    }
    onNameChange(target) {
        this.dispatchEventToListeners("NameChanged" /* Events.NAME_CHANGED */, target);
    }
    async suspendAllTargets(reason) {
        if (this.#isSuspended) {
            return;
        }
        this.#isSuspended = true;
        this.dispatchEventToListeners("SuspendStateChanged" /* Events.SUSPEND_STATE_CHANGED */);
        const suspendPromises = Array.from(this.#targets.values(), target => target.suspend(reason));
        await Promise.all(suspendPromises);
    }
    async #waitForPromiseWithTimeout(promise, timeoutMessage) {
        const { promise: timeoutPromise, resolve: timeoutResolve } = Promise.withResolvers();
        const timeoutId = globalThis.setTimeout(() => {
            this.getConsole().warn(timeoutMessage);
            timeoutResolve();
        }, 2000);
        await Promise.race([promise, timeoutPromise]);
        globalThis.clearTimeout(timeoutId);
        timeoutResolve(); // avoids "pending async operations" error from test harness.
    }
    async resumeAllTargets() {
        if (!this.#isSuspended) {
            return;
        }
        this.#isSuspended = false;
        this.dispatchEventToListeners("SuspendStateChanged" /* Events.SUSPEND_STATE_CHANGED */);
        const resumePromises = Array.from(this.#targets.values(), async (target) => {
            await this.#waitForPromiseWithTimeout(target.resume(), `Timeout waiting for target ${target.name()} to resume`);
        });
        await Promise.all(resumePromises);
    }
    allTargetsSuspended() {
        return this.#isSuspended;
    }
    models(modelClass, opts) {
        const result = [];
        for (const target of this.#targets) {
            if (opts?.scoped && !this.isInScope(target)) {
                continue;
            }
            const model = target.model(modelClass);
            if (!model) {
                continue;
            }
            result.push(model);
        }
        return result;
    }
    inspectedURL() {
        const mainTarget = this.primaryPageTarget();
        return mainTarget ? mainTarget.inspectedURL() : '';
    }
    observeModels(modelClass, observer, opts) {
        const models = this.models(modelClass, opts);
        this.#modelObservers.set(modelClass, observer);
        if (opts?.scoped) {
            this.#scopedObservers.add(observer);
        }
        for (const model of models) {
            observer.modelAdded(model);
        }
    }
    unobserveModels(modelClass, observer) {
        this.#modelObservers.delete(modelClass, observer);
        this.#scopedObservers.delete(observer);
    }
    modelAdded(modelClass, model, inScope) {
        for (const observer of this.#modelObservers.get(modelClass).values()) {
            if (!this.#scopedObservers.has(observer) || inScope) {
                observer.modelAdded(model);
            }
        }
    }
    modelRemoved(modelClass, model, inScope) {
        for (const observer of this.#modelObservers.get(modelClass).values()) {
            if (!this.#scopedObservers.has(observer) || inScope) {
                observer.modelRemoved(model);
            }
        }
    }
    addModelListener(modelClass, eventType, listener, thisObject, opts) {
        const wrappedListener = (event) => {
            if (!opts?.scoped || this.isInScope(event)) {
                listener.call(thisObject, event);
            }
        };
        for (const model of this.models(modelClass)) {
            model.addEventListener(eventType, wrappedListener);
        }
        this.#modelListeners.set(eventType, { modelClass, thisObject, listener, wrappedListener });
    }
    removeModelListener(modelClass, eventType, listener, thisObject) {
        if (!this.#modelListeners.has(eventType)) {
            return;
        }
        let wrappedListener = null;
        for (const info of this.#modelListeners.get(eventType)) {
            if (info.modelClass === modelClass && info.listener === listener && info.thisObject === thisObject) {
                wrappedListener = info.wrappedListener;
                this.#modelListeners.delete(eventType, info);
            }
        }
        if (wrappedListener) {
            for (const model of this.models(modelClass)) {
                model.removeEventListener(eventType, wrappedListener);
            }
        }
    }
    observeTargets(targetObserver, opts) {
        if (this.#observers.has(targetObserver)) {
            throw new Error('Observer can only be registered once');
        }
        if (opts?.scoped) {
            this.#scopedObservers.add(targetObserver);
        }
        for (const target of this.#targets) {
            if (!opts?.scoped || this.isInScope(target)) {
                targetObserver.targetAdded(target);
            }
        }
        this.#observers.add(targetObserver);
    }
    unobserveTargets(targetObserver) {
        this.#observers.delete(targetObserver);
        this.#scopedObservers.delete(targetObserver);
    }
    /** @returns The set of models we create unconditionally for new targets in the order in which they should be created */
    #autoStartModels() {
        const earlyModels = new Set();
        const models = new Set();
        const shouldAutostart = (model, info) => this.#overrideAutoStartModels ? this.#overrideAutoStartModels.has(model) : info.autostart;
        for (const [model, info] of SDKModel.registeredModels) {
            if (info.early) {
                earlyModels.add(model);
            }
            else if (shouldAutostart(model, info) || this.#modelObservers.has(model)) {
                models.add(model);
            }
        }
        return [...earlyModels, ...models];
    }
    createTarget(id, name, type, parentTarget, sessionId, waitForDebuggerInPage, connection, targetInfo) {
        const target = new Target(this, id, name, type, parentTarget, sessionId || '', this.#isSuspended, connection || null, targetInfo);
        if (waitForDebuggerInPage) {
            void target.pageAgent().invoke_waitForDebugger();
        }
        target.createModels(this.#autoStartModels());
        this.#targets.add(target);
        const inScope = this.isInScope(target);
        // Iterate over a copy. #observers might be modified during iteration.
        for (const observer of [...this.#observers]) {
            if (!this.#scopedObservers.has(observer) || inScope) {
                observer.targetAdded(target);
            }
        }
        for (const [modelClass, model] of target.models().entries()) {
            this.modelAdded(modelClass, model, inScope);
        }
        for (const key of this.#modelListeners.keysArray()) {
            for (const info of this.#modelListeners.get(key)) {
                const model = target.model(info.modelClass);
                if (model) {
                    model.addEventListener(key, info.wrappedListener);
                }
            }
        }
        if ((target === target.outermostTarget() &&
            (target.type() !== TargetType.FRAME || target === this.primaryPageTarget())) &&
            !this.#defaultScopeSet) {
            this.setScopeTarget(target);
        }
        return target;
    }
    removeTarget(target) {
        if (!this.#targets.has(target)) {
            return;
        }
        const inScope = this.isInScope(target);
        this.#targets.delete(target);
        for (const modelClass of target.models().keys()) {
            const model = target.models().get(modelClass);
            assertNotNullOrUndefined(model);
            this.modelRemoved(modelClass, model, inScope);
        }
        // Iterate over a copy. #observers might be modified during iteration.
        for (const observer of [...this.#observers]) {
            if (!this.#scopedObservers.has(observer) || inScope) {
                observer.targetRemoved(target);
            }
        }
        for (const key of this.#modelListeners.keysArray()) {
            for (const info of this.#modelListeners.get(key)) {
                const model = target.model(info.modelClass);
                if (model) {
                    model.removeEventListener(key, info.wrappedListener);
                }
            }
        }
    }
    targets() {
        return [...this.#targets];
    }
    targetById(id) {
        // TODO(dgozman): add a map #id -> #target.
        return this.targets().find(target => target.id() === id) || null;
    }
    rootTarget() {
        if (this.#targets.size === 0) {
            return null;
        }
        return this.#targets.values().next().value ?? null;
    }
    primaryPageTarget() {
        let target = this.rootTarget();
        if (target?.type() === TargetType.TAB) {
            target =
                this.targets().find(t => t.parentTarget() === target && t.type() === TargetType.FRAME && !t.targetInfo()?.subtype?.length) ||
                    null;
        }
        return target;
    }
    browserTarget() {
        return this.#browserTarget;
    }
    async maybeAttachInitialTarget() {
        if (!Boolean(Root.Runtime.Runtime.queryParam('browserConnection'))) {
            return false;
        }
        if (!this.#browserTarget) {
            this.#browserTarget = new Target(this, /* #id*/ 'main', /* #name*/ 'browser', TargetType.BROWSER, /* #parentTarget*/ null, 
            /* #sessionId */ '', /* suspended*/ false, /* #connection*/ null, /* targetInfo*/ undefined);
            this.#browserTarget.createModels(this.#autoStartModels());
        }
        const targetId = await Host.InspectorFrontendHost.InspectorFrontendHostInstance.initialTargetId();
        // Do not await for Target.autoAttachRelated to return, as it goes throguh the renderer and we don't want to block early
        // at front-end initialization if a renderer is stuck. The rest of #target discovery and auto-attach process should happen
        // asynchronously upon Target.attachedToTarget.
        void this.#browserTarget.targetAgent().invoke_autoAttachRelated({
            targetId,
            waitForDebuggerOnStart: true,
        });
        return true;
    }
    clearAllTargetsForTest() {
        this.#targets.clear();
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    isInScope(arg) {
        if (!arg) {
            return false;
        }
        if (isSDKModelEvent(arg)) {
            arg = arg.source;
        }
        if (arg instanceof SDKModel) {
            arg = arg.target();
        }
        while (arg && arg !== this.#scopeTarget) {
            arg = arg.parentTarget();
        }
        return Boolean(arg) && arg === this.#scopeTarget;
    }
    // Sets a root of a scope substree.
    // TargetManager API invoked with `scoped: true` will behave as if targets
    // outside of the scope subtree don't exist. Concretely this means that
    // target observers, model observers and model listeners won't be invoked for targets outside of the
    // scope tree. This method will invoke targetRemoved and modelRemoved for
    // objects in the previous scope, as if they disappear and then will invoke
    // targetAdded and modelAdded as if they just appeared.
    // Note that scopeTarget could be null, which will effectively prevent scoped
    // observes from getting any events.
    setScopeTarget(scopeTarget) {
        if (scopeTarget === this.#scopeTarget) {
            return;
        }
        for (const target of this.targets()) {
            if (!this.isInScope(target)) {
                continue;
            }
            for (const modelClass of this.#modelObservers.keysArray()) {
                const model = target.models().get(modelClass);
                if (!model) {
                    continue;
                }
                for (const observer of [...this.#modelObservers.get(modelClass)].filter(o => this.#scopedObservers.has(o))) {
                    observer.modelRemoved(model);
                }
            }
            // Iterate over a copy. #observers might be modified during iteration.
            for (const observer of [...this.#observers].filter(o => this.#scopedObservers.has(o))) {
                observer.targetRemoved(target);
            }
        }
        this.#scopeTarget = scopeTarget;
        for (const target of this.targets()) {
            if (!this.isInScope(target)) {
                continue;
            }
            for (const observer of [...this.#observers].filter(o => this.#scopedObservers.has(o))) {
                observer.targetAdded(target);
            }
            for (const [modelClass, model] of target.models().entries()) {
                for (const observer of [...this.#modelObservers.get(modelClass)].filter(o => this.#scopedObservers.has(o))) {
                    observer.modelAdded(model);
                }
            }
        }
        for (const scopeChangeListener of this.#scopeChangeListeners) {
            scopeChangeListener();
        }
        if (scopeTarget?.inspectedURL()) {
            this.onInspectedURLChange(scopeTarget);
        }
    }
    addScopeChangeListener(listener) {
        this.#scopeChangeListeners.add(listener);
    }
    scopeTarget() {
        return this.#scopeTarget;
    }
}
export class Observer {
    targetAdded(_target) {
    }
    targetRemoved(_target) {
    }
}
export class SDKModelObserver {
    modelAdded(_model) {
    }
    modelRemoved(_model) {
    }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isSDKModelEvent(arg) {
    return 'source' in arg && arg.source instanceof SDKModel;
}
//# sourceMappingURL=TargetManager.js.map