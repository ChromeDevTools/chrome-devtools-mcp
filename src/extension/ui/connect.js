/**
 * chrome-ai-bridge Connect UI
 * Handles tab selection and WebSocket connection to MCP server
 */

class ConnectUI {
  constructor() {
    this.selectedTabId = null;
    this.ws = null;
    this.mcpRelayUrl = null;
    this.token = null;

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
      this.token = params.get('token');
      const autoConnectTabId = params.get('tabId');

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
    if (!this.selectedTabId) {
      this.showError('No tab selected');
      return;
    }

    try {
      this.showStatus('Connecting to MCP server...', 'info');

      // Create WebSocket connection
      let wsUrl = this.mcpRelayUrl;
      if (this.token) {
        wsUrl += `?token=${encodeURIComponent(this.token)}`;
      }

      this.ws = new WebSocket(wsUrl);

      this.ws.addEventListener('open', () => {
        console.log('[ConnectUI] WebSocket connected');

        // Send connection request
        this.ws.send(JSON.stringify({
          type: 'connect',
          tabId: this.selectedTabId
        }));
      });

      this.ws.addEventListener('message', (event) => {
        this.handleMessage(event.data);
      });

      this.ws.addEventListener('close', (event) => {
        console.log('[ConnectUI] WebSocket closed:', event.code, event.reason);
        this.showError(`Connection closed: ${event.reason || 'Unknown reason'}`);
        this.reset();
      });

      this.ws.addEventListener('error', (error) => {
        console.error('[ConnectUI] WebSocket error:', error);
        this.showError('WebSocket connection error');
      });

      // Request background service worker to handle the connection
      const tab = await chrome.tabs.get(this.selectedTabId);

      // Send to background via chrome.runtime
      chrome.runtime.sendMessage({
        type: 'attachTab',
        tabId: this.selectedTabId,
        ws: this.ws
      });

      // Show connected view
      this.tabSelectionEl.classList.add('hidden');
      this.connectedViewEl.classList.remove('hidden');
      this.connectedTabTitleEl.textContent = tab.title || 'Untitled';
      this.connectedTabIdEl.textContent = this.selectedTabId;
      this.showStatus('Connected', 'success');

      // Set up disconnect button
      this.disconnectBtnEl.addEventListener('click', () => {
        this.disconnect();
      });

    } catch (error) {
      this.showError(`Connection failed: ${error.message}`);
    }
  }

  handleMessage(data) {
    try {
      const message = JSON.parse(data);

      if (message.type === 'ready') {
        console.log('[ConnectUI] Connection ready for tab', message.tabId);
      }

    } catch (error) {
      console.error('[ConnectUI] Failed to parse message:', error);
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
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
