/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {describe, it} from 'node:test';

import {LogpointFormatter} from '../../src/formatters/LogpointFormatter.js';
import type {Logpoint} from '../../src/LogpointManager.js';

describe('LogpointFormatter', () => {
  function formatterTest(label: string, logpoints: Logpoint[]) {
    it(label + ' toString', t => {
      const formatter = new LogpointFormatter(logpoints);
      t.assert.snapshot(formatter.toString());
    });
    it(label + ' toJSON', t => {
      const formatter = new LogpointFormatter(logpoints);
      t.assert.snapshot(JSON.stringify(formatter.toJSON(), null, 2));
    });
  }

  formatterTest('formats an empty logpoint list', []);

  formatterTest('formats bound, source-mapped and unbound logpoints', [
    {
      url: 'http://example.com/app.js',
      lineNumber: 4,
      expression: `'greeting for', name`,
      sourceMapped: false,
      generatedLocations: [
        {url: 'http://example.com/app.js', lineNumber: 4, columnNumber: 3},
      ],
    },
    {
      url: 'webpack:///src/cart.ts',
      lineNumber: 42,
      columnNumber: 7,
      expression: `'cart total:', cart.total, cart.items.length`,
      sourceMapped: true,
      generatedLocations: [
        {url: 'http://example.com/bundle.js', lineNumber: 17, columnNumber: 25},
        {url: 'http://example.com/bundle.js', lineNumber: 90, columnNumber: 1},
      ],
    },
    {
      url: 'http://example.com/late.js',
      lineNumber: 1,
      expression: `'not parsed yet'`,
      sourceMapped: false,
      generatedLocations: [],
    },
  ]);
});
