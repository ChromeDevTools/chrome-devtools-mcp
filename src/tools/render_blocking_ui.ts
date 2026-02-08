/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {RENDER_BLOCKING_APP_SCRIPT} from './render_blocking_app.js';

export const RENDER_BLOCKING_UI_CONTENT = `
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
      --duration-high: #ef4444;
      --duration-medium: #f59e0b;
      --badge-bg: #334155;
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
      gap: 16px; 
      max-width: 800px;
      margin: auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      border-bottom: 1px solid var(--border);
      padding-bottom: 12px;
    }
    .title {
      font-size: 20px;
      font-weight: 700;
      color: var(--primary);
    }
    .count {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 14px;
      color: var(--text-dim);
    }
    .request-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .request-item {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    .request-url {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
    }
    .request-meta {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }
    .badge {
      background: var(--badge-bg);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      color: var(--text-dim);
    }
    .duration {
      font-weight: 600;
      min-width: 60px;
      text-align: right;
    }
    .duration-medium { color: var(--duration-medium); }
    .duration-high { color: var(--duration-high); }
    .empty-state {
      text-align: center;
      padding: 40px;
      color: var(--text-dim);
      border: 1px dashed var(--border);
      border-radius: 8px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="title">Render Blocking Requests</div>
      <div class="count" id="request-count">- requests</div>
    </div>

    <div class="request-list" id="request-list">
      <!-- Requests will be injected here -->
      <div class="empty-state">Waiting for trace data...</div>
    </div>
  </div>
  <script>
    ${RENDER_BLOCKING_APP_SCRIPT}
  </script>
</body>
</html>
`;
