/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import path from 'node:path';
import {describe, it} from 'node:test';

import {
  extractJson,
  findUid,
  htmlFileAsDataUrl,
  toolText,
  withClient,
} from './harness.js';

const smokeHtml = path.join(
  process.cwd(),
  'tests/e2e/comparison/fixtures/tool-smoke.html',
);

describe('e2e MCP tool coverage (default server)', {timeout: 120_000}, () => {
  it('pages, navigation, snapshot, console, network', async () => {
    await withClient(async client => {
      const url = await htmlFileAsDataUrl(smokeHtml);
      await client.callTool({name: 'list_pages', arguments: {}});
      await client.callTool({name: 'navigate_page', arguments: {url}});
      await client.callTool({
        name: 'resize_page',
        arguments: {width: 900, height: 700},
      });
      const snap = toolText(
        await client.callTool({name: 'take_snapshot', arguments: {}}),
      );
      const uidGo = findUid(snap, 'go-smoke');
      await client.callTool({
        name: 'wait_for',
        arguments: {text: ['go-smoke'], timeout: 5000},
      });
      await client.callTool({
        name: 'list_console_messages',
        arguments: {},
      });
      await client.callTool({
        name: 'list_network_requests',
        arguments: {},
      });
      await client.callTool({
        name: 'take_screenshot',
        arguments: {format: 'png'},
      });
      await client.callTool({
        name: 'emulate',
        arguments: {viewport: {width: 800, height: 600}},
      });
      await client.callTool({
        name: 'click',
        arguments: {uid: uidGo},
      });
      await client.callTool({
        name: 'hover',
        arguments: {uid: uidGo},
      });
      const fieldUid = findUid(
        toolText(await client.callTool({name: 'take_snapshot', arguments: {}})),
        'field-smoke',
      );
      await client.callTool({
        name: 'fill',
        arguments: {uid: fieldUid, value: 'x'},
      });
      await client.callTool({
        name: 'type_text',
        arguments: {uid: fieldUid, text: 'y'},
      });
      await client.callTool({
        name: 'press_key',
        arguments: {key: 'Enter'},
      });
    });
  });

  it(
    'styles, geometry, performance, memory, lighthouse',
    {timeout: 120_000},
    async () => {
      await withClient(async client => {
        const url = await htmlFileAsDataUrl(smokeHtml);
        await client.callTool({name: 'navigate_page', arguments: {url}});
        const snap = toolText(
          await client.callTool({name: 'take_snapshot', arguments: {}}),
        );
        const uid = findUid(snap, 'go-smoke');
        const cs = extractJson(
          toolText(
            await client.callTool({
              name: 'get_computed_styles',
              arguments: {uid, properties: ['display'], includeSources: true},
            }),
          ),
        ) as {computed: Record<string, string>};
        assert.ok(cs.computed.display);

        const batch = extractJson(
          toolText(
            await client.callTool({
              name: 'get_computed_styles_batch',
              arguments: {uids: [uid], properties: ['display']},
            }),
          ),
        ) as Record<string, {display: string}>;
        assert.ok(Object.keys(batch).length >= 1);

        extractJson(
          toolText(
            await client.callTool({name: 'get_box_model', arguments: {uid}}),
          ),
        );

        extractJson(
          toolText(
            await client.callTool({name: 'get_visibility', arguments: {uid}}),
          ),
        );

        const snap2 = toolText(
          await client.callTool({name: 'take_snapshot', arguments: {}}),
        );
        const uidField = findUid(snap2, 'field-smoke');
        extractJson(
          toolText(
            await client.callTool({
              name: 'diff_computed_styles',
              arguments: {uidA: uid, uidB: uidField, properties: ['display']},
            }),
          ),
        );

        await client.callTool({
          name: 'save_computed_styles_snapshot',
          arguments: {name: 'cov-snap', uids: [uid], properties: ['display']},
        });
        extractJson(
          toolText(
            await client.callTool({
              name: 'diff_computed_styles_snapshot',
              arguments: {name: 'cov-snap', uid, properties: ['display']},
            }),
          ),
        );

        await client.callTool({
          name: 'highlight_elements_for_styles',
          arguments: {uids: [uid]},
        });

        await client.callTool({
          name: 'performance_start_trace',
          arguments: {reload: false},
        });
        await client.callTool({
          name: 'performance_stop_trace',
          arguments: {},
        });

        await client.callTool({
          name: 'lighthouse_audit',
          arguments: {mode: 'snapshot', device: 'desktop'},
        });

        await client.callTool({name: 'take_memory_snapshot', arguments: {}});
      });
    },
  );

  it('new_page lists additional tab', async () => {
    await withClient(async client => {
      const url = await htmlFileAsDataUrl(smokeHtml);
      await client.callTool({name: 'navigate_page', arguments: {url}});
      const np = await client.callTool({
        name: 'new_page',
        arguments: {url: 'about:blank'},
      });
      assert.ok(toolText(np).length > 0);
      const pages = await client.callTool({name: 'list_pages', arguments: {}});
      assert.ok(toolText(pages).length > 0);
    });
  });
});

describe('e2e MCP tool coverage (interop flags)', () => {
  it('get_tab_id', async () => {
    await withClient(
      async client => {
        const r = await client.callTool({name: 'get_tab_id', arguments: {}});
        assert.ok(toolText(r).length > 0);
      },
      ['--experimental-interop-tools'],
    );
  });
});
