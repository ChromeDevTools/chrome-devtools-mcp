// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export const isValid = (date) => {
    return !isNaN(date.getTime());
};
export const toISO8601Compact = (date) => {
    function leadZero(x) {
        return (x > 9 ? '' : '0') + x;
    }
    return date.getFullYear() + leadZero(date.getMonth() + 1) + leadZero(date.getDate()) + 'T' +
        leadZero(date.getHours()) + leadZero(date.getMinutes()) + leadZero(date.getSeconds());
};
//# sourceMappingURL=DateUtilities.js.map