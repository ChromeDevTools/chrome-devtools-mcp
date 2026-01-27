/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {LAYOUT_SHIFT_APP_SCRIPT} from './layout_shift_app.js';

export const LAYOUT_SHIFT_UI_CONTENT = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    :root {
      --primary: #38bdf8;
      --bg: #0f172a;
      --card-bg: #1e293b;
      --text: #f8fafc;
      --text-dim: #94a3b8;
      --border: #334155;
      --score-bad: #ef4444;
      --score-ni: #f59e0b;
      --score-good: #10b981;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
      padding: 24px; 
      margin: 0;
      color: var(--text);
      background: var(--bg);
      font-size: 14px;
      line-height: 1.5;
    }
    .container { 
      display: flex; 
      flex-direction: column; 
      gap: 24px; 
      max-width: 800px;
      margin: auto;
    }
    .header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 12px;
    }
    .title {
      font-size: 24px;
      font-weight: 700;
      color: var(--primary);
    }
    .subtitle {
      font-size: 14px;
      color: var(--text-dim);
      margin-top: 4px;
    }
    .shift-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    }
    .shift-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .shift-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .shift-rank {
      font-size: 18px;
      font-weight: 800;
      color: var(--primary);
      opacity: 0.5;
    }
    .shift-ts {
      font-family: var(--font-mono);
      font-size: 13px;
      color: var(--text-dim);
    }
    .shift-score {
      font-weight: 700;
      font-family: var(--font-mono);
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 13px;
      border: 1px solid currentColor;
    }
    .score-bad { color: var(--score-bad); }
    .score-ni { color: var(--score-ni); }
    .score-good { color: var(--score-good); }

    .snapshots-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .snapshot-item {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .snapshot-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-dim);
    }
    .snapshot-img-container {
      border-radius: 8px;
      overflow: hidden;
      border: 2px solid var(--border);
      background: #000;
      aspect-ratio: 16/9;
      position: relative;
    }
    .snapshot-img-container img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .empty-state {
      text-align: center;
      padding: 48px;
      color: var(--text-dim);
      background: var(--card-bg);
      border-radius: 12px;
      border: 2px dashed var(--border);
    }
    .no-snapshots {
      padding: 12px;
      text-align: center;
      font-size: 12px;
      color: var(--text-dim);
      background: rgba(15, 23, 42, 0.3);
      border-radius: 6px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="title">Layout Shift Breakdown</div>
      <div class="subtitle">Visualizing shifts before and after they occur</div>
    </div>

    <div id="shifts-list" style="display: flex; flex-direction: column; gap: 24px;">
      <!-- Shift cards will be injected here -->
    </div>
  </div>
  <script>
    ${LAYOUT_SHIFT_APP_SCRIPT}
  </script>
</body>
</html>
`;
