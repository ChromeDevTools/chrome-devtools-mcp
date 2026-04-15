/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import path from 'node:path';
import {describe, it, before} from 'node:test';
import {fileURLToPath} from 'node:url';

import {generateAll} from './generate-fixtures.js';
import {
  extractJson,
  findUid,
  htmlFileAsDataUrl,
  toolText,
  withClient,
} from './harness.js';
import {SCENARIOS} from './scenarios-data.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

/** Per-test: global runner uses --test-timeout=60000; each case spins up MCP. */
const perTestMs = 180_000;

describe('e2e comparison generated A/B pages', {timeout: 600_000}, () => {
  before(
    async () => {
      await generateAll();
    },
    {timeout: 600_000},
  );

  for (const s of SCENARIOS) {
    it(`diff combined ${s.id}`, {timeout: perTestMs}, async () => {
      await withClient(async client => {
        const url = await htmlFileAsDataUrl(
          path.join(dir, 'generated/pairs', s.id, 'combined.html'),
        );
        await client.callTool({
          name: 'navigate_page',
          arguments: {url},
        });
        const snapRes = await client.callTool({
          name: 'take_snapshot',
          arguments: {},
        });
        const snap = toolText(snapRes);
        const uidA = findUid(snap, 'variant-a');
        const uidB = findUid(snap, 'variant-b');

        const diffArgs: Record<string, unknown> = {
          uidA,
          uidB,
          properties: [s.property],
        };
        if (s.compareGeometry) {
          diffArgs.compareGeometry = true;
        }
        const diffRes = await client.callTool({
          name: 'diff_computed_styles',
          arguments: diffArgs,
        });
        const diff = extractJson(toolText(diffRes)) as {
          styleChanges: Array<{
            property: string;
            before: string;
            after: string;
          }>;
        };
        const row = diff.styleChanges.find(x => x.property === s.property);
        assert.ok(row, `missing ${s.property} in ${s.id}`);
        assert.notStrictEqual(row?.before, row?.after);

        const aRes = await client.callTool({
          name: 'get_computed_styles',
          arguments: {uid: uidA, properties: [s.property]},
        });
        const bRes = await client.callTool({
          name: 'get_computed_styles',
          arguments: {uid: uidB, properties: [s.property]},
        });
        const aj = extractJson(toolText(aRes)) as {
          computed: Record<string, string>;
        };
        const bj = extractJson(toolText(bRes)) as {
          computed: Record<string, string>;
        };
        assert.strictEqual(row?.before, aj.computed[s.property]);
        assert.strictEqual(row?.after, bj.computed[s.property]);
      });
    });
  }

  it('sequential standalone A and B pages', {timeout: perTestMs}, async () => {
    const sid = 'css-color';
    const base = path.join(dir, 'generated/pairs', sid);
    const ua = await htmlFileAsDataUrl(path.join(base, 'a.html'));
    const ub = await htmlFileAsDataUrl(path.join(base, 'b.html'));

    let ca: {computed: Record<string, string>};
    await withClient(async client => {
      await client.callTool({name: 'navigate_page', arguments: {url: ua}});
      const snap = toolText(
        await client.callTool({name: 'take_snapshot', arguments: {}}),
      );
      const uidA = findUid(snap, 'variant-a');
      ca = extractJson(
        toolText(
          await client.callTool({
            name: 'get_computed_styles',
            arguments: {uid: uidA, properties: ['color']},
          }),
        ),
      ) as {computed: Record<string, string>};
    });

    let cb: {computed: Record<string, string>};
    await withClient(async client => {
      await client.callTool({name: 'navigate_page', arguments: {url: ub}});
      const snap = toolText(
        await client.callTool({name: 'take_snapshot', arguments: {}}),
      );
      const uidB = findUid(snap, 'variant-b');
      cb = extractJson(
        toolText(
          await client.callTool({
            name: 'get_computed_styles',
            arguments: {uid: uidB, properties: ['color']},
          }),
        ),
      ) as {computed: Record<string, string>};
    });

    assert.notStrictEqual(ca!.computed.color, cb!.computed.color);
  });

  it(
    'save and diff_computed_styles_snapshot on generated page',
    {timeout: perTestMs},
    async () => {
      await withClient(async client => {
        const url = await htmlFileAsDataUrl(
          path.join(dir, 'generated/pairs', 'css-width', 'combined.html'),
        );
        await client.callTool({name: 'navigate_page', arguments: {url}});
        const snap = toolText(
          await client.callTool({name: 'take_snapshot', arguments: {}}),
        );
        const uidA = findUid(snap, 'variant-a');
        await client.callTool({
          name: 'save_computed_styles_snapshot',
          arguments: {
            name: 'fsnap-width',
            uids: [uidA],
            properties: ['width'],
          },
        });
        await client.callTool({
          name: 'evaluate_script',
          arguments: {
            function: String((el: Element) => {
              (el as HTMLElement).style.setProperty(
                'width',
                '200px',
                'important',
              );
              return true;
            }),
            args: [uidA],
          },
        });
        const diffRes = await client.callTool({
          name: 'diff_computed_styles_snapshot',
          arguments: {
            name: 'fsnap-width',
            uid: uidA,
            properties: ['width'],
          },
        });
        const dj = extractJson(toolText(diffRes)) as {
          styleChanges: Array<{
            property: string;
            before: string;
            after: string;
          }>;
        };
        const ch = dj.styleChanges.find(x => x.property === 'width');
        assert.ok(ch);
        assert.notStrictEqual(ch?.before, ch?.after);
      });
    },
  );
});
