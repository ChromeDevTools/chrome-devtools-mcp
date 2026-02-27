/**
 * Functional test for chrome-devtools-mcp debugger tools.
 * Tests CDP Debugger domain commands that our MCP tools wrap.
 * 
 * Key: Uses TWO CDP sessions - one for debugger, one for triggering actions.
 * This avoids the deadlock where Runtime.evaluate blocks on the same session
 * that has the debugger paused.
 */
import puppeteer from 'puppeteer-core';

const CHROME_URL = 'http://127.0.0.1:9222';
let browser, page, dbgSession, actionSession;
let passed = 0, failed = 0;

const debuggerState = {
  enabled: false,
  paused: null,
  breakpoints: new Map(),
  scripts: new Map(),
};

function log(msg) { console.log(`  ${msg}`); }
function pass(name) { passed++; console.log(`✅ ${name}`); }
function fail(name, err) { failed++; console.log(`❌ ${name}: ${err}`); }

function waitForPause(timeout = 3000) {
  return new Promise((resolve, reject) => {
    if (debuggerState.paused) return resolve(debuggerState.paused);
    const start = Date.now();
    const check = setInterval(() => {
      if (debuggerState.paused) { clearInterval(check); resolve(debuggerState.paused); }
      else if (Date.now() - start > timeout) { clearInterval(check); reject(new Error('Timeout waiting for pause')); }
    }, 50);
  });
}

function waitForResume(timeout = 3000) {
  return new Promise((resolve, reject) => {
    if (!debuggerState.paused) return resolve();
    const start = Date.now();
    const check = setInterval(() => {
      if (!debuggerState.paused) { clearInterval(check); resolve(); }
      else if (Date.now() - start > timeout) { clearInterval(check); reject(new Error('Timeout waiting for resume')); }
    }, 50);
  });
}

async function setup() {
  console.log('\n🔧 Connecting to Chrome...');
  browser = await puppeteer.connect({ browserURL: CHROME_URL });
  page = await browser.newPage();
  // Two separate CDP sessions to avoid deadlock
  dbgSession = await page.createCDPSession();
  actionSession = await page.createCDPSession();
  console.log('🔧 Connected (2 CDP sessions).\n');
}

async function teardown() {
  try { await dbgSession.send('Debugger.disable'); } catch {}
  try { await dbgSession.detach(); } catch {}
  try { await actionSession.detach(); } catch {}
  try { await page.close(); } catch {}
  browser.disconnect();
}

// ─── Test 1: debugger_enable + list_scripts ───
async function testEnableAndListScripts() {
  console.log('── Test 1: debugger_enable + list_scripts ──');

  dbgSession.on('Debugger.scriptParsed', (params) => {
    const url = params.url ?? '';
    if (!url) return;
    debuggerState.scripts.set(params.scriptId, {
      scriptId: params.scriptId, url,
      startLine: params.startLine ?? 0, startColumn: params.startColumn ?? 0,
      endLine: params.endLine ?? 0, endColumn: params.endColumn ?? 0,
    });
  });

  dbgSession.on('Debugger.paused', (params) => {
    debuggerState.paused = {
      callFrames: params.callFrames.map(f => ({
        callFrameId: f.callFrameId,
        functionName: f.functionName,
        url: f.url ?? '',
        lineNumber: f.location.lineNumber ?? 0,
        columnNumber: f.location.columnNumber ?? 0,
        scopeChain: f.scopeChain.map(s => ({ type: s.type, name: s.name, objectId: s.object.objectId })),
      })),
      reason: params.reason ?? 'unknown',
      hitBreakpoints: params.hitBreakpoints,
    };
  });

  dbgSession.on('Debugger.resumed', () => { debuggerState.paused = null; });

  try {
    await dbgSession.send('Debugger.enable');
    debuggerState.enabled = true;
    pass('debugger_enable');
  } catch (e) {
    fail('debugger_enable', e.message);
    return;
  }

  await page.goto('data:text/html,<script>function testFunc(x){return x*2;}</script>');
  await new Promise(r => setTimeout(r, 500));

  const scripts = [...debuggerState.scripts.values()];
  if (scripts.length > 0) {
    pass(`list_scripts (${scripts.length} scripts)`);
    for (const s of scripts.slice(0, 3)) log(`[${s.scriptId}] ${s.url.substring(0, 80)}`);
  } else {
    fail('list_scripts', 'No scripts found');
  }
}

// ─── Test 2: set_breakpoint + trigger + get_paused_state ───
async function testBreakpointAndPause() {
  console.log('\n── Test 2: set_breakpoint + trigger + get_paused_state ──');

  const testHTML = `<html><body>
<script>
function myFunc(a, b) {
  let sum = a + b;
  let product = a * b;
  return sum + product;
}
</script>
<button id="btn" onclick="myFunc(3,7)">Run</button>
</body></html>`;

  debuggerState.scripts.clear();
  await page.goto(`data:text/html,${encodeURIComponent(testHTML)}`);
  await new Promise(r => setTimeout(r, 500));

  // Set breakpoint at line 3 (let sum = a + b)
  const pageUrl = page.url();
  try {
    const result = await dbgSession.send('Debugger.setBreakpointByUrl', {
      lineNumber: 3, url: pageUrl,
    });
    const bpId = result.breakpointId;
    debuggerState.breakpoints.set(bpId, { breakpointId: bpId, url: pageUrl, lineNumber: 3, locations: result.locations });
    pass(`set_breakpoint (id: ${bpId.substring(0, 40)}...)`);
    for (const loc of result.locations) {
      log(`Resolved: scriptId=${loc.scriptId} line=${loc.lineNumber} col=${loc.columnNumber}`);
    }
  } catch (e) {
    fail('set_breakpoint', e.message);
    return;
  }

  // Trigger via SEPARATE session (avoids deadlock!)
  log('Triggering breakpoint via action session...');
  actionSession.send('Runtime.evaluate', {
    expression: 'document.getElementById("btn").click()',
  }).catch(() => {}); // Fire-and-forget

  try {
    await waitForPause(3000);
    pass('get_paused_state (paused!)');
    log(`Reason: ${debuggerState.paused.reason}`);
    for (const f of debuggerState.paused.callFrames) {
      log(`  [${f.callFrameId}] ${f.functionName || '(anonymous)'} @ line ${f.lineNumber}:${f.columnNumber}`);
    }
  } catch (e) {
    fail('get_paused_state', e.message);
  }
}

// ─── Test 3: evaluate_on_call_frame ───
async function testEvaluateOnCallFrame() {
  console.log('\n── Test 3: evaluate_on_call_frame ──');
  if (!debuggerState.paused) { fail('evaluate_on_call_frame', 'Not paused'); return; }

  const frameId = debuggerState.paused.callFrames[0].callFrameId;

  for (const [expr, expected] of [['a', 3], ['b', 7], ['a + b', 10]]) {
    try {
      const r = await dbgSession.send('Debugger.evaluateOnCallFrame', { callFrameId: frameId, expression: expr });
      if (r.result.value === expected) pass(`eval "${expr}" = ${r.result.value}`);
      else fail(`eval "${expr}"`, `Expected ${expected}, got ${r.result.value}`);
    } catch (e) {
      fail(`eval "${expr}"`, e.message);
    }
  }
}

// ─── Test 4: step_over / step_into / resume ───
async function testStepping() {
  console.log('\n── Test 4: step_over / step_into / resume ──');
  if (!debuggerState.paused) { fail('stepping', 'Not paused'); return; }

  // step_over
  try {
    const prevLine = debuggerState.paused.callFrames[0].lineNumber;
    debuggerState.paused = null;
    await dbgSession.send('Debugger.stepOver');
    await waitForPause(3000);
    const newLine = debuggerState.paused.callFrames[0].lineNumber;
    pass(`step_over (line ${prevLine} → ${newLine})`);
  } catch (e) { fail('step_over', e.message); }

  // step_over again
  try {
    const prevLine = debuggerState.paused.callFrames[0].lineNumber;
    debuggerState.paused = null;
    await dbgSession.send('Debugger.stepOver');
    await waitForPause(3000);
    const newLine = debuggerState.paused.callFrames[0].lineNumber;
    pass(`step_over #2 (line ${prevLine} → ${newLine})`);
  } catch (e) { fail('step_over #2', e.message); }

  // resume
  try {
    debuggerState.paused = null;
    await dbgSession.send('Debugger.resume');
    await waitForResume(3000);
    pass('resume (execution continued)');
  } catch (e) { fail('resume', e.message); }
}

// ─── Test 5: remove_breakpoint + debugger_disable ───
async function testCleanup() {
  console.log('\n── Test 5: remove_breakpoint + debugger_disable ──');

  if (debuggerState.paused) {
    await dbgSession.send('Debugger.resume').catch(() => {});
    await new Promise(r => setTimeout(r, 300));
  }

  for (const bpId of [...debuggerState.breakpoints.keys()]) {
    try {
      await dbgSession.send('Debugger.removeBreakpoint', { breakpointId: bpId });
      debuggerState.breakpoints.delete(bpId);
      pass(`remove_breakpoint`);
    } catch (e) { fail(`remove_breakpoint`, e.message); }
  }

  if (debuggerState.breakpoints.size === 0) pass('list_breakpoints (empty)');
  else fail('list_breakpoints', `Still has ${debuggerState.breakpoints.size}`);

  try {
    await dbgSession.send('Debugger.disable');
    debuggerState.enabled = false;
    pass('debugger_disable');
  } catch (e) { fail('debugger_disable', e.message); }
}

// ─── Test 6: get_script_source ───
async function testGetScriptSource() {
  console.log('\n── Test 6: get_script_source ──');

  debuggerState.scripts.clear();
  await dbgSession.send('Debugger.enable');

  await page.goto('data:text/html,<script>function hello(){return "world";}</script>');
  await new Promise(r => setTimeout(r, 500));

  const scripts = [...debuggerState.scripts.values()];
  if (scripts.length === 0) { fail('get_script_source', 'No scripts'); return; }

  try {
    const r = await dbgSession.send('Debugger.getScriptSource', { scriptId: scripts[0].scriptId });
    if (r.scriptSource) {
      pass(`get_script_source (${r.scriptSource.length} chars)`);
      log(`Preview: ${r.scriptSource.substring(0, 60)}`);
    } else fail('get_script_source', 'Empty source');
  } catch (e) { fail('get_script_source', e.message); }

  await dbgSession.send('Debugger.disable').catch(() => {});
}

// ─── Main ───
async function main() {
  try {
    await setup();
    await testEnableAndListScripts();
    await testBreakpointAndPause();
    await testEvaluateOnCallFrame();
    await testStepping();
    await testCleanup();
    await testGetScriptSource();
  } catch (e) {
    console.error('\n💥 Unexpected error:', e);
  } finally {
    await teardown();
  }
  console.log(`\n${'═'.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${'═'.repeat(40)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
