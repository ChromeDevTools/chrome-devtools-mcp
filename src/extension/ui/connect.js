/**
 * chrome-ai-bridge Connect UI
 * Extension2-style simple flow:
 * 1. MCP server opens connect.html?mcpRelayUrl=ws://...
 * 2. Tab list is displayed
 * 3. User selects tab -> Click "Connect"
 * 4. Done
 */

class ConnectUI {
  constructor() {
    this.mcpRelayUrl = null;
    this.sessionId = null;
    this.allowTabTakeover = false;
    this.debugPanelVisible = false;
    this.autoRefreshInterval = null;

    // DOM elements
    this.statusEl = document.getElementById('status');
    this.statusTextEl = document.getElementById('status-text');
    this.statusIconEl = this.statusEl.querySelector('.status-icon');
    this.tabSelectionEl = document.getElementById('tab-selection');
    this.tabsListEl = document.getElementById('tabs-list');
    this.connectedViewEl = document.getElementById('connected-view');
    this.connectedTabTitleEl = document.getElementById('connected-tab-title');
    this.connectedTabIdEl = document.getElementById('connected-tab-id');
    this.disconnectBtnEl = document.getElementById('disconnect-btn');
    this.errorViewEl = document.getElementById('error-view');
    this.errorMessageEl = document.getElementById('error-message');

    // Debug panel elements
    this.debugToggleEl = document.getElementById('debug-toggle');
    this.debugPanelEl = document.getElementById('debug-panel');
    this.logFilterEl = document.getElementById('log-filter');
    this.refreshLogsEl = document.getElementById('refresh-logs');
    this.clearLogsEl = document.getElementById('clear-logs');
    this.exportLogsEl = document.getElementById('export-logs');
    this.debugStatsEl = document.getElementById('debug-stats');
    this.logOutputEl = document.getElementById('log-output');

    this.init();
    this.initDebugPanel();
  }

  async init() {
    try {
      // Parse URL parameters (Extension2 style: parameters are always provided)
      const params = new URLSearchParams(window.location.search);
      this.mcpRelayUrl = params.get('mcpRelayUrl');
      this.sessionId = params.get('sessionId');
      this.allowTabTakeover = params.get('allowTabTakeover') === 'true';

      // Validate relay URL
      if (!this.mcpRelayUrl) {
        this.showError('Missing mcpRelayUrl parameter. Make sure the MCP server is running.');
        return;
      }

      if (!this.validateRelayUrl()) {
        return;
      }

      // Show tab selection UI
      await this.loadTabs();

    } catch (error) {
      this.showError(`Initialization failed: ${error.message}`);
    }
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

  async loadTabs() {
    try {
      const tabs = await chrome.tabs.query({});

      // Filter out extension pages and chrome:// URLs
      const filteredTabs = tabs.filter(tab => {
        if (!tab.url) return false;
        if (tab.url.startsWith('chrome://')) return false;
        if (tab.url.startsWith('chrome-extension://')) return false;
        if (tab.url.startsWith('devtools://')) return false;
        return true;
      });

      if (filteredTabs.length === 0) {
        this.showError('No tabs available. Open a web page first.');
        return;
      }

      this.renderTabs(filteredTabs);
      this.showStatus('Select a tab to connect', 'info', '📋');
      this.tabSelectionEl.classList.remove('hidden');

    } catch (error) {
      this.showError(`Failed to load tabs: ${error.message}`);
    }
  }

  renderTabs(tabs) {
    this.tabsListEl.innerHTML = '';

    // Sort tabs: active tab first, then by window/tab order
    const sortedTabs = [...tabs].sort((a, b) => {
      if (a.active && !b.active) return -1;
      if (!a.active && b.active) return 1;
      if (a.windowId !== b.windowId) return a.windowId - b.windowId;
      return a.index - b.index;
    });

    sortedTabs.forEach(tab => {
      const tabItem = document.createElement('div');
      tabItem.className = `tab-item${tab.active ? ' active' : ''}`;
      tabItem.dataset.tabId = tab.id;

      // Favicon
      const faviconEl = document.createElement('div');
      faviconEl.className = 'tab-favicon';
      if (tab.favIconUrl && !tab.favIconUrl.startsWith('chrome://')) {
        const img = document.createElement('img');
        img.src = tab.favIconUrl;
        img.onerror = () => { faviconEl.textContent = '🌐'; };
        faviconEl.appendChild(img);
      } else {
        faviconEl.textContent = '🌐';
      }

      // Tab info
      const infoEl = document.createElement('div');
      infoEl.className = 'tab-info';

      const titleRow = document.createElement('div');
      titleRow.className = 'tab-title-row';

      const titleEl = document.createElement('span');
      titleEl.className = 'tab-title';
      titleEl.textContent = tab.title || 'Untitled';
      titleRow.appendChild(titleEl);

      if (tab.active) {
        const badge = document.createElement('span');
        badge.className = 'tab-active-badge';
        badge.textContent = 'Active';
        titleRow.appendChild(badge);
      }

      const urlEl = document.createElement('div');
      urlEl.className = 'tab-url';
      urlEl.textContent = tab.url || '';

      const idEl = document.createElement('div');
      idEl.className = 'tab-id';
      idEl.textContent = `Tab ID: ${tab.id}`;

      infoEl.appendChild(titleRow);
      infoEl.appendChild(urlEl);
      infoEl.appendChild(idEl);

      // Connect button
      const connectBtn = document.createElement('button');
      connectBtn.className = 'tab-connect-btn';
      connectBtn.textContent = 'Connect';
      connectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.connectToTab(tab);
      });

      tabItem.appendChild(faviconEl);
      tabItem.appendChild(infoEl);
      tabItem.appendChild(connectBtn);

      // Also connect on row click
      tabItem.addEventListener('click', () => {
        this.connectToTab(tab);
      });

      this.tabsListEl.appendChild(tabItem);
    });
  }

  async connectToTab(tab) {
    try {
      this.showStatus(`Connecting to "${tab.title}"...`, 'info', '⏳');

      // Step 1: Connect to relay
      const relayResponse = await chrome.runtime.sendMessage({
        type: 'connectToRelay',
        mcpRelayUrl: this.mcpRelayUrl,
        sessionId: this.sessionId,
      });

      if (!relayResponse || !relayResponse.success) {
        throw new Error(relayResponse?.error || 'Relay connection failed');
      }

      // Step 2: Connect to tab
      const connectResponse = await chrome.runtime.sendMessage({
        type: 'connectToTab',
        mcpRelayUrl: this.mcpRelayUrl,
        tabId: tab.id,
        windowId: tab.windowId,
        sessionId: this.sessionId,
        allowTabTakeover: this.allowTabTakeover,
      });

      if (!connectResponse || !connectResponse.success) {
        throw new Error(connectResponse?.error || 'Tab connection failed');
      }

      // Show connected view
      this.tabSelectionEl.classList.add('hidden');
      this.connectedViewEl.classList.remove('hidden');
      this.connectedTabTitleEl.textContent = tab.title || 'Untitled';
      this.connectedTabIdEl.textContent = tab.id;
      this.showStatus('Connected', 'success', '✅');

      // Set up disconnect button
      this.disconnectBtnEl.onclick = () => this.disconnect(tab.id);

    } catch (error) {
      this.showError(`Connection failed: ${error.message}`);
    }
  }

  async disconnect(tabId) {
    try {
      await chrome.runtime.sendMessage({
        type: 'disconnect',
        tabId: tabId
      });
    } catch {
      // Ignore disconnect errors
    }
    this.reset();
  }

  reset() {
    this.connectedViewEl.classList.add('hidden');
    this.errorViewEl.classList.add('hidden');
    this.loadTabs();
  }

  showStatus(message, type = 'info', icon = '⏳') {
    this.statusTextEl.textContent = message;
    this.statusIconEl.textContent = icon;
    this.statusEl.className = `status ${type}`;
    this.statusEl.classList.remove('hidden');
    this.errorViewEl.classList.add('hidden');
  }

  showError(message) {
    this.showStatus(message, 'error', '❌');
    this.tabSelectionEl.classList.add('hidden');
    this.connectedViewEl.classList.add('hidden');
    this.errorViewEl.classList.remove('hidden');
    this.errorMessageEl.textContent = message;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ========== Debug Panel Methods ==========

  initDebugPanel() {
    this.debugToggleEl.addEventListener('click', () => {
      this.toggleDebugPanel();
    });

    this.logFilterEl.addEventListener('change', () => {
      this.refreshLogs();
    });

    this.refreshLogsEl.addEventListener('click', () => {
      this.refreshLogs();
    });

    this.clearLogsEl.addEventListener('click', () => {
      this.clearLogs();
    });

    this.exportLogsEl.addEventListener('click', () => {
      this.exportLogs();
    });
  }

  toggleDebugPanel() {
    this.debugPanelVisible = !this.debugPanelVisible;
    if (this.debugPanelVisible) {
      this.debugPanelEl.classList.remove('hidden');
      this.debugToggleEl.textContent = 'Hide Debug Logs';
      this.refreshLogs();
      this.autoRefreshInterval = setInterval(() => this.refreshLogs(), 2000);
    } else {
      this.debugPanelEl.classList.add('hidden');
      this.debugToggleEl.textContent = 'Show Debug Logs';
      if (this.autoRefreshInterval) {
        clearInterval(this.autoRefreshInterval);
        this.autoRefreshInterval = null;
      }
    }
  }

  async refreshLogs() {
    try {
      const filter = this.logFilterEl.value || null;
      const response = await chrome.runtime.sendMessage({
        type: 'getDebugLogs',
        filter: filter,
        limit: 100
      });

      if (!response || !response.success) {
        this.logOutputEl.textContent = 'Failed to fetch logs';
        return;
      }

      // Update stats
      const stats = response.stats;
      const state = response.state;
      this.debugStatsEl.innerHTML = `
        <strong>Total Logs:</strong> ${stats.total} |
        <strong>Active Connections:</strong> ${state.activeConnections?.length || 0} |
        <strong>Pending:</strong> ${state.pendingTabSelection?.length || 0}
        <br>
        <strong>By Category:</strong>
        ${Object.entries(stats.byCategory || {}).map(([cat, count]) => `${cat}: ${count}`).join(', ') || 'none'}
      `;

      // Render logs
      const logs = response.logs || [];
      if (logs.length === 0) {
        this.logOutputEl.innerHTML = '<span style="color: #888;">No logs yet</span>';
        return;
      }

      const html = logs.map(log => this.formatLogEntry(log)).join('');
      this.logOutputEl.innerHTML = html;

      // Scroll to bottom
      this.logOutputEl.scrollTop = this.logOutputEl.scrollHeight;
    } catch (error) {
      this.logOutputEl.textContent = `Error: ${error.message}`;
    }
  }

  formatLogEntry(log) {
    const ts = log.ts ? log.ts.split('T')[1].split('.')[0] : '';
    const cat = log.category || 'unknown';
    const catClass = `cat-${cat}`;
    const msg = this.escapeHtml(log.message || '');
    const data = log.data ? this.escapeHtml(JSON.stringify(log.data)) : '';

    return `<div class="log-entry">` +
      `<span class="ts">${ts}</span> ` +
      `<span class="${catClass}">[${cat.toUpperCase()}]</span> ` +
      `<span class="msg">${msg}</span>` +
      (data ? `<span class="data">${data}</span>` : '') +
      `</div>`;
  }

  async clearLogs() {
    try {
      await chrome.runtime.sendMessage({ type: 'clearDebugLogs' });
      this.refreshLogs();
    } catch (error) {
      this.showError(`Failed to clear logs: ${error.message}`);
    }
  }

  async exportLogs() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'getDebugLogs',
        filter: null,
        limit: 500
      });

      if (!response || !response.success) {
        this.showError('Failed to export logs');
        return;
      }

      const exportData = {
        timestamp: new Date().toISOString(),
        stats: response.stats,
        state: response.state,
        logs: response.logs
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chrome-ai-bridge-debug-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      this.showError(`Failed to export logs: ${error.message}`);
    }
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
