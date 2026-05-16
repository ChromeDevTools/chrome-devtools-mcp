/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  serverArgs: ['--experimentalVision=true'],
  prompt: `Take a screenshot of <TEST_URL>. There is a single large blue square on the page. Use the get_element_at tool to inspect the DOM element at the center of that blue square (the page is 800x600 and the square spans roughly x=100..300, y=100..300, so a coordinate around 200,200 is appropriate). Then tell me the element's id and class.`,
  maxTurns: 4,
  htmlRoute: {
    path: '/get_element_at_test.html',
    htmlContent: `
      <!doctype html>
      <html>
        <head>
          <style>
            body { margin: 0; background: #ffffff; }
            #target {
              position: absolute;
              left: 100px;
              top: 100px;
              width: 200px;
              height: 200px;
              background: #1a73e8;
              color: white;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 24px;
            }
          </style>
        </head>
        <body>
          <div id="target" class="cta-button" data-testid="primary">CLICK ME</div>
        </body>
      </html>
    `,
  },
  expectations: calls => {
    const visualCalls = calls.filter(
      c => c.name === 'take_screenshot' || c.name === 'take_snapshot',
    );
    assert.ok(
      visualCalls.length >= 1,
      'Expected at least one take_screenshot or take_snapshot call before inspecting coordinates',
    );

    const elementAtCalls = calls.filter(c => c.name === 'get_element_at');
    assert.ok(
      elementAtCalls.length >= 1,
      'Expected at least one get_element_at call',
    );

    let withinTarget = 0;
    for (const call of elementAtCalls) {
      const x = call.args.x;
      const y = call.args.y;
      assert.strictEqual(
        typeof x,
        'number',
        'get_element_at must receive a numeric x',
      );
      assert.strictEqual(
        typeof y,
        'number',
        'get_element_at must receive a numeric y',
      );
      if (
        typeof x === 'number' &&
        typeof y === 'number' &&
        x >= 100 &&
        x <= 300 &&
        y >= 100 &&
        y <= 300
      ) {
        withinTarget++;
      }
    }
    assert.ok(
      withinTarget >= 1,
      'Expected at least one get_element_at call with x in [100,300] and y in [100,300] (inside the blue square)',
    );
  },
};
