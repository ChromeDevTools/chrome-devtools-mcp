// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export const inverse = function (map) {
    const result = new Multimap();
    for (const [key, value] of map.entries()) {
        result.set(value, key);
    }
    return result;
};
export class Multimap {
    map = new Map();
    set(key, value) {
        let set = this.map.get(key);
        if (!set) {
            set = new Set();
            this.map.set(key, set);
        }
        set.add(value);
    }
    get(key) {
        return this.map.get(key) || new Set();
    }
    has(key) {
        return this.map.has(key);
    }
    hasValue(key, value) {
        const set = this.map.get(key);
        if (!set) {
            return false;
        }
        return set.has(value);
    }
    get size() {
        return this.map.size;
    }
    delete(key, value) {
        const values = this.get(key);
        if (!values) {
            return false;
        }
        const result = values.delete(value);
        if (!values.size) {
            this.map.delete(key);
        }
        return result;
    }
    deleteAll(key) {
        this.map.delete(key);
    }
    keysArray() {
        return [...this.map.keys()];
    }
    keys() {
        return this.map.keys();
    }
    valuesArray() {
        const result = [];
        for (const set of this.map.values()) {
            result.push(...set.values());
        }
        return result;
    }
    clear() {
        this.map.clear();
    }
}
/**
 * Gets value for key, assigning a default if value is falsy.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export function getWithDefault(map, key, defaultValueFactory) {
    let value = map.get(key);
    if (value === undefined || value === null) {
        value = defaultValueFactory(key);
        map.set(key, value);
    }
    return value;
}
//# sourceMappingURL=MapUtilities.js.map