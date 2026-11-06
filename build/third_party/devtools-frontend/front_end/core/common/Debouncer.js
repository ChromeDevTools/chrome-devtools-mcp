// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * Debounce utility function, ensures that the function passed in is only called once the function stops being called and the delay has expired.
 */
export const debounce = function (func, delay) {
    let timer;
    const debounced = (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => func(...args), testDebounceOverride ? 0 : delay);
    };
    debounced.cancel = () => {
        clearTimeout(timer);
    };
    return debounced;
};
let testDebounceOverride = false;
export function enableTestOverride() {
    testDebounceOverride = true;
}
export function disableTestOverride() {
    testDebounceOverride = false;
}
//# sourceMappingURL=Debouncer.js.map