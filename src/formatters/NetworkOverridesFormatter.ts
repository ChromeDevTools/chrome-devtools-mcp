/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {NetworkOverride} from '../NetworkOverrideManager.js';

const MEASUREMENT_WARNING =
  'Network mocks disable the page HTTP cache and intercept every request. ' +
  'Replacement resources use altered delivery paths; these timings do not ' +
  'represent normal production loading. Compare baseline and candidate using ' +
  'the same mock mechanism, cache policy, and throttling.';

export class NetworkOverridesFormatter {
  constructor(private readonly overrides: NetworkOverride[]) {}

  toJSON(): {overrides: NetworkOverride[]; warning?: string} {
    return {
      overrides: this.overrides,
      ...(this.overrides.length > 0 ? {warning: MEASUREMENT_WARNING} : {}),
    };
  }

  toString(): string {
    const {overrides, warning} = this.toJSON();
    if (!warning) {
      return '';
    }
    const lines = [warning];
    for (const override of overrides) {
      const source =
        override.responseFilePath + ' (' + override.contentType + ')';
      const resourceType = override.resourceType
        ? ' [' + override.resourceType + ']'
        : '';
      lines.push(override.urlPattern + resourceType + ' -> ' + source);
      const {hits, errors, navigations, lastError} = override.diagnostics;
      lines.push(
        '  Since configured: ' + hits + ' hits, ' + errors + ' errors.',
      );
      if (lastError) {
        lines.push('  Last error: ' + lastError);
      }
      if (hits === 0) {
        lines.push(
          navigations > 0
            ? '  Warning: no requests matched after navigation. Check the full-URL pattern, resource type, and service worker.'
            : '  No matches yet. Navigate or reload to verify this rule.',
        );
      }
    }
    return lines.join('\n');
  }
}
