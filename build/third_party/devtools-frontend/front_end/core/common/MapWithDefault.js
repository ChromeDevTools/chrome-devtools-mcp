// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * Polyfill of https://github.com/tc39/proposal-upsert with a subclass.
 *
 * TODO: Once the proposal is merged, just replace `MapWithDefault` with `Map` and remove it.
 **/
export class MapWithDefault extends Map {
    getOrInsert(key, defaultValue) {
        if (!this.has(key)) {
            this.set(key, defaultValue);
        }
        return this.get(key);
    }
    getOrInsertComputed(key, callbackFunction) {
        if (!this.has(key)) {
            this.set(key, callbackFunction(key));
        }
        return this.get(key);
    }
}
//# sourceMappingURL=MapWithDefault.js.map