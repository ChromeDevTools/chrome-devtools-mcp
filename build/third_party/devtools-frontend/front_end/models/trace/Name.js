// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as Handlers from './handlers/handlers.js';
import { getEventStyle } from './Styles.js';
import * as Types from './types/types.js';
const UIStrings = {
    /**
     * @description Text shown for an entry in the flame chart that has no explicit name.
     */
    anonymous: '(anonymous)',
    /**
     * @description Text used to show an EventDispatch event which has a type associated with it.
     * @example {click} PH1
     */
    eventDispatchS: 'Event: {PH1}',
    /**
     * @description Text shown for an entry in the flame chart that represents a frame.
     */
    frame: 'Frame',
    /**
     * @description Text in the flame chart of the Performance panel.
     */
    wsConnectionOpened: 'WebSocket opened',
    /**
     * @description Text in the flame chart of the Performance panel.
     * @example {ws://example.com} PH1
     */
    wsConnectionOpenedWithUrl: 'WebSocket opened: {PH1}',
    /**
     * @description Text in the flame chart of the Performance panel.
     */
    wsConnectionClosed: 'WebSocket closed',
    /**
     * @description Text in the flame chart of the Performance panel.
     */
    layoutShift: 'Layout shift',
};
const str_ = i18n.i18n.registerUIStrings('models/trace/Name.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
/**
 * Calculates the display name for a given entry.
 * @param parsedTrace If the trace data is provided
 * as the second argument it can be used to find source map resolved names for
 * profile calls.
 * Use this function to customize the user visible name for an entry. If no
 * custom name is found, we will fallback to the `name` property in the trace
 * entry.
 */
export function forEntry(entry, parsedTrace) {
    if (Types.Events.isProfileCall(entry)) {
        if (parsedTrace) {
            const potentialCallName = Handlers.ModelHandlers.Samples.getProfileCallFunctionName(parsedTrace.data.Samples, entry);
            // We need this extra check because the call name could be the empty
            // string. If it is, we want to fallback.
            if (potentialCallName) {
                return potentialCallName;
            }
        }
        return entry.callFrame.functionName || i18nString(UIStrings.anonymous);
    }
    if (Types.Events.isLegacyTimelineFrame(entry)) {
        return i18n.i18n.lockedString(UIStrings.frame);
    }
    if (Types.Events.isDispatch(entry)) {
        // EventDispatch represent user actions such as clicks, so in this case
        // rather than show the event title (which is always just "Event"), we
        // add the type ("click") to help the user understand the event.
        return i18nString(UIStrings.eventDispatchS, { PH1: entry.args.data.type });
    }
    if (Types.Events.isSyntheticNetworkRequest(entry)) {
        const parsedURL = new Common.ParsedURL.ParsedURL(entry.args.data.url);
        const text = parsedURL.isValid ? `${parsedURL.displayName} (${parsedURL.host})` : entry.args.data.url || 'Network request';
        return text;
    }
    if (Types.Events.isWebSocketCreate(entry)) {
        if (entry.args.data.url) {
            return i18nString(UIStrings.wsConnectionOpenedWithUrl, { PH1: entry.args.data.url });
        }
        return i18nString(UIStrings.wsConnectionOpened);
    }
    if (Types.Events.isWebSocketDestroy(entry)) {
        return i18nString(UIStrings.wsConnectionClosed);
    }
    if (Types.Events.isSyntheticInteraction(entry)) {
        return nameForInteractionEvent(entry);
    }
    if (Types.Events.isSyntheticLayoutShift(entry)) {
        return i18nString(UIStrings.layoutShift);
    }
    if (Types.Events.isSyntheticAnimation(entry) && entry.args.data.beginEvent.args.data.displayName) {
        return entry.args.data.beginEvent.args.data.displayName;
    }
    const eventStyleCustomName = getEventStyle(entry.name)?.title;
    return eventStyleCustomName || entry.name;
}
function nameForInteractionEvent(event) {
    const category = Handlers.ModelHandlers.UserInteractions.categoryOfInteraction(event);
    // Because we hide nested interactions, we do not want to show the
    // specific type of the interaction that was not hidden, so instead we
    // show just the category of that interaction.
    if (category === 'OTHER') {
        return 'Other';
    }
    if (category === 'KEYBOARD') {
        return 'Keyboard';
    }
    if (category === 'POINTER') {
        return 'Pointer';
    }
    return event.type;
}
//# sourceMappingURL=Name.js.map