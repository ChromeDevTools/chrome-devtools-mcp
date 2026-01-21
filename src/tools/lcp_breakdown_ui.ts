/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {LCP_APP_SCRIPT} from './lcp_breakdown_app.js';

export const LCP_UI_CONTENT = `
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
      --phase-ttfb: #3b82f6;
      --phase-load-delay: #10b981;
      --phase-load-duration: #f59e0b;
      --phase-render-delay: #ef4444;
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
      overflow: hidden;
    }
    .container { 
      display: flex; 
      flex-direction: column; 
      gap: 24px; 
      max-width: 600px;
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
    .lcp-value {
      font-family: var(--font-mono);
      font-size: 18px;
      font-weight: 600;
    }
    .breakdown-chart {
      display: flex;
      width: 100%;
      height: 32px;
      border-radius: 8px;
      overflow: hidden;
      background: var(--card-bg);
      border: 1px solid var(--border);
    }
    .phase-bar {
      height: 100%;
      transition: width 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 600;
      color: white;
      text-shadow: 0 1px 2px rgba(0,0,0,0.5);
      overflow: hidden;
      white-space: nowrap;
    }
    .legend {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
    }
    .color-box {
      width: 12px;
      height: 12px;
      border-radius: 3px;
    }
    .phase-name {
      font-size: 13px;
      font-weight: 500;
      flex: 1;
    }
    .phase-value {
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--text-dim);
    }
    .screenshot-container {
      margin-top: 8px;
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
      background: #000;
      display: none;
      aspect-ratio: 16/9;
      position: relative;
    }
    .screenshot-container img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .screenshot-label {
      position: absolute;
      top: 8px;
      left: 8px;
      background: rgba(15, 23, 42, 0.8);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 10px;
      color: var(--primary);
      border: 1px solid var(--primary);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="title">LCP Breakdown</div>
      <div class="lcp-value" id="lcp-total">- ms</div>
    </div>

    <div class="breakdown-chart" id="chart">
      <!-- Phases will be injected here -->
    </div>

    <div class="legend" id="legend">
      <!-- Legend items will be injected here -->
    </div>

    <div class="screenshot-container" id="screenshot-box">
      <div class="screenshot-label">LCP Element Highlight</div>
      <img id="lcp-screenshot" src="" alt="LCP Element Screenshot">
    </div>

  </div>
  <script>
    ${LCP_APP_SCRIPT}
  </script>
</body>
</html>
`;

