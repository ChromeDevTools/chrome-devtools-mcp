/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

function LCPApp() {
  let lcpData: {
    lcpMs: number;
    phases: Array<{name: string; durationMs: number}>;
    screenshot?: string;
  } | null = null;

  const phaseColors: Record<string, string> = {
    'TTFB': 'var(--phase-ttfb)',
    'Load Delay': 'var(--phase-load-delay)',
    'Load Duration': 'var(--phase-load-duration)',
    'Render Delay': 'var(--phase-render-delay)'
  };

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
              if (data.lcpData) {
                lcpData = data.lcpData;
                render();
              }
            }
          } catch (e) {
            console.error('Failed to parse LCP data from result', e);
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
    if (!lcpData) {
      return;
    }

    document.getElementById('lcp-total')!.innerText = Math.round(lcpData.lcpMs) + ' ms';

    const chart = document.getElementById('chart')!;
    const legend = document.getElementById('legend')!;
    chart.innerHTML = '';
    legend.innerHTML = '';

    lcpData.phases.forEach((phase: {name: string; durationMs: number}) => {
      const percentage = (phase.durationMs / (lcpData?.lcpMs || 1)) * 100;
      // Add to chart
      const bar = document.createElement('div');
      bar.className = 'phase-bar';
      bar.style.width = percentage + '%';
      bar.style.backgroundColor = phaseColors[phase.name] || 'var(--text-dim)';
      if (percentage > 10) {
        bar.innerText = Math.round(percentage) + '%';
      }
      chart.appendChild(bar);

      // Add to legend
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = 
        '<div class="color-box" style="background-color: ' + (phaseColors[phase.name] || 'var(--text-dim)') + '"></div>' +
        '<div class="phase-name">' + phase.name + '</div>' +
        '<div class="phase-value">' + Math.round(phase.durationMs) + ' ms</div>';
      legend.appendChild(item);
    });

    if (lcpData.screenshot) {
      const screenshotBox = document.getElementById('screenshot-box')!;
      const screenshotImg = document.getElementById('lcp-screenshot') as HTMLImageElement;
      screenshotImg.src = 'data:image/png;base64,' + lcpData.screenshot;
      screenshotBox.style.display = 'block';
    }
  }
}

export const LCP_APP_SCRIPT = '(' + LCPApp.toString() + ')()';

