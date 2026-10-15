// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { Badge, BadgeAction } from './Badge.js';
const SPEEDSTER_BADGE_URI = new URL('../../Images/speedster-badge.svg', import.meta.url).toString();
export class SpeedsterBadge extends Badge {
    name = 'profiles/me/awards/developers.google.com%2Fprofile%2Fbadges%2Factivity%2Fchrome-devtools%2Fspeedster';
    title = 'Speedster';
    jslogContext = 'speedster';
    interestedActions = [
        BadgeAction.PERFORMANCE_INSIGHT_CLICKED,
    ];
    imageUri = SPEEDSTER_BADGE_URI;
    handleAction(_action) {
        this.trigger();
    }
}
//# sourceMappingURL=SpeedsterBadge.js.map