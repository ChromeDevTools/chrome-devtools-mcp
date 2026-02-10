/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {EMULATION_APP_SCRIPT} from './emulation_app.js';

export const EMULATION_UI_CONTENT = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    :root {
      --primary: #38bdf8;
      --hover: #0ea5e9;
      --bg: #0f172a;
      --card-bg: #1e293b;
      --text: #f8fafc;
      --text-dim: #94a3b8;
      --border: #334155;
      --selected-bg: #0ea5e9;
      --selected-border: #38bdf8;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
      padding: 20px; 
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
      margin: auto;
      width: 100%;
      min-width: 340px;
    }
    .header {
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text);
      margin-top: 12px;
      margin-bottom: 8px;
    }
    .header:first-child {
      margin-top: 0;
    }
    .button-grid { 
      display: grid; 
      grid-template-columns: repeat(2, 1fr); 
      gap: 10px; 
    }
    button { 
      padding: 8px 12px; 
      font-family: var(--font-mono);
      font-size: 13px; 
      cursor: pointer; 
      border: 1px solid var(--border); 
      border-radius: 6px; 
      background: var(--card-bg);
      color: var(--text);
      transition: all 0.15s ease-in-out;
      text-align: center;
    }
    button:hover:not(:disabled) { 
      background: #334155; 
      border-color: #475569;
    }
    button.active {
      background: rgba(56, 189, 248, 0.15);
      border-color: var(--selected-border);
      color: var(--primary);
    }
    button.primary {
      background: var(--primary);
      color: #0f172a;
      border-color: var(--primary);
      font-weight: 600;
    }
    button.primary:hover:not(:disabled) {
      background: var(--hover);
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      filter: grayscale(1);
    }
    .footer {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--border);
    }
    .input-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    input {
      padding: 8px 12px; 
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      font-family: var(--font-mono);
      font-size: 13px;
      color: var(--text);
      outline: none;
    }
    input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 1px var(--primary);
    }
    #status {
      font-size: 12px;
      color: var(--text-dim);
      height: 1.2em;
      margin-top: 8px;
    }
    .actions {
      display: flex;
    }
    .actions button {
      flex: 1;
      padding: 10px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">CPU Throttling</div>
    <div class="button-grid" id="cpu-grid">
      <button data-rate="2" onclick="selectCPUThrottling(2, this)">2x slow</button>
      <button data-rate="4" onclick="selectCPUThrottling(4, this)">4x slow</button>
      <button data-rate="6" onclick="selectCPUThrottling(6, this)">6x slow</button>
      <button data-rate="20" onclick="selectCPUThrottling(20, this)">20x slow</button>
      <button data-rate="1" onclick="selectCPUThrottling(1, this)" class="active">No throttling</button>
    </div>
    
    <div class="input-group">
      <label class="header" style="font-size: 11px;">Custom slowdown</label>
      <input type="number" id="customInput" placeholder="Enter rate..." min="1" max="100">
    </div>

    <div class="header">Network Throttling</div>
    <div class="button-grid" id="network-grid">
      <button data-condition="Fast 3G" onclick="selectNetworkThrottling('Fast 3G', this)">Fast 3G</button>
      <button data-condition="Slow 3G" onclick="selectNetworkThrottling('Slow 3G', this)">Slow 3G</button>
      <button data-condition="Offline" onclick="selectNetworkThrottling('Offline', this)">Offline</button>
      <button data-condition="No emulation" onclick="selectNetworkThrottling('No emulation', this)" class="active">None</button>
    </div>

    <div class="header">Geolocation</div>
    <div class="input-group">
      <div style="display: flex; gap: 10px;">
        <input type="number" id="geoLat" placeholder="Latitude" step="any" style="flex: 1;">
        <input type="number" id="geoLon" placeholder="Longitude" step="any" style="flex: 1;">
      </div>
      <button onclick="clearGeolocation()" style="margin-top: 5px; width: 100%;">Clear Geolocation</button>
    </div>

    <div class="header">Color Scheme</div>
    <div class="button-grid" id="color-scheme-grid">
      <button data-color="light" onclick="selectColorScheme('light', this)">Light</button>
      <button data-color="dark" onclick="selectColorScheme('dark', this)">Dark</button>
      <button data-color="auto" onclick="selectColorScheme('auto', this)" class="active">Auto</button>
    </div>

    <style>
      /* ... existing styles ... */
      .viewport-grid {
        display: flex;
        gap: 12px;
        justify-content: space-between;
      }
      .viewport-option {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        padding: 12px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--card-bg);
        transition: all 0.2s ease;
        flex: 1;
        text-align: center;
      }
      .viewport-option:hover {
        border-color: var(--hover);
        background: #334155;
      }
      .viewport-option.active {
        background: rgba(56, 189, 248, 0.15);
        border-color: var(--selected-border);
        color: var(--primary);
      }
      .viewport-icon {
        width: 24px;
        height: 24px;
        stroke: currentColor;
        stroke-width: 2;
        fill: none;
      }
      .viewport-label {
        font-size: 11px;
        font-weight: 500;
      }
    </style>

    <div class="header">Viewport</div>
    <div class="viewport-grid" id="viewport-grid">
      <div class="viewport-option" data-viewport="mobile" onclick="selectViewport('mobile', this)">
        <svg class="viewport-icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
          <line x1="12" y1="18" x2="12.01" y2="18"></line>
        </svg>
        <span class="viewport-label">Mobile</span>
      </div>
      <div class="viewport-option" data-viewport="tablet" onclick="selectViewport('tablet', this)">
        <svg class="viewport-icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
          <line x1="12" y1="18" x2="12.01" y2="18"></line>
        </svg>
        <span class="viewport-label">Tablet</span>
      </div>
      <div class="viewport-option" data-viewport="desktop" onclick="selectViewport('desktop', this)">
        <svg class="viewport-icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
          <line x1="8" y1="21" x2="16" y2="21"></line>
          <line x1="12" y1="17" x2="12" y2="21"></line>
        </svg>
        <span class="viewport-label">Desktop</span>
      </div>
      <div class="viewport-option active" data-viewport="reset" onclick="selectViewport('reset', this)">
        <svg class="viewport-icon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
        <span class="viewport-label">Default</span>
      </div>
    </div>
  
    <div class="footer">
      <div class="actions">
        <button id="applyBtn" class="primary" onclick="applySettings()">Apply Settings</button>
      </div>
      <div id="status"></div>
    </div>
  </div>
  <script>
    ${EMULATION_APP_SCRIPT}
  </script>
</body>
</html>
`;
