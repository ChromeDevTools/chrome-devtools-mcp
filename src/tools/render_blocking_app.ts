/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

function RenderBlockingApp() {
  let blockingRequests: Array<{
    url: string;
    durationMs: number;
    mimeType: string;
  }> = [];

  window.addEventListener('message', (event) => {
    const { method, params } = event.data;

    // The data gets populated when tool result is returned
    if (method === 'ui/notifications/tool-result') {
      const content = params?.content || [];
      for (const part of content) {
        if (part.type === 'text' && part.text.includes('```json')) {
          try {
            const jsonMatch = part.text.match(/```json\n([\s\S]*?)\n```/);
            if (jsonMatch) {
              const data = JSON.parse(jsonMatch[1]);
              if (data.blockingRequests) {
                blockingRequests = data.blockingRequests;
                render();
              }
            }
          } catch (e) {
            console.error('Failed to parse blocking requests data from result', e);
          }
        }
      }
    }
  });

  const resizeObserver = new ResizeObserver(() => {
    const rect = document.documentElement.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    (window.parent).postMessage({ jsonrpc: '2.0', method: 'ui/notifications/size-changed', params: { width, height } }, '*');
  });
  resizeObserver.observe(document.documentElement);

  // Request initial data
  (window.parent).postMessage({ jsonrpc: '2.0', method: 'ui/initialize', params: {}, id: 1 }, '*');

  function render() {
    const container = document.getElementById('request-list');
    if (!container) {
      return;
    }
    
    container.innerHTML = '';
    
    if (blockingRequests.length === 0) {
      container.innerHTML = '<div class="empty-state">No render blocking requests found.</div>';
      return;
    }

    blockingRequests.forEach(req => {
      const item = document.createElement('div');
      item.className = 'request-item';
      
      const durationClass = req.durationMs > 500 ? 'duration-high' : (req.durationMs > 200 ? 'duration-medium' : '');
      
      item.innerHTML = `
        <div class="request-url" title="${req.url}">${req.url}</div>
        <div class="request-meta">
          <span class="badge">${req.mimeType}</span>
          <span class="duration ${durationClass}">${Math.round(req.durationMs)} ms</span>
        </div>
      `;
      container.appendChild(item);
    });
    
    const countElement = document.getElementById('request-count');
    if (countElement) {
        countElement.innerText = `${blockingRequests.length} requests`;
    }
  }
}

export const RENDER_BLOCKING_APP_SCRIPT = '(' + RenderBlockingApp.toString() + ')()';
