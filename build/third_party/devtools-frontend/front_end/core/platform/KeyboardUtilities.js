// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export const ENTER_KEY = 'Enter';
export const ESCAPE_KEY = 'Escape';
export const TAB_KEY = 'Tab';
export const ARROW_KEYS = new Set([
    "ArrowUp" /* ArrowKey.UP */,
    "ArrowDown" /* ArrowKey.DOWN */,
    "ArrowLeft" /* ArrowKey.LEFT */,
    "ArrowRight" /* ArrowKey.RIGHT */,
]);
export function keyIsArrowKey(key) {
    return ARROW_KEYS.has(key);
}
export function isEscKey(event) {
    return event.key === 'Escape';
}
export function isEnterOrSpaceKey(event) {
    return event.key === 'Enter' || event.key === ' ';
}
//# sourceMappingURL=KeyboardUtilities.js.map