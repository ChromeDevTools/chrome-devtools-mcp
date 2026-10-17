// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export const extensionPalette = [
    'primary',
    'primary-light',
    'primary-dark',
    'secondary',
    'secondary-light',
    'secondary-dark',
    'tertiary',
    'tertiary-light',
    'tertiary-dark',
    'error',
    'warning',
];
/** Returns true if this is a devtoolsObj for a marker */
export function isExtensionPayloadMarker(payload) {
    return payload.dataType === 'marker';
}
/** Returns true if this is a devtoolsObj for an entry (non-instant) */
export function isExtensionEntryObj(payload) {
    const hasTrack = 'track' in payload && Boolean(payload.track);
    const validEntryType = payload.dataType === 'track-entry' || payload.dataType === undefined;
    return validEntryType && hasTrack;
}
/** Returns true if this is a devtoolsObj for a console.timeStamp */
export function isConsoleTimestampPayloadTrackEntry(payload) {
    return payload.url !== undefined && payload.description !== undefined;
}
export function isValidExtensionPayload(payload) {
    return isExtensionPayloadMarker(payload) || isExtensionEntryObj(payload) ||
        isConsoleTimestampPayloadTrackEntry(payload);
}
export function isSyntheticExtensionEntry(entry) {
    return entry.cat === 'devtools.extension';
}
//# sourceMappingURL=Extensions.js.map