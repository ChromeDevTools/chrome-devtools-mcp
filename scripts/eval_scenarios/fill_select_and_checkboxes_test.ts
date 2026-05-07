/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

import type {TestScenario} from '../eval_gemini.ts';

export const scenario: TestScenario = {
  prompt:
    'Go to <TEST_URL>, fill the form with size = 2 CPUs and components = [docker, nginx].',
  maxTurns: 4, // allow for at least one extra turn to verify there are no extra clicks after fill_form
  htmlRoute: {
    path: '/input_test.html',
    htmlContent: `
      <form action="/post" method="POST">
        <div>
          <label for="size">CPU/Memory size:</label>
          <select id="size" name="size" required>
            <option value="small">1 vCPU, 2GB RAM</option>
            <option value="medium">2 vCPU, 4GB RAM</option>
            <option value="large">4 vCPU, 8GB RAM</option>
          </select>
        </div>
        <br>
        <div>
          <p>Pre-installed components:</p>
          <input type="checkbox" id="docker" name="components" value="docker">
          <label for="docker">Docker</label><br>
          <input type="checkbox" id="nodejs" name="components" value="nodejs">
          <label for="nodejs">Node.js</label><br>
          <input type="checkbox" id="python" name="components" value="python">
          <label for="python">Python</label><br>
          <input type="checkbox" id="nginx" name="components" value="nginx">
          <label for="nginx">Nginx</label>
        </div>
        <button type="submit">Spawn Server</button>
      </form>
    `,
  },
  expectations: calls => {
    assert.ok(calls.length >= 3, 'Not enough calls made');
    assert.ok(
      calls[0].name === 'navigate_page' || calls[0].name === 'new_page',
    );
    assert.strictEqual(calls[1].name, 'take_snapshot');
    assert.strictEqual(calls[2].name, 'fill_form');

    const elements = calls[2].args.elements as Array<{
      uid: string;
      value: string;
    }>;
    assert.strictEqual(
      elements.length,
      3,
      'fill_form should be used with all form elements at once',
    );

    const uids = new Set(elements.map(e => e.uid));
    assert.strictEqual(
      uids.size,
      3,
      'fill_form should target three distinct elements',
    );

    const values = elements.map(e => e.value).sort();
    assert.deepStrictEqual(
      values,
      ['2 vCPU, 4GB RAM', 'true', 'true'],
      'fill_form should be used with correct values',
    );

    const submitUid = '1_15';

    const extraFormInteractions = calls
      .slice(3)
      .filter(
        c => ['fill', 'click'].includes(c.name) && c.args.uid !== submitUid,
      );
    assert.deepEqual(
      extraFormInteractions.length,
      0,
      'No extra clicks and fills after fill_form',
    );
  },
};
