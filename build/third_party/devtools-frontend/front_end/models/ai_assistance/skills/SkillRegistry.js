// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { skill as lighthouseSkill } from './lighthouse.skill.js';
import { skill as networkSkill } from './network.skill.js';
import { skill as performanceSkill } from './performance.skill.js';
import { skill as sourcesSkill } from './sources.skill.js';
import { skill as storageSkill } from './storage.skill.js';
import { skill as stylingSkill } from './styling.skill.js';
export const SKILLS = {
    styling: stylingSkill,
    network: networkSkill,
    performance: performanceSkill,
    storage: storageSkill,
    sources: sourcesSkill,
    lighthouse: lighthouseSkill,
};
//# sourceMappingURL=SkillRegistry.js.map