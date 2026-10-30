// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { Badge, BadgeAction } from './Badge.js';
const DOM_DETECTIVE_BADGE_IMAGE_URI = new URL('../../Images/dom-detective-badge.svg', import.meta.url).toString();
export class DOMDetectiveBadge extends Badge {
    name = 'profiles/me/awards/developers.google.com%2Fprofile%2Fbadges%2Factivity%2Fchrome-devtools%2Fdom-detective';
    title = 'DOM Detective';
    jslogContext = 'dom-detective';
    imageUri = DOM_DETECTIVE_BADGE_IMAGE_URI;
    interestedActions = [
        BadgeAction.MODERN_DOM_BADGE_CLICKED,
    ];
    handleAction(_action) {
        this.trigger();
    }
}
//# sourceMappingURL=DOMDetectiveBadge.js.map