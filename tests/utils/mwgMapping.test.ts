/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  DEVTOOLS_ISSUE_TO_MWG_GUIDES,
  formatMwgRampSection,
  getMwgGuidesForDevToolsIssue,
  getMwgGuidesForLighthouseAudit,
  LIGHTHOUSE_AUDIT_TO_MWG_GUIDES,
} from '../../src/utils/mwgMapping.js';

describe('mwgMapping', () => {
  describe('mapping tables', () => {
    it('exports non-empty LIGHTHOUSE_AUDIT_TO_MWG_GUIDES with 1 guide ID per entry', () => {
      const entries = Object.entries(LIGHTHOUSE_AUDIT_TO_MWG_GUIDES);
      assert.ok(entries.length > 0);
      for (const [auditId, guides] of entries) {
        assert.ok(auditId.length > 0);
        assert.strictEqual(
          guides.length,
          1,
          `Expected 1 guide for ${auditId}, got ${guides.length}`,
        );
        for (const guideId of guides) {
          assert.ok(guideId.length > 0);
        }
      }
    });

    it('exports non-empty DEVTOOLS_ISSUE_TO_MWG_GUIDES with 1 guide ID per entry', () => {
      const entries = Object.entries(DEVTOOLS_ISSUE_TO_MWG_GUIDES);
      assert.ok(entries.length > 0);
      for (const [issueFile, guides] of entries) {
        assert.ok(issueFile.endsWith('.md'));
        assert.strictEqual(
          guides.length,
          1,
          `Expected 1 guide for ${issueFile}, got ${guides.length}`,
        );
        for (const guideId of guides) {
          assert.ok(guideId.length > 0);
        }
      }
    });
  });

  describe('getMwgGuidesForLighthouseAudit', () => {
    it('returns matching guides for known Lighthouse audits', () => {
      const guides = getMwgGuidesForLighthouseAudit('color-contrast');
      assert.ok(guides.includes('ensure-sufficient-color-contrast'));
    });

    it('returns empty array for unknown or empty audit IDs', () => {
      assert.deepStrictEqual(
        getMwgGuidesForLighthouseAudit('unknown-audit-id'),
        [],
      );
      assert.deepStrictEqual(getMwgGuidesForLighthouseAudit(''), []);
    });
  });

  describe('getMwgGuidesForDevToolsIssue', () => {
    it('returns matching guides for known DevTools issue description files', () => {
      const trustedTypesGuides = getMwgGuidesForDevToolsIssue(
        'cspTrustedTypesSinkViolation.md',
      );
      assert.ok(trustedTypesGuides.includes('mitigate-dom-xss-trusted-types'));

      const contrastGuides = getMwgGuidesForDevToolsIssue('LowTextContrast.md');
      assert.ok(contrastGuides.includes('ensure-sufficient-color-contrast'));
    });

    it('returns empty array for undefined or unknown description files', () => {
      assert.deepStrictEqual(getMwgGuidesForDevToolsIssue(undefined), []);
      assert.deepStrictEqual(getMwgGuidesForDevToolsIssue('unknown.md'), []);
    });
  });

  describe('formatMwgRampSection', () => {
    it('returns empty string when given no guide IDs', () => {
      assert.strictEqual(formatMwgRampSection([]), '');
    });

    it('deduplicates guide IDs while preserving order and formats the ramp markdown line', () => {
      const output = formatMwgRampSection(['guide-a', 'guide-b', 'guide-a']);
      assert.strictEqual(
        output,
        'Get implementation help with `npx -y modern-web-guidance retrieve guide-a,guide-b`',
      );
    });
  });
});
