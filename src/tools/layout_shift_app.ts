/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

function LayoutShiftApp() {
  let layoutShifts: Array<{
    ts: number;
    score: number;
    backendNodeIds: number[];
    images: {
      before?: string;
      after?: string;
    };
  }> = [];

  window.addEventListener('message', (event) => {
    const { method, params } = event.data;

    if (method === 'ui/notifications/tool-result') {
      const content = params?.content || [];
      for (const part of content) {
        if (part.type === 'text' && part.text.includes('```json')) {
          try {
            const jsonMatch = part.text.match(/```json\n([\s\S]*?)\n```/);
            if (jsonMatch) {
              const data = JSON.parse(jsonMatch[1]);
              if (data.layoutShifts) {
                layoutShifts = data.layoutShifts;
                render();
              }
            }
          } catch (e) {
            console.error('Failed to parse Layout Shift data from result', e);
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

  (window.parent).postMessage({ jsonrpc: '2.0', method: 'ui/initialize', params: {}, id: 1 }, '*');

  function render() {
    const list = document.getElementById('shifts-list')!;
    list.innerHTML = '';

    if (layoutShifts.length === 0) {
      list.innerHTML = '<div class="empty-state">No layout shifts with screenshots found in this trace.</div>';
      return;
    }

    // Sort by score descending to show biggest shifts first
    const sortedShifts = [...layoutShifts].sort((a, b) => b.score - a.score);

    sortedShifts.forEach((shift, index) => {
      const card = document.createElement('div');
      card.className = 'shift-card';
      
      const header = document.createElement('div');
      header.className = 'shift-header';
      header.innerHTML = `
        <div class="shift-info">
          <span class="shift-rank">#${index + 1}</span>
          <span class="shift-ts">at ${(shift.ts / 1000).toFixed(2)}ms</span>
        </div>
        <div class="shift-score ${getScoreClass(shift.score)}">
          Score: ${shift.score.toFixed(4)}
        </div>
      `;
      card.appendChild(header);

      if (shift.images.before || shift.images.after) {
        const snapshots = document.createElement('div');
        snapshots.className = 'snapshots-grid';
        
        if (shift.images.before) {
          const before = createSnapshot('Before', shift.images.before);
          snapshots.appendChild(before);
        }
        
        if (shift.images.after) {
          const after = createSnapshot('After', shift.images.after);
          snapshots.appendChild(after);
        }
        
        card.appendChild(snapshots);
      } else {
        const noImages = document.createElement('div');
        noImages.className = 'no-snapshots';
        noImages.innerText = 'No snapshots available for this shift';
        card.appendChild(noImages);
      }

      list.appendChild(card);
    });
  }

  function createSnapshot(label: string, base64: string) {
    const container = document.createElement('div');
    container.className = 'snapshot-item';
    container.innerHTML = `
      <div class="snapshot-label">${label}</div>
      <div class="snapshot-img-container">
        <img src="data:image/png;base64,${base64}" alt="${label} Snapshot">
      </div>
    `;
    return container;
  }

  function getScoreClass(score: number) {
    if (score >= 0.1) {
      return 'score-bad';
    }
    if (score >= 0.03) {
      return 'score-ni'; // Needs Improvement
    }
    return 'score-good';
  }
}

export const LAYOUT_SHIFT_APP_SCRIPT = '(' + LayoutShiftApp.toString() + ')()';
