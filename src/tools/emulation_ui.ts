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
      <button data-rate="1" onclick="selectCPUThrottling(1, this)" class="active">No throttling</button>
      <button data-rate="2" onclick="selectCPUThrottling(2, this)">2x slow</button>
      <button data-rate="4" onclick="selectCPUThrottling(4, this)">4x slow</button>
      <button data-rate="6" onclick="selectCPUThrottling(6, this)">6x slow</button>
      <button data-rate="8" onclick="selectCPUThrottling(8, this)">8x slow</button>
      <button data-rate="20" onclick="selectCPUThrottling(20, this)">20x slow</button>
    </div>
    
    <div class="header">Network Throttling</div>
    <div class="button-grid" id="network-grid">
      <button data-condition="Fast 3G" onclick="selectNetworkThrottling('Fast 3G', this)">Fast 3G</button>
      <button data-condition="Slow 3G" onclick="selectNetworkThrottling('Slow 3G', this)">Slow 3G</button>
      <button data-condition="Offline" onclick="selectNetworkThrottling('Offline', this)">Offline</button>
      <button data-condition="No emulation" onclick="selectNetworkThrottling('No emulation', this)" class="active">None</button>
    </div>

    <div class="header">Geolocation</div>
    <div class="input-group" style="position: relative;">
      <input type="text" id="countrySearch" placeholder="Search country..." autocomplete="off" oninput="filterCountries(this.value)" onfocus="filterCountries(this.value)">
      <div id="countryDropdown" class="country-dropdown"></div>
      <button onclick="clearGeolocation()" style="margin-top: 5px; width: 100%;">Clear Geolocation</button>
    </div>

    <style>
      .country-dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: var(--card-bg);
        border: 1px solid var(--border);
        border-radius: 6px;
        max-height: 200px;
        overflow-y: auto;
        z-index: 50;
        display: none;
        margin-top: 4px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5);
      }
      .country-item {
        padding: 8px 12px;
        cursor: pointer;
        color: var(--text);
        font-size: 13px;
        border-bottom: 1px solid rgba(255,255,255,0.05);
      }
      .country-item:last-child {
        border-bottom: none;
      }
      .country-item:hover {
        background: var(--hover);
        color: #fff;
      }
    </style>

    <div class="header">Color Scheme</div>
    <div class="button-grid" id="color-scheme-grid" style="grid-template-columns: repeat(3, 1fr);">
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
    <style>
      .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(15, 23, 42, 0.8);
        backdrop-filter: blur(4px);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 100;
        opacity: 0;
        transition: opacity 0.2s ease;
      }
      .modal-overlay.open {
        display: flex;
        opacity: 1;
      }
      .modal-content {
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 12px;
        width: 90%;
        max-width: 400px;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
        transform: scale(0.95);
        transition: transform 0.2s ease;
      }
      .modal-overlay.open .modal-content {
        transform: scale(1);
      }
      .modal-header {
        padding: 16px;
        border-bottom: 1px solid var(--border);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .modal-title {
        font-weight: 600;
        font-size: 16px;
        color: var(--text);
      }
      .modal-close {
        background: transparent;
        border: none;
        color: var(--text-dim);
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .modal-close:hover {
        background: var(--card-bg);
        color: var(--text);
      }
      .modal-body {
        padding: 8px;
        overflow-y: auto;
      }
      .device-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .device-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.15s ease;
        border: 1px solid transparent;
      }
      .device-item:hover {
        background: var(--card-bg);
        border-color: var(--border);
      }
      .device-item.active {
        background: rgba(56, 189, 248, 0.1);
        border-color: var(--selected-border);
      }
      .device-icon {
        width: 20px;
        height: 20px;
        flex-shrink: 0;
        color: var(--text-dim);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .device-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
      }
      .device-name {
        font-weight: 500;
        color: var(--text);
        font-size: 13px;
      }
      .device-specs {
        font-size: 11px;
        color: var(--text-dim);
        font-family: var(--font-mono);
      }
      .device-brand-icon {
        width: 16px;
        height: 16px;
        fill: currentColor;
        opacity: 0.7;
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

  <div class="modal-overlay" id="deviceModal" onclick="closeDeviceModal(event)">
    <div class="modal-content">
      <div class="modal-header">
        <div class="modal-title" id="modalTitle">Select Device</div>
        <button class="modal-close" onclick="closeDeviceModal()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="device-list" id="deviceList">
          <!-- Populated by JS -->
        </div>
      </div>
    </div>
  </div>

  <script>
    ${EMULATION_APP_SCRIPT}
  </script>
</body>
</html>
`;
