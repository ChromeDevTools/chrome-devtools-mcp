/**
 * chrome-ai-bridge Connect UI
 * Handles tab selection and WebSocket connection to MCP server
 */

class ConnectUI {
  constructor() {
    this.selectedTabId = null;
    this.mcpRelayUrl = null;
    this.autoConnectTabUrl = null;
    this.forceNewTab = false;
    this.autoMode = false;

    // DOM elements
    this.statusEl = document.getElementById('status');
    this.relayConfigEl = document.getElementById('relay-config');
    this.relayUrlInputEl = document.getElementById('relay-url');
    this.tabUrlInputEl = document.getElementById('tab-url');
    this.newTabInputEl = document.getElementById('new-tab');
    this.useRelayBtnEl = document.getElementById('use-relay-btn');
    this.pasteRelayBtnEl = document.getElementById('paste-relay-btn');
    this.openTabBtnEl = document.getElementById('open-tab-btn');
    this.tabSelectionEl = document.getElementById('tab-selection');
    this.tabsListEl = document.getElementById('tabs-list');
    this.connectBtnEl = document.getElementById('connect-btn');
    this.connectedViewEl = document.getElementById('connected-view');
    this.connectedTabTitleEl = document.getElementById('connected-tab-title');
    this.connectedTabIdEl = document.getElementById('connected-tab-id');
    this.disconnectBtnEl = document.getElementById('disconnect-btn');

    this.init();
  }

  async init() {
    try {
      // Parse URL parameters
      const params = new URLSearchParams(window.location.search);
      this.mcpRelayUrl = params.get('mcpRelayUrl');
      const autoConnectTabId = params.get('tabId');
      this.autoConnectTabUrl = params.get('tabUrl');
      this.forceNewTab = params.get('newTab') === 'true';
      this.autoMode = params.get('auto') === 'true';

      // Validate parameters
      if (!this.mcpRelayUrl) {
        this.showStatus('Paste Relay URL to continue', 'info');
        await this.showRelayConfig();
        return;
      }

      if (!this.validateRelayUrl()) {
        return;
      }

      if (this.autoMode) {
        this.showStatus('Auto-connecting…', 'info');
        this.tabSelectionEl.classList.add('hidden');
        return;
      }

      // If tabId is provided, auto-connect
      if (autoConnectTabId) {
        const tabId = parseInt(autoConnectTabId, 10);
        if (!isNaN(tabId)) {
          this.selectedTabId = tabId;
          await this.connect();
          return;
        }
      }

      // If tabUrl is provided, find matching tab and auto-connect
      if (this.autoConnectTabUrl) {
        this.showStatus(`Auto-connecting to: ${this.autoConnectTabUrl}`, 'info');
        const ok = await this.connect();
        if (ok) return;
      }

      // Otherwise, show tab selection UI
      await this.loadTabs();

    } catch (error) {
      this.showError(`Initialization failed: ${error.message}`);
    }
  }

  async showRelayConfig() {
    this.relayConfigEl.classList.remove('hidden');
    this.tabSelectionEl.classList.add('hidden');
    this.connectedViewEl.classList.add('hidden');

    const stored = await chrome.storage.local.get([
      'lastRelayUrl',
      'lastTabUrl',
      'lastNewTab',
    ]);
    if (stored.lastRelayUrl && !this.relayUrlInputEl.value) {
      this.relayUrlInputEl.value = stored.lastRelayUrl;
    }
    if (stored.lastTabUrl && !this.tabUrlInputEl.value) {
      this.tabUrlInputEl.value = stored.lastTabUrl;
    }
    if (typeof stored.lastNewTab === 'boolean') {
      this.newTabInputEl.checked = stored.lastNewTab;
    }

    this.useRelayBtnEl.addEventListener('click', () => {
      this.applyRelayConfig();
    });
    this.pasteRelayBtnEl.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          this.relayUrlInputEl.value = text.trim();
        }
      } catch (error) {
        this.showError(`Clipboard read failed: ${error.message || error}`);
      }
    });
    this.openTabBtnEl.addEventListener('click', async () => {
      const url = this.tabUrlInputEl.value.trim() || 'https://chatgpt.com/';
      await chrome.tabs.create({url});
    });

    await this.tryAutoDetectRelay();
  }

  applyRelayConfig() {
    const relayUrl = this.relayUrlInputEl.value.trim();
    if (!relayUrl) {
      this.showError('Relay URL is required');
      return;
    }

    this.mcpRelayUrl = relayUrl;
    this.autoConnectTabUrl = this.tabUrlInputEl.value.trim() || null;
    this.forceNewTab = Boolean(this.newTabInputEl.checked);

    chrome.storage.local.set({
      lastRelayUrl: this.mcpRelayUrl,
      lastTabUrl: this.autoConnectTabUrl || '',
      lastNewTab: this.forceNewTab,
    });

    if (!this.validateRelayUrl()) {
      return;
    }

    this.relayConfigEl.classList.add('hidden');
    this.continueAfterRelayConfig();
  }

  validateRelayUrl() {
    try {
      const url = new URL(this.mcpRelayUrl);
      if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
        this.showError('Invalid relay URL: must be loopback address (127.0.0.1)');
        return false;
      }
      return true;
    } catch {
      this.showError('Invalid relay URL format');
      return false;
    }
  }

  async continueAfterRelayConfig() {
    if (this.autoConnectTabUrl) {
      this.showStatus(`Auto-connecting to: ${this.autoConnectTabUrl}`, 'info');
      const ok = await this.connect();
      if (ok) return;
    }
    await this.loadTabs();
  }

  async detectRelayInfo() {
    const ports = [
      8765, 8766, 8767, 8768, 8769, 8770, 8771, 8772, 8773, 8774, 8775,
    ];
    for (const port of ports) {
      const url = `http://127.0.0.1:${port}/relay-info`;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 800);
        const res = await fetch(url, {signal: controller.signal});
        clearTimeout(timer);
        if (!res.ok) continue;
        const data = await res.json();
        if (data && data.wsUrl) {
          return data;
        }
      } catch {
        // ignore
      }
    }
    return null;
  }

  async tryAutoDetectRelay() {
    try {
      const data = await this.detectRelayInfo();
      if (data && data.wsUrl) {
        this.relayUrlInputEl.value = data.wsUrl;
        if (data.tabUrl && !this.tabUrlInputEl.value) {
          this.tabUrlInputEl.value = data.tabUrl;
        }
        this.newTabInputEl.checked = Boolean(data.newTab);
        this.showStatus('Relay URL detected. Connecting...', 'info');
        this.applyRelayConfig();
      }
    } catch {
      // ignore auto-detect errors
    }
  }

  async loadTabs() {
    try {
      const tabs = await chrome.tabs.query({});

      if (tabs.length === 0) {
        this.showError('No tabs found');
        return;
      }

      this.renderTabs(tabs);
      this.showStatus('Select a tab to connect', 'info');
      this.tabSelectionEl.classList.remove('hidden');

    } catch (error) {
      this.showError(`Failed to load tabs: ${error.message}`);
    }
  }

  renderTabs(tabs) {
    this.tabsListEl.innerHTML = '';

    tabs.forEach(tab => {
      const tabItem = document.createElement('div');
      tabItem.className = 'tab-item';
      tabItem.dataset.tabId = tab.id;

      tabItem.innerHTML = `
        <div class="tab-title">${this.escapeHtml(tab.title || 'Untitled')}</div>
        <div class="tab-url">${this.escapeHtml(tab.url || '')}</div>
        <div class="tab-id">Tab ID: ${tab.id}</div>
      `;

      tabItem.addEventListener('click', () => {
        this.selectTab(tab.id);
      });

      this.tabsListEl.appendChild(tabItem);
    });

    // Set up connect button
    this.connectBtnEl.addEventListener('click', () => {
      this.connect();
    });
  }

  selectTab(tabId) {
    // Remove previous selection
    document.querySelectorAll('.tab-item').forEach(item => {
      item.classList.remove('selected');
    });

    // Add selection
    const selectedItem = document.querySelector(`.tab-item[data-tab-id="${tabId}"]`);
    if (selectedItem) {
      selectedItem.classList.add('selected');
      this.selectedTabId = tabId;
      this.connectBtnEl.disabled = false;
    }
  }

  async connect() {
    if (!this.selectedTabId && !this.autoConnectTabUrl) {
      this.showError('No tab selected');
      return false;
    }

    try {
      this.showStatus('Connecting to MCP server...', 'info');

      let relayResponse = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        relayResponse = await chrome.runtime.sendMessage({
          type: 'connectToRelay',
          mcpRelayUrl: this.mcpRelayUrl
        });
        if (relayResponse && relayResponse.success) break;

        const detected = await this.detectRelayInfo();
        if (detected?.wsUrl) {
          this.mcpRelayUrl = detected.wsUrl;
        }
        await new Promise(resolve => setTimeout(resolve, 400));
      }

      if (!relayResponse || !relayResponse.success) {
        throw new Error(
          (relayResponse && relayResponse.error) || 'Relay connection failed',
        );
      }

      const connectResponse = await chrome.runtime.sendMessage({
        type: 'connectToTab',
        mcpRelayUrl: this.mcpRelayUrl,
        tabId: this.selectedTabId,
        tabUrl: this.autoConnectTabUrl,
        newTab: this.forceNewTab
      });

      if (!connectResponse || !connectResponse.success) {
        throw new Error(
          (connectResponse && connectResponse.error) || 'Tab connection failed',
        );
      }

      const connectedTabId = this.selectedTabId;
      if (connectedTabId) {
        this.selectedTabId = connectedTabId;
      }
      const tab = connectedTabId
        ? await chrome.tabs.get(connectedTabId).catch(() => null)
        : null;

      // Show connected view
      this.tabSelectionEl.classList.add('hidden');
      this.connectedViewEl.classList.remove('hidden');
      this.connectedTabTitleEl.textContent = tab?.title || 'Untitled';
      this.connectedTabIdEl.textContent = connectedTabId || 'Unknown';
      this.showStatus('Connected', 'success');

      // Set up disconnect button
      this.disconnectBtnEl.addEventListener('click', () => {
        this.disconnect();
      });

      return true;
    } catch (error) {
      this.showError(`Connection failed: ${error.message}`);
      return false;
    }
  }

  disconnect() {
    if (this.selectedTabId) {
      chrome.runtime.sendMessage({
        type: 'disconnectTab',
        tabId: this.selectedTabId
      });
    }
    this.reset();
  }

  reset() {
    this.selectedTabId = null;
    this.connectedViewEl.classList.add('hidden');
    this.tabSelectionEl.classList.remove('hidden');
    this.loadTabs();
  }

  showStatus(message, type = 'info') {
    this.statusEl.textContent = message;
    this.statusEl.className = `status ${type}`;
  }

  showError(message) {
    this.showStatus(message, 'error');
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new ConnectUI();
  });
} else {
  new ConnectUI();
}
