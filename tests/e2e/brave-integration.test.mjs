/**
 * Brave DevTools MCP — Integration Test Suite
 *
 * Tests all 29 MCP tools against a running Brave instance.
 *
 * Prerequisites:
 *   1. Build the project:  npm run build
 *   2. Launch Brave with remote debugging:
 *        open -a "Brave Browser" --args --remote-debugging-port=9222
 *   3. Run:  npm run test:brave
 *
 * The test opens a local HTML fixture, exercises every tool, then cleans up.
 */

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.resolve(__dirname, '../../build/src/bin/brave-devtools-mcp.js');
const FIXTURE_PATH = path.resolve(__dirname, 'brave-integration.test.html');
const TMP = os.tmpdir();

const TOOL_TIMEOUT_MS = 30_000;
const PERF_TIMEOUT_MS = 60_000;

async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [
    SERVER_PATH,
    '--browserUrl', 'http://127.0.0.1:9222',
    '--no-usage-statistics',
    '--no-performance-crux',
  ],
});

const client = new Client({name: 'brave-integration-test', version: '1.0.0'});
await client.connect(transport);

const passed = [];
const failed = [];
const skipped = [];

async function test(name, fn, timeoutMs = TOOL_TIMEOUT_MS) {
  try {
    const result = await withTimeout(fn(), timeoutMs, name);
    const text = result?.content?.map(c => c.text || '[image]').join(' ') || '';
    if (result?.isError) {
      failed.push({name, error: text.slice(0, 300)});
      console.log(`  FAIL  ${name}`);
      console.log(`        ${text.slice(0, 200)}`);
    } else {
      passed.push(name);
      console.log(`  PASS  ${name}`);
    }
    return {result, text};
  } catch (e) {
    failed.push({name, error: e.message?.slice(0, 300)});
    console.log(`  FAIL  ${name}`);
    console.log(`        ${e.message?.slice(0, 200)}`);
    return {result: null, text: ''};
  }
}

function skip(name, reason) {
  skipped.push({name, reason});
  console.log(`  SKIP  ${name}: ${reason}`);
}

function findUid(snapText, label) {
  for (const line of snapText.split('\n')) {
    if (line.includes(label)) {
      const m = line.match(/uid=(\S+)/);
      if (m) return m[1];
    }
  }
  return null;
}

async function call(name, args) {
  return client.callTool({name, arguments: args});
}

console.log('');
console.log('================================================');
console.log('  BRAVE DEVTOOLS MCP — INTEGRATION TEST SUITE');
console.log('================================================');
console.log('');

let testPageId = null;

// ── 1. Navigation & Pages (tools: new_page, list_pages, select_page, navigate_page) ──

console.log('--- Navigation & Pages ---');

await test('01. new_page', () =>
  call('new_page', {url: `file://${FIXTURE_PATH}`})
);

{
  const {text} = await test('02. list_pages', () =>
    call('list_pages', {})
  );
  const match = text.match(/(\d+):.*brave-integration\.test\.html/);
  testPageId = match ? parseInt(match[1]) : null;
  if (testPageId === null) {
    console.log('  WARN  Could not find test page ID in list_pages output');
  }
}

if (testPageId !== null) {
  await test('03. select_page', () =>
    call('select_page', {pageId: testPageId})
  );
} else {
  skip('03. select_page', 'test page not found');
}

await test('04. navigate_page (reload)', () =>
  call('navigate_page', {type: 'reload'})
);

await new Promise(r => setTimeout(r, 1500));

// ── 2. Snapshots & Screenshots (tools: take_snapshot, take_screenshot) ──

console.log('\n--- Snapshots & Screenshots ---');

let snapText = '';
{
  const {text} = await test('05. take_snapshot', () =>
    call('take_snapshot', {})
  );
  snapText = text;
}

await test('06. take_screenshot (png)', () =>
  call('take_screenshot', {filePath: path.join(TMP, 'brave-mcp-test.png')})
);

await test('07. take_screenshot (jpeg + quality)', () =>
  call('take_screenshot', {format: 'jpeg', quality: 80, filePath: path.join(TMP, 'brave-mcp-test.jpg')})
);

await test('08. take_screenshot (fullPage)', () =>
  call('take_screenshot', {fullPage: true, filePath: path.join(TMP, 'brave-mcp-test-full.png')})
);

// ── 3. Script Execution (tool: evaluate_script) ──

console.log('\n--- Script Execution ---');

await test('09. evaluate_script (return value)', () =>
  call('evaluate_script', {function: '() => document.title'})
);

await test('10. evaluate_script (DOM access)', () =>
  call('evaluate_script', {function: '() => document.getElementById("heading").textContent'})
);

// ── 4. Input Automation (tools: click, fill, fill_form, hover, type_text, press_key, drag, upload_file) ──

console.log('\n--- Input Automation ---');

const nameUid = findUid(snapText, 'textbox "Name"');
const emailUid = findUid(snapText, 'textbox "Email"');
const browserSelectUid = findUid(snapText, 'combobox "Browser"') || findUid(snapText, 'combobox');
const headingUid = findUid(snapText, 'heading "Brave DevTools MCP Test"');
const dragUid = findUid(snapText, 'StaticText "Drag"');
const dropUid = findUid(snapText, 'StaticText "Drop"');
const submitUid = findUid(snapText, 'button "Submit"');

if (nameUid) {
  await test('11. click', () =>
    call('click', {uid: nameUid})
  );
  await test('12. fill (text input)', () =>
    call('fill', {uid: nameUid, value: 'Test User'})
  );
} else {
  skip('11. click', 'name input uid not found in snapshot');
  skip('12. fill (text input)', 'name input uid not found in snapshot');
}

if (emailUid) {
  await test('13. fill (email input)', () =>
    call('fill', {uid: emailUid, value: 'test@brave.com'})
  );
} else {
  skip('13. fill (email input)', 'email input uid not found in snapshot');
}

if (browserSelectUid) {
  await test('14. fill (select)', () =>
    call('fill', {uid: browserSelectUid, value: 'Chrome'})
  );
} else {
  skip('14. fill (select)', 'select uid not found in snapshot');
}

if (nameUid && emailUid) {
  await test('15. fill_form (multi-field)', () =>
    call('fill_form', {
      elements: [
        {uid: nameUid, value: 'Emanuele'},
        {uid: emailUid, value: 'ema@brave.test'},
      ],
    })
  );
} else {
  skip('15. fill_form (multi-field)', 'form input uids not found');
}

if (headingUid) {
  await test('16. hover', () =>
    call('hover', {uid: headingUid})
  );
} else {
  skip('16. hover', 'heading uid not found');
}

await test('17. type_text', () =>
  call('type_text', {text: 'Hello Brave!'})
);

await test('18. press_key (single)', () =>
  call('press_key', {key: 'Tab'})
);

await test('19. press_key (combo)', () =>
  call('press_key', {key: 'Control+A'})
);

if (dragUid && dropUid) {
  await test('20. drag', () =>
    call('drag', {from_uid: dragUid, to_uid: dropUid})
  );
} else {
  skip('20. drag', `drag/drop uids not found (drag=${dragUid}, drop=${dropUid})`);
}

const fileUid = findUid(snapText, 'button "Choose File"') || findUid(snapText, 'fileupload');

if (fileUid) {
  await test('21. upload_file', () =>
    call('upload_file', {uid: fileUid, filePath: FIXTURE_PATH})
  );
} else {
  skip('21. upload_file', 'file input uid not found in snapshot');
}

// ── 5. Dialog (tool: handle_dialog) ──

console.log('\n--- Dialog ---');

// Trigger an alert with a long delay so the evaluate_script returns first,
// then wait for the dialog to appear before calling handle_dialog.
await call('evaluate_script', {function: '() => { window.__dialogTimer = setTimeout(() => alert("Test dialog"), 500); return "timer set"; }'});
await new Promise(r => setTimeout(r, 2000));

await test('22. handle_dialog (accept)', () =>
  call('handle_dialog', {action: 'accept'})
);

// ── 6. Wait (tool: wait_for) ──

console.log('\n--- Wait ---');

await test('23. wait_for', () =>
  call('wait_for', {text: ['Brave DevTools MCP Test'], timeout: 5000})
);

// ── 7. Console (tools: list_console_messages, get_console_message) ──

console.log('\n--- Console ---');

{
  const {text} = await test('24. list_console_messages', () =>
    call('list_console_messages', {})
  );
  const msgMatch = text.match(/msgid=(\d+)/);
  if (msgMatch) {
    await test('25. get_console_message', () =>
      call('get_console_message', {msgid: parseInt(msgMatch[1])})
    );
  } else {
    skip('25. get_console_message', 'no console messages captured');
  }
}

// ── 8. Network (tools: list_network_requests, get_network_request) ──

console.log('\n--- Network ---');

{
  const {text} = await test('26. list_network_requests', () =>
    call('list_network_requests', {})
  );
  const reqMatch = text.match(/reqid=(\d+)/);
  if (reqMatch) {
    await test('27. get_network_request', () =>
      call('get_network_request', {reqid: parseInt(reqMatch[1])})
    );
  } else {
    skip('27. get_network_request', 'no network requests captured');
  }
}

// ── 9. Emulation (tools: emulate, resize_page) ──

console.log('\n--- Emulation ---');

await test('28. emulate (dark mode)', () =>
  call('emulate', {colorScheme: 'dark'})
);

await test('29. emulate (reset)', () =>
  call('emulate', {colorScheme: 'auto'})
);

await test('30. resize_page', () =>
  call('resize_page', {width: 1024, height: 768})
);

// ── 10. Performance (tools: performance_start_trace, performance_stop_trace, performance_analyze_insight) ──
// Navigate to a real page so the trace produces network/rendering insights.

console.log('\n--- Performance ---');

await call('navigate_page', {type: 'url', url: 'https://example.com'});
await new Promise(r => setTimeout(r, 2000));

const tracePath = path.join(TMP, 'brave-mcp-test-trace.json');

// start_trace with autoStop returns the trace summary including insight set IDs.
// stop_trace returns only the visualization image.
{
  const {text: startText} = await test('31. performance_start_trace', () =>
    call('performance_start_trace', {reload: true, autoStop: true, filePath: tracePath}),
    PERF_TIMEOUT_MS,
  );

  await test('32. performance_stop_trace', () =>
    call('performance_stop_trace', {filePath: path.join(TMP, 'brave-mcp-test-trace.json.gz')}),
    PERF_TIMEOUT_MS,
  );

  // The start_trace output contains: "## insight set id: NAVIGATION_0"
  const insightSetMatch = startText.match(/insight set id:\s*(\S+)/);
  // Available insight names from the trace (e.g., LCPBreakdown, NetworkDependencyTree)
  const insightNameMatch = startText.match(/insight name:\s*(\S+)/);

  if (insightSetMatch && insightNameMatch) {
    await test('33. performance_analyze_insight', () =>
      call('performance_analyze_insight', {
        insightSetId: insightSetMatch[1],
        insightName: insightNameMatch[1],
      }),
      PERF_TIMEOUT_MS,
    );
  } else {
    failed.push({name: '33. performance_analyze_insight', error: `insight set or name not found (set=${insightSetMatch?.[1]}, name=${insightNameMatch?.[1]})`});
    console.log('  FAIL  33. performance_analyze_insight');
    console.log(`        insight set or name not found in trace output`);
  }
}

// Navigate back to test fixture for remaining tests
await call('navigate_page', {type: 'url', url: `file://${FIXTURE_PATH}`});
await new Promise(r => setTimeout(r, 1000));

// ── 11. Memory (tool: take_memory_snapshot) ──

console.log('\n--- Memory ---');

const heapPath = path.join(TMP, 'brave-mcp-test-heap.heapsnapshot');
await test('34. take_memory_snapshot', () =>
  call('take_memory_snapshot', {filePath: heapPath}),
  PERF_TIMEOUT_MS,
);

// ── 12. Lighthouse (tool: lighthouse_audit) ──

console.log('\n--- Lighthouse ---');

await test('35. lighthouse_audit', () =>
  call('lighthouse_audit', {mode: 'snapshot', device: 'desktop', outputDirPath: TMP}),
  PERF_TIMEOUT_MS,
);

// ── 13. Cleanup (tool: close_page) ──

console.log('\n--- Cleanup ---');

if (testPageId !== null) {
  await test('36. close_page', () =>
    call('close_page', {pageId: testPageId})
  );
}

for (const f of [
  path.join(TMP, 'brave-mcp-test.png'),
  path.join(TMP, 'brave-mcp-test.jpg'),
  path.join(TMP, 'brave-mcp-test-full.png'),
  tracePath,
  path.join(TMP, 'brave-mcp-test-trace.json.gz'),
  heapPath,
]) {
  try { fs.unlinkSync(f); } catch { /* ignore */ }
}

// ── Report ──────────────────────────────────────

const total = passed.length + failed.length + skipped.length;
console.log('');
console.log('================================================');
console.log(`  RESULTS: ${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped (${total} total)`);
console.log('================================================');

if (failed.length > 0) {
  console.log('\nFailed:');
  for (const f of failed) {
    console.log(`  ${f.name}`);
    console.log(`    ${f.error.slice(0, 250)}`);
  }
}

if (skipped.length > 0) {
  console.log('\nSkipped:');
  for (const s of skipped) {
    console.log(`  ${s.name}: ${s.reason}`);
  }
}

console.log('');
await client.close();
process.exit(failed.length > 0 ? 1 : 0);
