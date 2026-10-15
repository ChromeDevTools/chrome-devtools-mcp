// Copyright 2025 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @returns A negative number iff `a` precedes `b`, 0 iff `a` and `b` are equal and a positive number iff `b` precedes `a`.
 */
export function comparePositions(a, b) {
    return a.line - b.line || a.column - b.column;
}
//# sourceMappingURL=util.js.map