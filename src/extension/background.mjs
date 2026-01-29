/**
 * chrome-ai-bridge Extension Background Service Worker
 * Playwright extension2-style flow:
 * - connectToRelay -> establishes WS only
 * - connectToTab -> binds a tab to that relay
 * - attachToTab / forwardCDPCommand for CDP passthrough
 */

function debugLog(...args) {
  console.log('[Extension]', ...args);
}

class RelayConnection {
  constructor(ws) {
    this._debuggee = {};
    this._ws = ws;
    this._closed = false;
    this._tabPromise = new Promise(resolve => (this._tabPromiseResolve = resolve));
    this._eventListener = this._onDebuggerEvent.bind(this);
    this._detachListener = this._onDebuggerDetach.bind(this);
    this._ws.onmessage = this._onMessage.bind(this);
    this._ws.onclose = () => this._onClose();
    chrome.debugger.onEvent.addListener(this._eventListener);
    chrome.debugger.onDetach.addListener(this._detachListener);
  }

  setTabId(tabId) {
    this._debuggee = {tabId};
    this._tabPromiseResolve();
  }

  sendReady(tabId) {
    this._sendMessage({
      type: 'ready',
      tabId,
    });
  }

  close(message) {
    if (
      this._ws.readyState === WebSocket.OPEN ||
      this._ws.readyState === WebSocket.CONNECTING
    ) {
      this._ws.close(1000, message);
    }
    this._onClose();
  }

  _onClose() {
    if (this._closed) return;
    this._closed = true;
    chrome.debugger.onEvent.removeListener(this._eventListener);
    chrome.debugger.onDetach.removeListener(this._detachListener);
    chrome.debugger.detach(this._debuggee).catch(() => {});
    if (this.onclose) this.onclose();
  }

  _onDebuggerEvent(source, method, params) {
    if (source.tabId !== this._debuggee.tabId) return;
    const sessionId = source.sessionId;
    this._sendMessage({
      method: 'forwardCDPEvent',
      params: {
        sessionId,
        method,
        params,
      },
    });
  }

  _onDebuggerDetach(source, reason) {
    if (source.tabId !== this._debuggee.tabId) return;
    this.close(`Debugger detached: ${reason}`);
    this._debuggee = {};
  }

  _onMessage(event) {
    this._onMessageAsync(event).catch(err =>
      debugLog('Error handling message:', err),
    );
  }

  async _onMessageAsync(event) {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (error) {
      this._sendMessage({
        error: {code: -32700, message: `Error parsing message: ${error.message}`},
      });
      return;
    }

    const response = {id: message.id};
    try {
      response.result = await this._handleCommand(message);
    } catch (error) {
      response.error = error.message;
    }
    this._sendMessage(response);
  }

  async _handleCommand(message) {
    if (message.method === 'attachToTab') {
      await this._tabPromise;
      debugLog('Attaching debugger to tab:', this._debuggee);
      await chrome.debugger.attach(this._debuggee, '1.3');
      const result = await chrome.debugger.sendCommand(
        this._debuggee,
        'Target.getTargetInfo',
      );
      return {targetInfo: result?.targetInfo};
    }
    if (!this._debuggee.tabId) {
      throw new Error(
        'No tab is connected. Please select a tab in the extension UI.',
      );
    }
    if (message.method === 'forwardCDPCommand') {
      const {sessionId, method, params} = message.params;
      const debuggerSession = {...this._debuggee, sessionId};
      return await chrome.debugger.sendCommand(
        debuggerSession,
        method,
        params,
      );
    }
    return {};
  }

  _sendMessage(message) {
    if (this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(message));
    }
  }
}

class TabShareExtension {
  constructor() {
    this._activeConnections = new Map();
    this._pendingTabSelection = new Map();
    chrome.tabs.onRemoved.addListener(this._onTabRemoved.bind(this));
    chrome.tabs.onActivated.addListener(this._onTabActivated.bind(this));
    chrome.tabs.onUpdated.addListener(this._onTabUpdated.bind(this));
    chrome.runtime.onMessage.addListener(this._onMessage.bind(this));
  }

  _onMessage(message, sender, sendResponse) {
    switch (message.type) {
      case 'connectToRelay':
        this._connectToRelay(sender.tab?.id, message.mcpRelayUrl).then(
          () => sendResponse({success: true}),
          error => sendResponse({success: false, error: error.message}),
        );
        return true;
      case 'getTabs':
        this._getTabs().then(
          tabs =>
            sendResponse({
              success: true,
              tabs,
              currentTabId: sender.tab?.id,
            }),
          error => sendResponse({success: false, error: error.message}),
        );
        return true;
      case 'connectToTab':
        this._connectTab(
          sender.tab?.id,
          message.tabId || sender.tab?.id,
          message.windowId || sender.tab?.windowId,
          message.mcpRelayUrl,
          message.tabUrl,
          message.newTab,
        ).then(
          () => sendResponse({success: true}),
          error => sendResponse({success: false, error: error.message}),
        );
        return true;
      case 'disconnect':
        this._disconnect(message.tabId).then(
          () => sendResponse({success: true}),
          error => sendResponse({success: false, error: error.message}),
        );
        return true;
    }
    return false;
  }

  async _connectToRelay(selectorTabId, mcpRelayUrl) {
    if (!mcpRelayUrl) throw new Error('Missing relay URL');
    const openSocket = async () => {
      const socket = new WebSocket(mcpRelayUrl);
      await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 5000);
        socket.onopen = () => {
          clearTimeout(timeoutId);
          resolve();
        };
        socket.onerror = () => {
          clearTimeout(timeoutId);
          reject(new Error('WebSocket error'));
        };
      });
      return socket;
    };
    let socket;
    let lastError;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        socket = await openSocket();
        break;
      } catch (error) {
        lastError = error;
        await new Promise(resolve => setTimeout(resolve, 400));
      }
    }
    if (!socket) {
      throw lastError || new Error('WebSocket error');
    }
    const connection = new RelayConnection(socket);
    connection.onclose = () => {
      this._pendingTabSelection.delete(selectorTabId);
    };
    this._pendingTabSelection.set(selectorTabId, {connection});
  }

  async _connectTab(
    selectorTabId,
    tabId,
    windowId,
    mcpRelayUrl,
    tabUrl,
    newTab,
  ) {
    if (!tabId && tabUrl) {
      tabId = await this._resolveTabId(tabUrl, newTab);
    }
    if (!tabId) throw new Error('No tab selected');

    const existingConnection = this._activeConnections.get(tabId);
    if (existingConnection) {
      existingConnection.close('Connection replaced for the same tab');
      this._activeConnections.delete(tabId);
      await this._setConnectedTab(tabId, false);
    }

    const pending = this._pendingTabSelection.get(selectorTabId);
    if (!pending) {
      // If no pending connection, create one now.
      await this._connectToRelay(selectorTabId, mcpRelayUrl);
    }
    const newPending = this._pendingTabSelection.get(selectorTabId);
    if (!newPending) throw new Error('No active MCP relay connection');

    this._pendingTabSelection.delete(selectorTabId);
    const connection = newPending.connection;
    connection.setTabId(tabId);
    connection.sendReady(tabId);
    connection.onclose = () => {
      this._activeConnections.delete(tabId);
      void this._setConnectedTab(tabId, false);
    };
    this._activeConnections.set(tabId, connection);
    await Promise.all([
      this._setConnectedTab(tabId, true),
      windowId ? chrome.windows.update(windowId, {focused: true}) : undefined,
      chrome.tabs.update(tabId, {active: true}),
    ]);
  }

  async _resolveTabId(tabUrl, newTab) {
    try {
      const urlObj = new URL(tabUrl);
      const pattern = `*://${urlObj.hostname}${urlObj.pathname}*`;
      const tabs = await chrome.tabs.query({url: pattern});
      if (tabs.length && !newTab) {
        const activeTab = tabs.find(tab => tab.active);
        return (activeTab || tabs[0]).id;
      }
    } catch {
      // ignore
    }
    if (!tabUrl) return undefined;
    const created = await chrome.tabs.create({url: tabUrl, active: true});
    return created.id;
  }

  async _getTabs() {
    const tabs = await chrome.tabs.query({});
    return tabs.filter(
      tab =>
        tab.url &&
        !['chrome:', 'edge:', 'devtools:'].some(scheme =>
          tab.url.startsWith(scheme),
        ),
    );
  }

  async _setConnectedTab(tabId, connected) {
    if (!tabId) return;
    if (connected) {
      await chrome.action.setBadgeText({tabId, text: '✓'});
      await chrome.action.setBadgeBackgroundColor({
        tabId,
        color: '#4CAF50',
      });
    } else {
      await chrome.action.setBadgeText({tabId, text: ''});
    }
  }

  async _disconnect(tabId) {
    if (tabId) {
      const connection = this._activeConnections.get(tabId);
      if (connection) connection.close('User disconnected');
      this._activeConnections.delete(tabId);
      await this._setConnectedTab(tabId, false);
      return;
    }
    for (const [connectedTabId, connection] of this._activeConnections) {
      connection.close('User disconnected');
      await this._setConnectedTab(connectedTabId, false);
    }
    this._activeConnections.clear();
  }

  _onTabRemoved(tabId) {
    const pending = this._pendingTabSelection.get(tabId);
    if (pending) {
      this._pendingTabSelection.delete(tabId);
      pending.connection.close('Browser tab closed');
      return;
    }
    const active = this._activeConnections.get(tabId);
    if (!active) return;
    active.close('Browser tab closed');
    this._activeConnections.delete(tabId);
  }

  _onTabActivated(activeInfo) {
    for (const [tabId, pending] of this._pendingTabSelection) {
      if (tabId === activeInfo.tabId) continue;
      if (!pending.timerId) {
        pending.timerId = setTimeout(() => {
          const existed = this._pendingTabSelection.delete(tabId);
          if (existed) {
            pending.connection.close('Tab inactive for 30 seconds');
            chrome.tabs.sendMessage(tabId, {type: 'connectionTimeout'});
          }
        }, 30000);
      }
    }
  }

  _onTabUpdated(tabId) {
    if (this._activeConnections.has(tabId)) {
      void this._setConnectedTab(tabId, true);
    }
  }
}

const tabShareExtension = new TabShareExtension();

const DISCOVERY_ALARM = 'mcp-relay-discovery';
const DISCOVERY_PORTS = [8765, 8766, 8767, 8768, 8769, 8770, 8771, 8772, 8773, 8774, 8775];
const lastRelayByPort = new Map();

function buildConnectUrl(wsUrl, tabUrl, newTab, autoMode = false) {
  const params = new URLSearchParams({mcpRelayUrl: wsUrl});
  if (tabUrl) params.set('tabUrl', tabUrl);
  if (newTab) params.set('newTab', 'true');
  if (autoMode) params.set('auto', 'true');
  return chrome.runtime.getURL(`ui/connect.html?${params.toString()}`);
}

async function focusTab(tabId, windowId) {
  try {
    if (windowId) {
      await chrome.windows.update(windowId, {focused: true});
    }
    await chrome.tabs.update(tabId, {active: true});
  } catch {
    // Ignore transient tab editing errors (e.g. user dragging tabs).
  }
}

async function getExistingConnectTab() {
  const connectBase = chrome.runtime.getURL('ui/connect.html');
  const tabs = await chrome.tabs.query({url: `${connectBase}*`});
  if (!tabs.length) return false;
  const tab = tabs[0];
  if (!tab?.id) return false;
  return tab;
}

async function ensureConnectUiTab(wsUrl, tabUrl, newTab, autoMode = false) {
  const existing = await getExistingConnectTab();
  if (existing?.id) {
    await focusTab(existing.id, existing.windowId);
    return existing;
  }
  const url = buildConnectUrl(wsUrl, tabUrl, newTab, autoMode);
  const created = await chrome.tabs.create({url, active: true});
  if (created?.id) {
    await focusTab(created.id, created.windowId);
  }
  return created;
}

async function fetchRelayInfo(port) {
  const discoveryUrl = `http://127.0.0.1:${port}/relay-info`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 800);
    const res = await fetch(discoveryUrl, {signal: controller.signal});
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.wsUrl) return null;
    return data;
  } catch {
    return null;
  }
}

async function autoConnectRelay(best) {
  const tabUrl = best?.data?.tabUrl;
  if (!tabUrl) return;
  if (best?.port) {
    const refreshed = await fetchRelayInfo(best.port);
    if (refreshed?.wsUrl) {
      best.data = refreshed;
    }
  }
  const selectorTab = await ensureConnectUiTab(
    best.data.wsUrl,
    tabUrl,
    Boolean(best.data.newTab),
    true,
  );
  if (!selectorTab?.id) return;

  let targetTabId;
  try {
    targetTabId = await tabShareExtension._resolveTabId(
      tabUrl,
      Boolean(best.data.newTab),
    );
  } catch {
    return;
  }
  if (!targetTabId) return;
  if (tabShareExtension._activeConnections?.has(targetTabId)) return;

  const targetTab = await chrome.tabs.get(targetTabId).catch(() => null);
  try {
    await tabShareExtension._connectToRelay(selectorTab.id, best.data.wsUrl);
    await tabShareExtension._connectTab(
      selectorTab.id,
      targetTabId,
      targetTab?.windowId,
      best.data.wsUrl,
      tabUrl,
      Boolean(best.data.newTab),
    );
  } catch {
    if (best?.port) {
      lastRelayByPort.delete(best.port);
    }
    return false;
  }
  return true;
}

async function autoOpenConnectUi() {
  let best = null;
  for (const port of DISCOVERY_PORTS) {
    const discoveryUrl = `http://127.0.0.1:${port}/relay-info`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 800);
      const res = await fetch(discoveryUrl, {signal: controller.signal});
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = await res.json();
      if (!data?.wsUrl) continue;
      const last = lastRelayByPort.get(port);
      const startedAt = data.startedAt || 0;
      const instanceId = data.instanceId || '';
      if (
        last &&
        last.wsUrl === data.wsUrl &&
        last.startedAt === startedAt &&
        last.instanceId === instanceId
      ) {
        continue;
      }
      lastRelayByPort.set(port, {
        wsUrl: data.wsUrl,
        startedAt,
        instanceId,
      });
      if (
        !best ||
        (data.startedAt && data.startedAt > best.startedAt)
      ) {
        best = {port, data};
      }
    } catch {
      // ignore
    }
  }
  if (best) {
    let ok = false;
    try {
      ok = await autoConnectRelay(best);
    } catch {
      ok = false;
    }
    if (!ok) {
      await ensureConnectUiTab(
        best.data.wsUrl,
        best.data.tabUrl || undefined,
        Boolean(best.data.newTab),
        false,
      );
    }
  }
}

function scheduleDiscovery() {
  chrome.alarms.create(DISCOVERY_ALARM, {
    delayInMinutes: 0.05,
    periodInMinutes: 1,
  });
  autoOpenConnectUi();
  // Fast polling window to catch new relay within 60s.
  let attempts = 0;
  const maxAttempts = 120; // 60s @ 500ms
  const burst = async () => {
    attempts += 1;
    await autoOpenConnectUi();
    if (attempts < maxAttempts) {
      setTimeout(burst, 500);
    }
  };
  setTimeout(burst, 200);
}

chrome.runtime.onInstalled.addListener(() => {
  scheduleDiscovery();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleDiscovery();
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm?.name === DISCOVERY_ALARM) {
    autoOpenConnectUi();
  }
});

scheduleDiscovery();
