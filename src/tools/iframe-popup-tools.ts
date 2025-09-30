// src/tools/iframe-popup-tools.ts
// Tools for inspecting & editing in-page iframe popups via CDP.
// These tools enable direct access to iframe-embedded extension popups.
// Uses OOPIF (Out-Of-Process iFrame) detection via Target.setAutoAttach.

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

export type ChildTarget = {
  sessionId: string;
  targetId: string;
  url: string;
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

export async function enableOopifAutoAttach(cdp: CDPSession): Promise<void> {
  await cdp.send('Target.setDiscoverTargets', {discover: true});
  await cdp.send('Target.setAutoAttach', {
    autoAttach: true,
    waitForDebuggerOnStart: false,
    flatten: true, // Essential for OOPIF detection
  });
}

export async function waitForExtensionChildTarget(
  cdp: CDPSession,
  pattern: RegExp,
  timeoutMs = 8000,
): Promise<ChildTarget> {
  const start = Date.now();
  return await new Promise((resolve, reject) => {
    let resolved = false;

    const onAttach = (e: any) => {
      const url = e?.targetInfo?.url || '';
      if (pattern.test(url)) {
        resolved = true;
        cleanup();
        resolve({
          sessionId: e.sessionId,
          targetId: e.targetInfo.targetId,
          url,
        });
      }
    };

    const onTimeout = () => {
      if (!resolved) {
        cleanup();
        reject(
          new Error(
            `Timeout: extension popup child target not found (pattern: ${pattern})`,
          ),
        );
      }
    };

    const cleanup = () => {
      cdp.off('Target.attachedToTarget', onAttach);
    };

    cdp.on('Target.attachedToTarget', onAttach);
    setTimeout(onTimeout, Math.max(0, timeoutMs - (Date.now() - start)));
  });
}

export async function inspectIframe(
  cdp: CDPSession,
  urlPattern: RegExp,
  waitMs = 8000,
): Promise<InspectResult> {
  // Try OOPIF detection first
  try {
    await enableOopifAutoAttach(cdp);
    const child = await waitForExtensionChildTarget(cdp, urlPattern, waitMs);

    // Enable Page/Runtime in child session
    await sendToChildSession(cdp, child.sessionId, 'Page.enable', {});
    await sendToChildSession(cdp, child.sessionId, 'Runtime.enable', {});

    // Evaluate outerHTML in child session
    const htmlResult = await sendToChildSession(
      cdp,
      child.sessionId,
      'Runtime.evaluate',
      {
        expression: 'document.documentElement.outerHTML',
        returnByValue: true,
      },
    );

    const html = String(htmlResult?.result?.value ?? '');

    return {
      frameId: child.targetId,
      frameUrl: child.url,
      html,
    };
  } catch (oopifError) {
    // Fallback: Try regular iframe via Page.getFrameTree
    await cdp.send('Page.enable');
    const {frameTree} = await cdp.send('Page.getFrameTree');

    const findFrame = (node: any): any => {
      if (urlPattern.test(node.frame.url)) {
        return node.frame;
      }
      if (node.childFrames) {
        for (const child of node.childFrames) {
          const found = findFrame(child);
          if (found) return found;
        }
      }
      return null;
    };

    const frame = findFrame(frameTree);
    if (!frame) {
      throw new Error(
        `Iframe not found (tried both OOPIF and regular iframe): ${urlPattern}`,
      );
    }

    // Execute in the frame context using Page.createIsolatedWorld
    const {executionContextId} = await cdp.send('Page.createIsolatedWorld', {
      frameId: frame.id,
    });

    await cdp.send('Runtime.enable');
    const htmlResult = await cdp.send('Runtime.evaluate', {
      expression: 'document.documentElement.outerHTML',
      returnByValue: true,
      contextId: executionContextId,
    });

    const html = String(htmlResult?.result?.value ?? '');

    return {
      frameId: frame.id,
      frameUrl: frame.url,
      html,
    };
  }
}

async function sendToChildSession(
  cdp: CDPSession,
  sessionId: string,
  method: string,
  params: any,
): Promise<any> {
  const id = Math.floor(Math.random() * 1000000);
  const message = JSON.stringify({id, method, params});

  // Send message to child target
  await cdp.send('Target.sendMessageToTarget', {sessionId, message});

  // Wait for response from child target
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for response from child session: ${method}`));
    }, 5000);

    const onMessage = (e: any) => {
      if (e.sessionId === sessionId) {
        try {
          const response = JSON.parse(e.message);
          if (response.id === id) {
            cleanup();
            if (response.error) {
              reject(new Error(`CDP error: ${JSON.stringify(response.error)}`));
            } else {
              resolve(response.result);
            }
          }
        } catch (err) {
          // Ignore parse errors for other messages
        }
      }
    };

    const cleanup = () => {
      clearTimeout(timeout);
      cdp.off('Target.receivedMessageFromTarget', onMessage);
    };

    cdp.on('Target.receivedMessageFromTarget', onMessage);
  });
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