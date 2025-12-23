/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it, afterEach} from 'node:test';

import sinon from 'sinon';

import {DevTools} from '../../src/third_party/index.js';
import {
  getTraceSummary,
  parseRawTraceBuffer,
  traceResultIsSuccess,
} from '../../src/trace-processing/parse.js';
import {populateCruxData} from '../../src/utils/crux.js';
import {ensureCrUXManager} from '../../src/utils/crux.js';
import {loadTraceAsBuffer} from '../trace-processing/fixtures/load.js';

describe('crux util', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('summary includes crux metrics', async () => {
    const rawData = loadTraceAsBuffer('basic-trace.json.gz');
    const result = await parseRawTraceBuffer(rawData);
    if (!traceResultIsSuccess(result)) {
      assert.fail('Failed to parse trace');
    }

    // Mock the URL to a non-localhost one so it doesn't get skipped
    const targetUrl = 'https://developers.google.com/';
    if (result.insights && result.insights.size > 0) {
      const firstInsightSet = result.insights.values().next().value;
      if (firstInsightSet) {
        firstInsightSet.url = new URL(targetUrl);
      }
    } else {
      // If no insights, we need to add one or mock the main URL
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (result.parsedTrace.data.Meta as any).mainFrameURL = targetUrl;
    }

    const mockResponse = {
      record: {
        key: {url: targetUrl},
        metrics: {
          largest_contentful_paint: {percentiles: {p75: 1234}},
          interaction_to_next_paint: {percentiles: {p75: 123}},
          cumulative_layout_shift: {percentiles: {p75: 0.12}},
        },
      },
    };

    sinon.stub(global, 'fetch').resolves({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as Response);

    // Mock CrUXManager to avoid initialization issues
    const mockCrUXManager = {
      getSelectedScope: () => ({pageScope: 'url', deviceScope: 'ALL'}),
    };

    sinon
      .stub(DevTools.CrUXManager.CrUXManager, 'instance')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .returns(mockCrUXManager as any);

    const settings = DevTools.Common.Settings.Settings.instance();
    settings.createSetting('field-data', {enabled: false}).set({enabled: true});

    await populateCruxData(result.parsedTrace);
    const summary = getTraceSummary(result);

    assert.ok(summary.includes('Metrics (field / real users):'));
    assert.ok(summary.includes('LCP: 1234 ms'));
    assert.ok(summary.includes('INP: 123 ms'));
    assert.ok(summary.includes('CLS: 0.12'));
  });

  it('populates cruxFieldData in metadata', async () => {
    const fakeParsedTrace = {
      insights: new Map([
        [
          'NAVIGATION_0',
          {
            url: new URL('https://example.com'),
          },
        ],
      ]),
      metadata: {},
      data: {
        Meta: {
          mainFrameURL: 'https://example.com',
        },
      },
    } as unknown as DevTools.TraceEngine.TraceModel.ParsedTrace;

    const mockResponse = {
      record: {
        key: {url: 'https://example.com/'},
        metrics: {
          largest_contentful_paint: {percentiles: {p75: 1000}},
        },
      },
    };

    const fetchStub = sinon.stub(global, 'fetch').resolves({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as Response);

    const settings = DevTools.Common.Settings.Settings.instance();
    settings.createSetting('field-data', {enabled: false}).set({enabled: true});

    await populateCruxData(fakeParsedTrace);

    assert.ok(fakeParsedTrace.metadata.cruxFieldData);
    assert.strictEqual(fakeParsedTrace.metadata.cruxFieldData.length, 1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstResult = fakeParsedTrace.metadata.cruxFieldData[0] as any;
    assert.strictEqual(
      firstResult['url-ALL'].record.key.url,
      'https://example.com/',
    );

    // Check that fetch was called multiple times (for different scopes/device scopes)
    // 2 (url, origin) * 3 (ALL, DESKTOP, PHONE) = 6 calls per URL
    assert.strictEqual(fetchStub.callCount, 6);
  });

  it('handles 404 from CrUX API', async () => {
    const fakeParsedTrace = {
      insights: new Map([
        [
          'NAVIGATION_0',
          {
            url: new URL('https://nonexistent.com'),
          },
        ],
      ]),
      metadata: {},
    } as unknown as DevTools.TraceEngine.TraceModel.ParsedTrace;

    sinon.stub(global, 'fetch').resolves({
      ok: false,
      status: 404,
    } as Response);

    const settings = DevTools.Common.Settings.Settings.instance();
    settings.createSetting('field-data', {enabled: false}).set({enabled: true});

    await populateCruxData(fakeParsedTrace);

    assert.ok(fakeParsedTrace.metadata.cruxFieldData);
    assert.strictEqual(fakeParsedTrace.metadata.cruxFieldData.length, 1);
    assert.strictEqual(
      fakeParsedTrace.metadata.cruxFieldData[0]['url-ALL'],
      null,
    );
  });
});
