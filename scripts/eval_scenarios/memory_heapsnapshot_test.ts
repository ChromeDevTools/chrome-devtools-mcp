/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';

import type {TestScenario} from '../eval_gemini.ts';

const heapSnapshotPath = path.join(os.tmpdir(), 'eval-heap.heapsnapshot');

export const scenario: TestScenario = {
  prompt: `Navigate to <TEST_URL>, take a V8 heap snapshot to ${heapSnapshotPath}, and inspect the heap snapshot summary to report the total size and top constructors.`,
  maxTurns: 5,
  serverArgs: ['--allow-unrestricted-paths', '--memory-debugging'],
  htmlRoute: {
    path: '/memory_leak_test.html',
    htmlContent: `
      <!DOCTYPE html>
      <html>
        <head><title>Memory Leak Test</title></head>
        <body>
          <h1>Checkout Cart Memory Test</h1>
          <script>
            class DetachedCheckoutCartListener {
              constructor(id) {
                this.id = id;
                this.payload = 'leak_payload_' + id;
              }
            }
            window.__leakedListeners = Array.from(
              {length: 2000},
              (_, i) => new DetachedCheckoutCartListener(i),
            );
          </script>
        </body>
      </html>
    `,
  },
  expectations: result => {
    result.assertCapabilityEnabled('memory');
    result.consumePageNavigation();
    const snapshotCall = result.calls.find(c => c.name === 'take_heapsnapshot');
    assert.ok(snapshotCall, 'Expected take_heapsnapshot to be called');
    const summaryCall = result.calls.find(
      c =>
        c.name === 'get_heapsnapshot_summary' ||
        c.name === 'get_heapsnapshot_details' ||
        c.name === 'get_heapsnapshot_class_nodes',
    );
    assert.ok(
      summaryCall,
      'Expected a heap snapshot inspection tool (get_heapsnapshot_summary/details/class_nodes) to be called',
    );
  },
};
