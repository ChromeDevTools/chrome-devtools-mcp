// Copyright 2018 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Root from '../../core/root/root.js';
import { NativeFunctions } from './NativeFunctions.js';
export class JavaScriptMetadataImpl {
    uniqueFunctions;
    receiverMethods;
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!Root.DevToolsContext.globalInstance().has(JavaScriptMetadataImpl) || forceNew) {
            Root.DevToolsContext.globalInstance().set(JavaScriptMetadataImpl, new JavaScriptMetadataImpl());
        }
        return Root.DevToolsContext.globalInstance().get(JavaScriptMetadataImpl);
    }
    constructor() {
        this.uniqueFunctions = new Map();
        this.receiverMethods = new Map();
        for (const nativeFunction of NativeFunctions) {
            if (!nativeFunction.receivers) {
                this.uniqueFunctions.set(nativeFunction.name, nativeFunction.signatures);
                continue;
            }
            for (const receiver of nativeFunction.receivers) {
                let method = this.receiverMethods.get(receiver);
                if (!method) {
                    method = new Map();
                    this.receiverMethods.set(receiver, method);
                }
                method.set(nativeFunction.name, nativeFunction.signatures);
            }
        }
    }
    signaturesForNativeFunction(name) {
        return this.uniqueFunctions.get(name) || null;
    }
    signaturesForInstanceMethod(name, receiverClassName) {
        const instanceMethod = this.receiverMethods.get(receiverClassName);
        if (!instanceMethod) {
            return null;
        }
        return instanceMethod.get(name) || null;
    }
    signaturesForStaticMethod(name, receiverConstructorName) {
        const staticMethod = this.receiverMethods.get(receiverConstructorName + 'Constructor');
        if (!staticMethod) {
            return null;
        }
        return staticMethod.get(name) || null;
    }
}
//# sourceMappingURL=JavaScriptMetadata.js.map