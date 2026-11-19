/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  CoverageFormatter,
  MAX_COVERAGE_ROWS,
} from '../../src/formatters/CoverageFormatter.js';
import {
  ANONYMOUS_COVERAGE_URL,
  type CoverageReport,
  type CoverageResource,
} from '../../src/tools/ToolDefinition.js';

function resource(
  overrides: Partial<CoverageResource> &
    Pick<CoverageResource, 'url' | 'type' | 'unusedBytes'>,
): CoverageResource {
  const totalBytes = overrides.totalBytes ?? 100;
  const usedBytes = overrides.usedBytes ?? totalBytes - overrides.unusedBytes;
  return {
    url: overrides.url,
    type: overrides.type,
    totalBytes,
    usedBytes,
    unusedBytes: overrides.unusedBytes,
    unusedPercent:
      overrides.unusedPercent ??
      Math.round((overrides.unusedBytes / totalBytes) * 1000) / 10,
  };
}

function report(resources: CoverageResource[]): CoverageReport {
  let totalBytes = 0;
  let usedBytes = 0;
  for (const item of resources) {
    totalBytes += item.totalBytes;
    usedBytes += item.usedBytes;
  }
  const unusedBytes = totalBytes - usedBytes;
  return {
    resources,
    totals: {
      resources: resources.length,
      totalBytes,
      usedBytes,
      unusedBytes,
      unusedPercent:
        totalBytes === 0
          ? 0
          : Math.round((unusedBytes / totalBytes) * 1000) / 10,
    },
  };
}

describe('CoverageFormatter', () => {
  function formatterTest(label: string, setup: () => CoverageFormatter) {
    it(label + ' toString', t => {
      t.assert.snapshot(setup().toString());
    });
    it(label + ' toJSON', t => {
      t.assert.snapshot(JSON.stringify(setup().toJSON(), null, 2));
    });
  }

  formatterTest('formats an empty report', () => {
    return new CoverageFormatter(report([]));
  });

  formatterTest('formats JS and CSS resources', () => {
    return new CoverageFormatter(
      report([
        resource({
          url: 'https://example.com/app.js',
          type: 'JS',
          totalBytes: 1000,
          usedBytes: 250,
          unusedBytes: 750,
          unusedPercent: 75,
        }),
        resource({
          url: 'https://example.com/app.css',
          type: 'CSS',
          totalBytes: 400,
          usedBytes: 100,
          unusedBytes: 300,
          unusedPercent: 75,
        }),
        resource({
          url: ANONYMOUS_COVERAGE_URL,
          type: 'JS',
          totalBytes: 80,
          usedBytes: 80,
          unusedBytes: 0,
          unusedPercent: 0,
        }),
      ]),
    );
  });

  it('truncates long URLs in JSON and string output', () => {
    const url = `https://example.com/${'a'.repeat(300)}.js`;
    const formatter = new CoverageFormatter(
      report([
        resource({
          url,
          type: 'JS',
          unusedBytes: 10,
        }),
      ]),
    );
    const json = formatter.toJSON();
    assert.ok(json.resources[0]);
    assert.notStrictEqual(json.resources[0].url, url);
    assert.match(json.resources[0].url, /\.\.\. <truncated>$/);
    assert.ok(!formatter.toString().includes(url));
    assert.match(formatter.toString(), /\.\.\. <truncated>/);
  });

  it('caps rows and reports omitted count', () => {
    const resources: CoverageResource[] = [];
    for (let i = 0; i < MAX_COVERAGE_ROWS + 3; i++) {
      resources.push(
        resource({
          url: `https://example.com/${i}.js`,
          type: 'JS',
          unusedBytes: MAX_COVERAGE_ROWS + 3 - i,
        }),
      );
    }
    const formatter = new CoverageFormatter(report(resources));
    const json = formatter.toJSON();
    assert.strictEqual(json.resources.length, MAX_COVERAGE_ROWS);
    assert.strictEqual(json.omitted, 3);
    assert.strictEqual(json.totals.resources, MAX_COVERAGE_ROWS + 3);
    assert.match(formatter.toString(), /3 more resources not shown\./);
  });

  it('toString uses toJSON output', () => {
    const formatter = new CoverageFormatter(
      report([
        resource({
          url: 'https://example.com/app.js',
          type: 'JS',
          unusedBytes: 20,
        }),
      ]),
    );
    const json = formatter.toJSON();
    const text = formatter.toString();
    const first = json.resources[0];
    assert.ok(first);
    assert.ok(text.includes(first.url));
    assert.ok(text.includes(`unused=${first.unusedBytes}`));
    assert.ok(text.includes(`${json.totals.totalBytes} total bytes`));
  });
});
