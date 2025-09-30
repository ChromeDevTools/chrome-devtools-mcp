// src/tools/iframe-popup-tools.ts
// Tools for inspecting & editing in-page iframe popups via CDP.
// These tools enable direct access to iframe-embedded extension popups.

import fs from 'node:fs/promises';
import path from 'node:path';
import type {CDPSession} from 'puppeteer';

export type InspectResult = {
  frameId: string;
  frameUrl: string;
  html: string;
  screenshotBase64?: string;
  consoleLogs?: string[];
};

export async function findExtensionIdViaTargets(
  cdp: CDPSession,
): Promise<string> {
  const {targetInfos} = await cdp.send('Target.getTargets');
  const ext = targetInfos.find(
    (t) =>
      t.type === 'service_worker' && t.url.startsWith('chrome-extension://'),
  );
  if (!ext) throw new Error('Extension service worker not found');
  return new URL(ext.url).host;
}

export async function waitForFrameByUrlMatch(
  cdp: CDPSession,
  pattern: RegExp,
  timeoutMs = 5000,
): Promise<{frameId: string; frameUrl: string}> {
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('DOM.enable');

  // Strategy: Use Page.getFrameTree and match by pattern
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const tree = await cdp.send('Page.getFrameTree');
      const hit = findFrameByPattern(tree.frameTree, pattern);
      if (hit) return hit;
    } catch (e) {
      // Frame tree may not be ready yet, continue waiting
    }

    // Wait a bit before retry
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  throw new Error(`Timeout waiting for iframe by url match: ${pattern}`);

  function findFrameByPattern(
    node: any,
    rx: RegExp,
  ): {frameId: string; frameUrl: string} | null {
    if (node?.frame?.url && rx.test(node.frame.url)) {
      return {frameId: node.frame.id, frameUrl: node.frame.url};
    }
    for (const c of node.childFrames ?? []) {
      const r = findFrameByPattern(c, rx);
      if (r) return r;
    }
    return null;
  }
}

export async function inspectIframe(
  cdp: CDPSession,
  urlPattern: RegExp,
  waitMs = 5000,
): Promise<InspectResult> {
  await cdp.send('Runtime.enable');
  await cdp.send('DOM.enable');
  await cdp.send('Log.enable');

  const {frameId, frameUrl} = await waitForFrameByUrlMatch(
    cdp,
    urlPattern,
    waitMs,
  );

  const {executionContextId} = await cdp.send('Page.createIsolatedWorld', {
    frameId,
    worldName: 'mcp',
    // grantUniveralAccess is a known CDP option in some builds. It's optional here.
  });

  const {result} = await cdp.send('Runtime.evaluate', {
    contextId: executionContextId,
    expression: 'document.documentElement.outerHTML',
    returnByValue: true,
  });

  return {
    frameId,
    frameUrl,
    html: String(result.value ?? ''),
  };
}

export async function patchAndReload(
  cdp: CDPSession,
  extensionPath: string,
  patches: Array<{file: string; find: string; replace: string}>,
) {
  for (const p of patches) {
    const abs = path.join(extensionPath, p.file);
    const src = await fs.readFile(abs, 'utf8');
    const rx = new RegExp(p.find, 'g');
    const out = src.replace(rx, p.replace);
    if (out != src) await fs.writeFile(abs, out, 'utf8');
  }
  await reloadExtension(cdp);
}

export async function reloadExtension(cdp: CDPSession) {
  const {targetInfos} = await cdp.send('Target.getTargets');
  const sw = targetInfos.find(
    (t) =>
      t.type === 'service_worker' && t.url.startsWith('chrome-extension://'),
  );
  if (!sw)
    throw new Error('Extension service worker not found for reload');

  // Attach to the service worker and execute chrome.runtime.reload()
  const {sessionId} = await cdp.send('Target.attachToTarget', {
    targetId: sw.targetId,
    flatten: true,
  });

  await cdp.send('Target.sendMessageToTarget', {
    sessionId,
    message: JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {expression: 'chrome.runtime.reload()'},
    }),
  });
}