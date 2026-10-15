// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore 'process' is not available when type-checking against browser types.
export const IS_NODE = typeof process !== 'undefined' && process.versions?.node !== null;
export const IS_BROWSER = 
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore 'window' is not available when type-checking against node.js types.
typeof window !== 'undefined' || (typeof self !== 'undefined' && typeof self.postMessage === 'function');
export const HOST_RUNTIME = await (async () => {
    // Check IS_BROWSER first: in some embedder environments, both IS_NODE
    // and IS_BROWSER can be true because `process` is available in renderer
    // contexts. The browser runtime is always correct when browser APIs
    // (window/self) are available; the Node.js runtime should only be used in
    // pure Node.js environments where those APIs don't exist.
    if (IS_BROWSER) {
        return (await import('./browser/browser.js')).HostRuntime.HOST_RUNTIME;
    }
    if (IS_NODE) {
        return (await import('./node/node.js')).HostRuntime.HOST_RUNTIME;
    }
    throw new Error('Unknown runtime!');
})();
//# sourceMappingURL=HostRuntime.js.map