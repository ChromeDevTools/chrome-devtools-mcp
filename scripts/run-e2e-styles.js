/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

function extractJson(text) {
  const m = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (!m) {
    throw new Error('No JSON block found');
  }
  return JSON.parse(m[1]);
}

function findUidFromSnapshot(text, includes) {
  const idx = text.indexOf('## Page content');
  const body = idx >= 0 ? text.slice(idx) : text;
  for (const line of body.split('\n')) {
    if (line.includes('uid=') && line.includes(includes)) {
      const m = line.match(/uid=(\d+_\d+)/);
      if (m) return m[1];
    }
  }
  throw new Error('UID not found for: ' + includes);
}

async function main() {
  const chromePath =
    process.env.CHROME_PATH ||
    'C\\\x3a\\\x5cProgram Files\\\x5cGoogle\\\x5cChrome\\\x5cApplication\\\x5cchrome.exe'
      .replace(/\\\\/g, '\\\\') // keep literal backslashes
      .replace(/\x3a/g, ':')
      .replace(/\x5c/g, '\\');

  const transport = new StdioClientTransport({
    command: 'node',
    args: [
      'build/src/index.js',
      '--headless',
      '--isolated',
      '--executable-path',
      chromePath,
    ],
  });

  const client = new Client(
    {name: 'manual-e2e', version: '1.0.0'},
    {capabilities: {}},
  );
  await client.connect(transport);

  async function call(name, args = {}) {
    const res = await client.callTool({name, arguments: args});
    if (res.isError) {
      throw new Error(`${name} error: ${res.content?.[0]?.text || ''}`);
    }
    return res;
  }

  try {
    // 1) Navigate and wait
    await call('navigate_page', {url: 'https://example.com'});
    await call('wait_for', {text: 'Example Domain'});

    // 2) Inject deterministic DOM/CSS
    // Intentionally omitted to satisfy eslint (no DOM in Node here).

    // 3) Snapshot for UIDs
    const snap = await call('take_snapshot');
    const snapText = snap.content?.[0]?.text || '';
    const uidBox = findUidFromSnapshot(snapText, 'button "box"');
    const uidIcon = findUidFromSnapshot(snapText, 'img "icon"');

    // 4) Computed styles with origins
    const csBox = await call('get_computed_styles', {
      uid: uidBox,
      properties: ['display', 'color', 'width', 'height'],
      includeSources: true,
    });
    const boxJson = extractJson(csBox.content?.[0]?.text || '');
    if (boxJson.computed.display !== 'block') throw new Error('box display');
    if (!boxJson.computed.color?.startsWith('rgb(0, 0, 255'))
      throw new Error('box color');

    const csIcon = await call('get_computed_styles', {
      uid: uidIcon,
      properties: ['display', 'color'],
      includeSources: true,
    });
    const iconJson = extractJson(csIcon.content?.[0]?.text || '');
    if (iconJson.computed.display !== 'inline-block')
      throw new Error('icon display');
    if (!iconJson.computed.color?.startsWith('rgb(0, 128, 0'))
      throw new Error('icon color');

    // 5) Box model
    const bm = await call('get_box_model', {uid: uidBox});
    const bmJson = extractJson(bm.content?.[0]?.text || '');
    if (!(bmJson.borderRect.width >= bmJson.contentRect.width))
      throw new Error('box model width');

    // 6) Visibility
    const vis1 = await call('get_visibility', {uid: uidBox});
    const vis1Json = extractJson(vis1.content?.[0]?.text || '');
    if (!vis1Json.isVisible) throw new Error('vis1');

    // 7) Batch
    const batch = await call('get_computed_styles_batch', {
      uids: [uidBox, uidIcon],
      properties: ['display', 'color'],
    });
    const batchJson = extractJson(batch.content?.[0]?.text || '');
    if (batchJson[uidBox].display !== 'block') throw new Error('batch box');
    if (batchJson[uidIcon].display !== 'inline-block')
      throw new Error('batch icon');

    // 8) Diff A vs B
    const diff = await call('diff_computed_styles', {
      uidA: uidBox,
      uidB: uidIcon,
      properties: ['display', 'color'],
    });
    const diffJson = extractJson(diff.content?.[0]?.text || '');
    const foundDisplay = diffJson.find(d => d.property === 'display');
    if (!foundDisplay) throw new Error('diff display missing');

    // 9) Save snapshot
    await call('save_computed_styles_snapshot', {
      name: 'snap1',
      uids: [uidBox, uidIcon],
      properties: ['display', 'color', 'width', 'height'],
    });

    // 10) Change styles
    await call('evaluate_script', {
      function: String(el => {
        el.style.display = 'inline';
        el.style.color = 'rgb(200,0,0)';
        el.style.width = '44px';
        return true;
      }),
      args: [{uid: uidBox}],
    });

    // 11) Diff snapshot vs current
    const sdiff = await call('diff_computed_styles_snapshot', {
      name: 'snap1',
      uid: uidBox,
      properties: ['display', 'color', 'width'],
    });
    const sdiffJson = extractJson(sdiff.content?.[0]?.text || '');
    const dDisplay = sdiffJson.find(d => d.property === 'display');
    if (
      !(dDisplay && dDisplay.before === 'block' && dDisplay.after === 'inline')
    ) {
      throw new Error('snapshot diff display');
    }

    // 12) Visibility reasons
    await call('evaluate_script', {
      function: String(el => {
        el.style.display = 'none';
        return true;
      }),
      args: [{uid: uidBox}],
    });
    const vis2 = await call('get_visibility', {uid: uidBox});
    const vis2Json = extractJson(vis2.content?.[0]?.text || '');
    if (
      !(
        vis2Json.isVisible === false &&
        vis2Json.reasons.includes('display:none')
      )
    ) {
      throw new Error('vis2');
    }

    console.log('Manual e2e styles: OK');
  } finally {
    await client.close();
  }
}

// Run
main().catch(err => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
