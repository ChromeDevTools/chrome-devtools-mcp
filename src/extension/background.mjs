/**
 * chrome-ai-bridge Extension Background Service Worker
 * Playwright extension2-style flow:
 * - connectToRelay -> establishes WS only
 * - connectToTab -> binds a tab to that relay
 * - attachToTab / forwardCDPCommand for CDP passthrough
 */

// ============================================
// Logging System
// ============================================
const LOG_LEVEL = {DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3};
let currentLogLevel = LOG_LEVEL.DEBUG;

/**
 * Enhanced logger with level, category, and Storage persistence
 */
function log(level, category, message, data = {}) {
  const timestamp = new Date().toISOString();
  const levelName = Object.keys(LOG_LEVEL).find(k => LOG_LEVEL[k] === level) || 'INFO';
  const entry = {timestamp, level: levelName, category, message, data};

  // Console output
  const prefix = `[${timestamp}] [${levelName}] [${category}]`;
  if (level >= currentLogLevel) {
    const dataStr = Object.keys(data).length > 0 ? JSON.stringify(data) : '';
    console.log(prefix, message, dataStr);
  }

  // Save to Storage (async, fire-and-forget)
  saveLogEntry(entry);
}

async function saveLogEntry(entry) {
  try {
    const result = await chrome.storage.local.get('logs');
    const logs = result.logs || [];
    logs.push(entry);
    // Keep only last 100 entries
    while (logs.length > 100) {
      logs.shift();
    }
    await chrome.storage.local.set({logs});
  } catch {
    // Ignore storage errors
  }
}

// Convenience functions
function logDebug(category, message, data) {
  log(LOG_LEVEL.DEBUG, category, message, data);
}
function logInfo(category, message, data) {
  log(LOG_LEVEL.INFO, category, message, data);
}
function logWarn(category, message, data) {
  log(LOG_LEVEL.WARN, category, message, data);
}
function logError(category, message, data) {
  log(LOG_LEVEL.ERROR, category, message, data);
}

// Legacy debug log (for compatibility)
function debugLog(...args) {
  logDebug('general', args.join(' '));
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

    // Handle keep-alive ping from relay server
    if (message.type === 'ping') {
      this._sendMessage({ type: 'pong' });
      logDebug('keepalive', 'Received ping, sent pong');
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

      // デバッグ: アタッチ前にタブの状態を確認
      try {
        const tabInfo = await chrome.tabs.get(this._debuggee.tabId);
        logInfo('attach', 'Tab info before attach', {
          tabId: tabInfo.id,
          url: tabInfo.url,
          title: tabInfo.title,
          status: tabInfo.status,
          active: tabInfo.active,
        });
      } catch (e) {
        logError('attach', 'Failed to get tab info', {error: e.message});
      }

      await chrome.debugger.attach(this._debuggee, '1.3');
      const result = await chrome.debugger.sendCommand(
        this._debuggee,
        'Target.getTargetInfo',
      );
      logInfo('attach', 'Target info after attach', {targetInfo: result?.targetInfo});
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

      // デバッグ: CDPコマンドのログ（Runtime.evaluateのみ詳細）
      if (method === 'Runtime.evaluate') {
        logDebug('cdp', `Sending ${method}`, {
          tabId: this._debuggee.tabId,
          sessionId,
          expression: params?.expression?.slice(0, 100),
        });
      }

      const result = await chrome.debugger.sendCommand(
        debuggerSession,
        method,
        params,
      );

      // デバッグ: Runtime.evaluateの結果
      if (method === 'Runtime.evaluate') {
        logDebug('cdp', `Result of ${method}`, {
          value: result?.result?.value,
          type: result?.result?.type,
          subtype: result?.result?.subtype,
        });
      }

      return result;
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
    if (!mcpRelayUrl) {
      logError('relay', 'Missing relay URL');
      throw new Error('Missing relay URL');
    }
    logInfo('relay', 'Connecting to relay', {mcpRelayUrl, selectorTabId});

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
      logDebug('relay', `WebSocket attempt ${attempt + 1}/4`, {mcpRelayUrl});
      try {
        socket = await openSocket();
        logInfo('relay', 'WebSocket connected', {attempt: attempt + 1});
        break;
      } catch (error) {
        lastError = error;
        logWarn('relay', `WebSocket attempt ${attempt + 1} failed`, {error: error.message});
        await new Promise(resolve => setTimeout(resolve, 400));
      }
    }
    if (!socket) {
      logError('relay', 'All WebSocket attempts failed', {lastError: lastError?.message});
      throw lastError || new Error('WebSocket error');
    }
    const connection = new RelayConnection(socket);
    connection.onclose = () => {
      logInfo('relay', 'Connection closed', {selectorTabId});
      this._pendingTabSelection.delete(selectorTabId);
    };
    this._pendingTabSelection.set(selectorTabId, {connection});
    logInfo('relay', 'Relay connection established', {selectorTabId});
  }

  async _connectTab(
    selectorTabId,
    tabId,
    windowId,
    mcpRelayUrl,
    tabUrl,
    newTab,
  ) {
    logInfo('connect', '_connectTab called', {selectorTabId, tabId, tabUrl, newTab});

    if (!tabId && tabUrl) {
      logDebug('connect', 'Resolving tabId from URL', {tabUrl, newTab});
      tabId = await this._resolveTabId(tabUrl, undefined, newTab);
    }
    if (!tabId) {
      logError('connect', 'No tab selected');
      throw new Error('No tab selected');
    }

    const existingConnection = this._activeConnections.get(tabId);
    if (existingConnection) {
      logInfo('connect', 'Replacing existing connection', {tabId});
      existingConnection.close('Connection replaced for the same tab');
      this._activeConnections.delete(tabId);
      await this._setConnectedTab(tabId, false);
    }

    const pending = this._pendingTabSelection.get(selectorTabId);
    if (!pending) {
      logDebug('connect', 'No pending connection, creating relay', {selectorTabId, mcpRelayUrl});
      // If no pending connection, create one now.
      await this._connectToRelay(selectorTabId, mcpRelayUrl);
    }
    const newPending = this._pendingTabSelection.get(selectorTabId);
    if (!newPending) {
      logError('connect', 'No active MCP relay connection');
      throw new Error('No active MCP relay connection');
    }

    this._pendingTabSelection.delete(selectorTabId);
    const connection = newPending.connection;
    connection.setTabId(tabId);
    connection.sendReady(tabId);
    connection.onclose = () => {
      logInfo('connect', 'Tab connection closed', {tabId});
      this._activeConnections.delete(tabId);
      void this._setConnectedTab(tabId, false);
    };
    this._activeConnections.set(tabId, connection);
    logInfo('connect', 'Tab connected successfully', {tabId, windowId});
    // バッジのみ設定（フォーカスはMCPサーバー側が必要に応じて制御）
    await this._setConnectedTab(tabId, true);
  }

  async _resolveTabId(tabUrl, tabId, newTab, active = true) {
    logDebug('resolve', '_resolveTabId called', {tabUrl, tabId, newTab, active});

    // デバッグ: 全タブの一覧を取得
    const allTabs = await chrome.tabs.query({});
    const tabSummary = allTabs.map(t => ({id: t.id, url: t.url?.slice(0, 60), active: t.active}));
    logInfo('resolve', 'All tabs', {count: allTabs.length, tabs: tabSummary.slice(0, 10)});

    // Priority 1: If tabId is provided, try to use it directly
    if (tabId && !newTab) {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab && tabUrl) {
          const urlObj = new URL(tabUrl);
          // Check if the tab's URL matches the expected hostname
          if (tab.url && tab.url.includes(urlObj.hostname)) {
            logInfo('resolve', 'Reusing tab by tabId', {tabId, url: tab.url});
            return tabId;
          }
          logDebug('resolve', 'Tab URL mismatch, continuing search', {
            tabId,
            expectedHost: urlObj.hostname,
            actualUrl: tab.url
          });
        }
      } catch (error) {
        logDebug('resolve', 'Tab not found by tabId (may be closed)', {tabId, error: error.message});
        // Tab may have been closed, continue with URL-based search
      }
    }

    // Priority 2: Search by URL pattern
    try {
      const urlObj = new URL(tabUrl);
      const pattern = `*://${urlObj.hostname}${urlObj.pathname}*`;
      const tabs = await chrome.tabs.query({url: pattern});
      logDebug('resolve', `Found ${tabs.length} matching tabs`, {pattern, tabCount: tabs.length});
      if (tabs.length && !newTab) {
        // Prefer active tab, then the most recently accessed
        const activeTab = tabs.find(tab => tab.active);
        const selectedTab = activeTab || tabs[0];
        logInfo('resolve', 'Reusing existing tab by URL', {tabId: selectedTab.id, url: selectedTab.url});
        return selectedTab.id;
      }
    } catch (error) {
      logWarn('resolve', 'Error querying tabs', {error: error.message});
      // ignore
    }

    // Priority 3: Create new tab
    if (!tabUrl) {
      logWarn('resolve', 'No tabUrl provided');
      return undefined;
    }
    logInfo('resolve', 'Creating new tab', {url: tabUrl, active});
    const created = await chrome.tabs.create({url: tabUrl, active});
    logInfo('resolve', 'New tab created', {tabId: created.id, active});
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
    try {
      if (connected) {
        await chrome.action.setBadgeText({tabId, text: '✓'});
        await chrome.action.setBadgeBackgroundColor({
          tabId,
          color: '#4CAF50',
        });
      } else {
        await chrome.action.setBadgeText({tabId, text: ''});
      }
    } catch {
      // Tab no longer exists, ignore
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

// Interval管理: 重複防止
let discoveryIntervalId = null;

// リロード時クールダウン: 5秒間は「新しいrelay」検出をスキップ
const extensionStartTime = Date.now();
const COOLDOWN_MS = 5000;


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
  const preferredTabId = best?.data?.tabId;
  logDebug('auto-connect', 'autoConnectRelay called', {port: best?.port, tabUrl, tabId: preferredTabId, newTab: best?.data?.newTab});

  if (!tabUrl) {
    logDebug('auto-connect', 'No tabUrl, skipping');
    return false;  // tabUrl がなければ失敗
  }

  if (best?.port) {
    const refreshed = await fetchRelayInfo(best.port);
    if (refreshed?.wsUrl) {
      best.data = refreshed;
      logDebug('auto-connect', 'Refreshed relay info', {wsUrl: refreshed.wsUrl, tabId: refreshed.tabId});
    }
  }

  // tabUrl があれば、connect.html を開かずに直接接続
  // preferredTabId があれば優先的に使用
  let targetTabId;
  try {
    // autoConnectRelay経由の場合はフォーカスしない（active: false）
    // リロード時に勝手にタブがフォーカスされる問題を防ぐ
    targetTabId = await tabShareExtension._resolveTabId(
      tabUrl,
      preferredTabId,
      Boolean(best.data.newTab),
      false,  // active: false - 自動接続時はタブをフォーカスしない
    );
  } catch (error) {
    logError('auto-connect', 'Failed to resolve tab', {tabUrl, tabId: preferredTabId, error: error.message});
    return false;
  }
  if (!targetTabId) {
    logWarn('auto-connect', 'No targetTabId resolved');
    return false;
  }
  if (tabShareExtension._activeConnections?.has(targetTabId)) {
    logInfo('auto-connect', 'Tab already connected', {targetTabId});
    return true; // 既に接続済み
  }

  const targetTab = await chrome.tabs.get(targetTabId).catch(() => null);

  // selectorId として wsUrl ベースのユニークIDを使用（connect.html 不要）
  const selectorId = `auto:${best.data.wsUrl}`;
  logInfo('auto-connect', 'Attempting auto-connect', {selectorId, targetTabId, wsUrl: best.data.wsUrl});

  try {
    await tabShareExtension._connectToRelay(selectorId, best.data.wsUrl);
    await tabShareExtension._connectTab(
      selectorId,
      targetTabId,
      targetTab?.windowId,
      best.data.wsUrl,
      tabUrl,
      Boolean(best.data.newTab),
    );
    logInfo('auto-connect', 'Auto-connect successful', {targetTabId, tabUrl});
  } catch (err) {
    logError('auto-connect', 'autoConnectRelay failed', {error: err.message, tabUrl});
    debugLog('autoConnectRelay failed:', err);
    if (best?.port) {
      lastRelayByPort.delete(best.port);
    }
    return false;
  }
  return true;
}

async function autoOpenConnectUi() {
  // リロード直後はタブを開かない（既存MCPサーバーとの再接続を防ぐ）
  const elapsed = Date.now() - extensionStartTime;
  if (elapsed < COOLDOWN_MS) {
    logDebug('discovery', `Cooldown active (${elapsed}ms < ${COOLDOWN_MS}ms), skipping`);
    return;
  }

  // 複数の relay を同時にサポート（ChatGPT + Gemini）
  const newRelays = [];
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
      logInfo('discovery', 'New relay detected', {port, tabUrl: data.tabUrl, wsUrl: data.wsUrl});
      lastRelayByPort.set(port, {
        wsUrl: data.wsUrl,
        startedAt,
        instanceId,
      });
      newRelays.push({port, data});
    } catch {
      // ignore
    }
  }

  if (newRelays.length > 0) {
    logInfo('discovery', `Processing ${newRelays.length} new relay(s)`);
  }

  // 全ての新しい relay を処理（並列ではなく順次）
  for (const relay of newRelays) {
    logInfo('discovery', 'Processing relay', {port: relay.port, tabUrl: relay.data.tabUrl});
    debugLog('Processing new relay:', relay.port, relay.data.tabUrl);
    let ok = false;
    try {
      ok = await autoConnectRelay(relay);
    } catch (err) {
      logError('discovery', 'autoConnectRelay error', {error: err.message, port: relay.port});
      debugLog('autoConnectRelay error:', err);
      ok = false;
    }
    if (!ok) {
      logInfo('discovery', 'Falling back to connect UI', {port: relay.port});
      await ensureConnectUiTab(
        relay.data.wsUrl,
        relay.data.tabUrl || undefined,
        Boolean(relay.data.newTab),
        false,
      );
    }
  }
}

// Discovery is now passive - only triggered by MCP server requests
// The extension no longer auto-opens tabs on install/startup
// MCPサーバーからの明示的な接続要求時のみ動作する

// Clear any existing discovery alarms from previous sessions
// This prevents leftover alarms from auto-opening tabs
chrome.alarms.clear(DISCOVERY_ALARM).then(() => {
  logInfo('background', 'Cleared existing discovery alarm (if any)');
}).catch(() => {
  // Ignore errors - alarm may not exist
});

// Keep-alive alarm to prevent Service Worker from sleeping
const KEEPALIVE_ALARM = 'keepAlive';

// 30秒間隔（periodInMinutesの最小値は0.5 = 30秒）
chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) {
    const activeCount = tabShareExtension._activeConnections.size;
    const pendingCount = tabShareExtension._pendingTabSelection.size;
    if (activeCount > 0 || pendingCount > 0) {
      logDebug('keepalive', 'Alarm triggered', { activeCount, pendingCount });
    }

    // Discovery pollingが停止していたら再開
    // ただし、アクティブな接続がある場合のみ（Chrome起動時の不要な再開を防ぐ）
    if (discoveryIntervalId === null && (activeCount > 0 || pendingCount > 0)) {
      logInfo('keepalive', 'Discovery was stopped but has active connections, restarting...');
      scheduleDiscovery();
    }
  }
});

// Note: We no longer register an onAlarm listener for DISCOVERY_ALARM
// The scheduleDiscovery function is only called on explicit MCP requests

// scheduleDiscovery is called only when MCP server explicitly requests connection
// Note: Infinite polling while extension is alive - no timeout limit
function scheduleDiscovery() {
  // 重複防止: 既にintervalが動いていれば何もしない
  if (discoveryIntervalId !== null) {
    logInfo('discovery', 'Discovery already running, skipping duplicate call');
    return;
  }

  logInfo('discovery', 'scheduleDiscovery called - starting infinite polling');
  autoOpenConnectUi();
  // 無制限ポーリング（拡張機能が生きている限り継続）
  discoveryIntervalId = setInterval(async () => {
    await autoOpenConnectUi();
  }, 500);
}

// Discovery is now PASSIVE - does NOT auto-start on Chrome startup
// This prevents the issue where Chrome restart opens many connect.html tabs
// Discovery is started only when:
// 1. User clicks the extension icon
// 2. Keep-alive alarm detects an active connection needs re-discovery
//
// Removed: onInstalled, onStartup, and immediate scheduleDiscovery() calls

// Start discovery when user clicks extension icon
chrome.action.onClicked.addListener(() => {
  logInfo('action', 'Extension icon clicked - starting discovery');
  scheduleDiscovery();
});

logInfo('background', 'Extension loaded (passive mode - click icon to start discovery)');
