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

    // DOM elements
    this.statusEl = document.getElementById('status');
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

      // Validate parameters
      if (!this.mcpRelayUrl) {
        this.showError('Missing mcpRelayUrl parameter');
        return;
      }

      // Validate loopback address (security)
      const url = new URL(this.mcpRelayUrl);
      if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
        this.showError('Invalid relay URL: must be loopback address (127.0.0.1)');
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
        await this.connect();
        return;
      }

      // Otherwise, show tab selection UI
      await this.loadTabs();

    } catch (error) {
      this.showError(`Initialization failed: ${error.message}`);
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
      return;
    }

    try {
      this.showStatus('Connecting to MCP server...', 'info');

      const response = await chrome.runtime.sendMessage({
        type: 'connectToRelay',
        mcpRelayUrl: this.mcpRelayUrl,
        tabId: this.selectedTabId,
        tabUrl: this.autoConnectTabUrl,
        newTab: this.forceNewTab
      });

      if (!response || !response.success) {
        throw new Error((response && response.error) || 'Connection failed');
      }

      const connectedTabId = response.tabId || this.selectedTabId;
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

    } catch (error) {
      this.showError(`Connection failed: ${error.message}`);
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
