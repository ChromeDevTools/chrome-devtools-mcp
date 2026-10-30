// Copyright 2009 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as Root from '../root/root.js';
import { EventDescriptors, } from './InspectorFrontendHostAPI.js';
import { InspectorFrontendHostStub } from './InspectorFrontendHostStub.js';
import { streamWrite as resourceLoaderStreamWrite } from './ResourceLoader.js';
// eslint-disable-next-line @typescript-eslint/naming-convention
export let InspectorFrontendHostInstance;
class InspectorFrontendAPIImpl {
    constructor() {
        for (const descriptor of EventDescriptors) {
            // @ts-expect-error Dispatcher magic
            this[descriptor[0]] = this.dispatch.bind(this, descriptor[0], descriptor[1], descriptor[2]);
        }
    }
    dispatch(name, signature, _runOnceLoaded, ...params) {
        // Single argument methods get dispatched with the param.
        if (signature.length < 2) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                InspectorFrontendHostInstance.events.dispatchEventToListeners(name, params[0]);
            }
            catch (error) {
                console.error(error + ' ' + error.stack);
            }
            return;
        }
        const data = {};
        for (let i = 0; i < signature.length; ++i) {
            data[signature[i]] = params[i];
        }
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            InspectorFrontendHostInstance.events.dispatchEventToListeners(name, data);
        }
        catch (error) {
            console.error(error + ' ' + error.stack);
        }
    }
    streamWrite(id, chunk) {
        resourceLoaderStreamWrite(id, chunk);
    }
}
/**
 * Installs the provided host bindings implementation as the globally used one by DevTools.
 *
 *   - In non-hosted mode this is provided by `devtools_compatibility.js`.
 *   - In hosted mode this tends to be the {@link InspectorFrontendHostStub}.
 *   - For the MCP server this is a custom node.js specific implementation.
 *
 * Note that missing methods will be copied over from the stub.
 */
export function installInspectorFrontendHost(instance) {
    globalThis.InspectorFrontendHost = InspectorFrontendHostInstance = instance;
    if (!(instance instanceof InspectorFrontendHostStub)) {
        // Add stubs for missing methods.
        const proto = InspectorFrontendHostStub.prototype;
        for (const name of Object.getOwnPropertyNames(proto)) {
            const stub = proto[name];
            if (typeof stub !== 'function' || InspectorFrontendHostInstance[name]) {
                continue;
            }
            console.error(`Incompatible embedder: method Host.InspectorFrontendHost.${name} is missing. Using stub instead.`);
            // @ts-expect-error Global injected by devtools_compatibility.js
            InspectorFrontendHostInstance[name] = stub;
        }
    }
    // Attach the events object.
    InspectorFrontendHostInstance.events = new Common.ObjectWrapper.ObjectWrapper();
}
(function () {
    // FIXME: This file is included into both apps, since the devtools_app needs the InspectorFrontendHostAPI only,
    // so the host instance should not be initialized there.
    installInspectorFrontendHost(globalThis.InspectorFrontendHost ?? new InspectorFrontendHostStub());
    globalThis.InspectorFrontendAPI = new InspectorFrontendAPIImpl();
})();
export function isUnderTest(prefs) {
    // Integration tests rely on test queryParam.
    if (Root.Runtime.Runtime.queryParam('test')) {
        return true;
    }
    // Browser tests rely on prefs.
    if (prefs) {
        return prefs['isUnderTest'] === 'true';
    }
    return Common.Settings.Settings.hasInstance() &&
        // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
        Common.Settings.Settings.instance().createSetting('isUnderTest', false).get();
}
// The stub class used to be declared here so for backwards compatibility we re-export it from here.
export { InspectorFrontendHostStub };
//# sourceMappingURL=InspectorFrontendHost.js.map