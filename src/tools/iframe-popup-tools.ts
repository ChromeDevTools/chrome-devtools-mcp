/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
// src/tools/iframe-popup-tools.ts
// Tools for inspecting & editing in-page iframe popups via CDP.
// These tools enable direct access to iframe-embedded extension popups.
// Uses OOPIF (Out-Of-Process iFrame) detection via Target.setAutoAttach.

import fs from 'node:fs/promises';
import path from 'node:path';

import type {CDPSession} from 'puppeteer';

export interface InspectResult {
  frameId: string | null;
  frameUrl: string;
  html: string;
  screenshotBase64?: string;
  consoleLogs?: string[];
}

export interface ChildTarget {
  sessionId: string;
  targetId: string;
  url: string;
}

export async function findExtensionIdViaTargets(
  cdp: CDPSession,
): Promise<string> {
  const {targetInfos} = await cdp.send('Target.getTargets');
  const ext = targetInfos.find(
    t => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'),
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
  // Strategy: Use DOMSnapshot.captureSnapshot to get iframe-inclusive DOM structure
  // Note: chrome-extension:// iframes may not be included due to SOP/extension isolation

  await cdp.send('DOMSnapshot.enable');

  try {
    // Capture full DOM snapshot including iframes
    const snapshot = await cdp.send('DOMSnapshot.captureSnapshot', {
      computedStyles: [],
      includeDOMRects: false,
      includePaintOrder: false,
    });

    // Search for matching iframe in the snapshot
    const result = findIframeInSnapshot(snapshot, urlPattern);

    if (result) {
      return {
        frameId: null,
        frameUrl: result.url,
        html: result.html,
      };
    }

    // Extension iframe not found in snapshot - this is expected behavior
    // due to Same-Origin Policy and Chrome extension isolation
    throw new Error(
      'EXTENSION_FRAME_UNREADABLE: Chrome extension iframes are isolated by ' +
        'Same-Origin Policy and extension security model. The iframe exists but ' +
        'cannot be read from the page context. This is expected Chrome behavior.',
    );
  } catch (error: any) {
    // If DOMSnapshot fails or iframe not found, provide clear explanation
    if (error.message?.includes('EXTENSION_FRAME_UNREADABLE')) {
      throw error;
    }

    throw new Error(
      `Failed to capture DOM snapshot: ${error.message}. ` +
        'Note: Chrome extension iframes are typically unreadable due to security policies.',
    );
  } finally {
    await cdp.send('DOMSnapshot.disable');
  }
}

function findIframeInSnapshot(
  snapshot: any,
  urlPattern: RegExp,
): {url: string; html: string} | null {
  // DOMSnapshot structure:
  // - documents: array of document snapshots
  // - strings: string table for deduplication

  const documents = snapshot.documents || [];

  for (const doc of documents) {
    const baseURL = doc.baseURL;

    // Check if this document matches the pattern
    if (baseURL && urlPattern.test(baseURL)) {
      // Reconstruct HTML from snapshot
      const html = reconstructHTMLFromSnapshot(doc, snapshot.strings || []);
      return {url: baseURL, html};
    }
  }

  return null;
}

function reconstructHTMLFromSnapshot(doc: any, strings: string[]): string {
  // Simple reconstruction - get text content from nodes
  // Note: DOMSnapshot doesn't provide perfect HTML reconstruction
  // but gives us the essential content

  const nodes = doc.nodes || {};
  const nodeNames = nodes.nodeName || [];
  const nodeValues = nodes.nodeValue || [];
  const textValues = nodes.textValue || {};

  // Build a simple HTML representation
  let html = '<html>';

  // Try to find body content
  for (let i = 0; i < nodeNames.length; i++) {
    const nameIdx = nodeNames[i];
    const name = strings[nameIdx] || '';
    const valueIdx = nodeValues[i];
    const value = valueIdx >= 0 ? strings[valueIdx] : '';

    if (name === '#document' || name === 'HTML') continue;

    if (name === '#text' && value) {
      html += value;
    } else if (name) {
      html += `<${name}>`;
    }
  }

  html += '</html>';

  return html;
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
      reject(
        new Error(`Timeout waiting for response from child session: ${method}`),
      );
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
    t => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'),
  );
  if (!sw) throw new Error('Extension service worker not found for reload');

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
