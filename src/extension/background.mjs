/**
 * chrome-ai-bridge Extension Background Service Worker
 * Playwright extension2-style flow:
 * - connectToRelay -> establishes WS only
 * - connectToTab -> binds a tab to that relay
 * - attachToTab / forwardCDPCommand for CDP passthrough
 */

import { debugLogger } from './debug-logger.mjs';

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
    this._ws.onclose = (event) => {
      debugLogger.log('ws', 'WebSocket closed', {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean
      });
      this._onClose();
    };
    this._ws.onerror = (event) => {
      debugLogger.error('WebSocket error', { readyState: this._ws.readyState });
    };
    chrome.debugger.onEvent.addListener(this._eventListener);
    chrome.debugger.onDetach.addListener(this._detachListener);
    debugLogger.log('ws', 'RelayConnection created');
  }

  setTabId(tabId) {
    debugLogger.log('tab', 'setTabId called', { tabId });
    this._debuggee = {tabId};
    this._tabPromiseResolve();
  }

  sendReady(tabId) {
    debugLogger.log('ws', 'Sending ready message', { tabId });
    this._sendMessage({
      type: 'ready',
      tabId,
    });
  }

  close(message) {
    debugLogger.log('ws', 'close() called', { message, readyState: this._ws.readyState });
    if (
      this._ws.readyState === WebSocket.OPEN ||
      this._ws.readyState === WebSocket.CONNECTING
    ) {
      this._ws.close(1000, message);
    }
    this._onClose();
  }

  _onClose() {
    if (this._closed) {
      debugLogger.log('ws', '_onClose() called but already closed');
      return;
    }
    this._closed = true;
    debugLogger.log('ws', '_onClose() - cleaning up', { tabId: this._debuggee.tabId });
    chrome.debugger.onEvent.removeListener(this._eventListener);
    chrome.debugger.onDetach.removeListener(this._detachListener);
    chrome.debugger.detach(this._debuggee).catch(() => {});
    if (this.onclose) this.onclose();
  }

  _onDebuggerEvent(source, method, params) {
    if (source.tabId !== this._debuggee.tabId) return;
    const sessionId = source.sessionId;
    debugLogger.log('cdp', `CDP event: ${method}`, { sessionId, hasParams: !!params });
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
    debugLogger.log('cdp', 'Debugger detached', { tabId: source.tabId, reason });
    this.close(`Debugger detached: ${reason}`);
    this._debuggee = {};
  }

  _onMessage(event) {
    this._onMessageAsync(event).catch(err => {
      debugLogger.error('Error handling message', err);
      debugLog('Error handling message:', err);
    });
  }

  async _onMessageAsync(event) {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (error) {
      debugLogger.error('Failed to parse message', { error: error.message, data: event.data });
      this._sendMessage({
        error: {code: -32700, message: `Error parsing message: ${error.message}`},
      });
      return;
    }

    debugLogger.log('ws', `Received message: ${message.method || 'response'}`, { id: message.id });

    const response = {id: message.id};
    try {
      response.result = await this._handleCommand(message);
      debugLogger.log('ws', `Command succeeded: ${message.method}`, { id: message.id });
    } catch (error) {
      debugLogger.error(`Command failed: ${message.method}`, { id: message.id, error: error.message });
      response.error = error.message;
    }
    this._sendMessage(response);
  }

  async _handleCommand(message) {
    if (message.method === 'attachToTab') {
      await this._tabPromise;
      debugLogger.log('cdp', 'Attaching debugger to tab', this._debuggee);
      debugLog('Attaching debugger to tab:', this._debuggee);
      await chrome.debugger.attach(this._debuggee, '1.3');
      debugLogger.log('cdp', 'Debugger attached successfully');
      const result = await chrome.debugger.sendCommand(
        this._debuggee,
        'Target.getTargetInfo',
      );
      debugLogger.log('cdp', 'Got target info', { targetId: result?.targetInfo?.targetId });
      return {targetInfo: result?.targetInfo};
    }
    if (!this._debuggee.tabId) {
      debugLogger.error('No tab connected');
      throw new Error(
        'No tab is connected. Please select a tab in the extension UI.',
      );
    }
    if (message.method === 'forwardCDPCommand') {
      const {sessionId, method, params} = message.params;
      debugLogger.log('cdp', `Forwarding CDP command: ${method}`, { sessionId });
      const debuggerSession = {...this._debuggee, sessionId};
      const result = await chrome.debugger.sendCommand(
        debuggerSession,
        method,
        params,
      );
      debugLogger.log('cdp', `CDP command completed: ${method}`);
      return result;
    }
    return {};
  }

  _sendMessage(message) {
    if (this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(message));
    } else {
      const msgInfo = message.method || message.type || message.id || 'unknown';
      debugLogger.log('ws', `Message dropped (WebSocket not open)`, { msgInfo, readyState: this._ws.readyState });
      console.warn('[Extension] Message dropped: WebSocket not open', msgInfo);
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
    debugLogger.log('relay', 'TabShareExtension initialized');
  }

  _onMessage(message, sender, sendResponse) {
    debugLogger.log('relay', `Received message: ${message.type}`, { from: sender.tab?.id });

    switch (message.type) {
      case 'connectToRelay':
        this._connectToRelay(sender.tab?.id, message.mcpRelayUrl).then(
          () => {
            debugLogger.log('relay', 'connectToRelay succeeded');
            sendResponse({success: true});
          },
          error => {
            debugLogger.error('connectToRelay failed', error);
            sendResponse({success: false, error: error.message});
          },
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
          () => {
            debugLogger.log('tab', 'connectToTab succeeded');
            sendResponse({success: true});
          },
          error => {
            debugLogger.error('connectToTab failed', error);
            sendResponse({success: false, error: error.message});
          },
        );
        return true;
      case 'disconnect':
        this._disconnect(message.tabId).then(
          () => {
            debugLogger.log('tab', 'disconnect succeeded');
            sendResponse({success: true});
          },
          error => {
            debugLogger.error('disconnect failed', error);
            sendResponse({success: false, error: error.message});
          },
        );
        return true;
      case 'getDebugLogs':
        // デバッグログ取得API
        sendResponse({
          success: true,
          logs: debugLogger.getLogs(message.filter, message.limit || 100),
          stats: debugLogger.getStats(),
          state: {
            activeConnections: Array.from(this._activeConnections.keys()),
            pendingTabSelection: Array.from(this._pendingTabSelection.keys()),
          }
        });
        return true;
      case 'clearDebugLogs':
        debugLogger.clear();
        sendResponse({success: true});
        return true;
    }
    return false;
  }

  async _connectToRelay(selectorTabId, mcpRelayUrl) {
    debugLogger.log('relay', '_connectToRelay called', { selectorTabId, mcpRelayUrl });
    if (!mcpRelayUrl) throw new Error('Missing relay URL');
    const openSocket = async () => {
      debugLogger.log('ws', 'Opening WebSocket', { url: mcpRelayUrl });
      const socket = new WebSocket(mcpRelayUrl);
      await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          debugLogger.error('WebSocket connection timeout');
          reject(new Error('Connection timeout'));
        }, 5000);
        socket.onopen = () => {
          debugLogger.log('ws', 'WebSocket opened successfully');
          clearTimeout(timeoutId);
          resolve();
        };
        socket.onerror = () => {
          debugLogger.error('WebSocket connection error');
          clearTimeout(timeoutId);
          reject(new Error('WebSocket error'));
        };
      });
      return socket;
    };
    let socket;
    let lastError;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      debugLogger.log('ws', `Connection attempt ${attempt + 1}/4`);
      try {
        socket = await openSocket();
        break;
      } catch (error) {
        lastError = error;
        debugLogger.log('ws', `Attempt ${attempt + 1} failed, retrying...`, { error: error.message });
        await new Promise(resolve => setTimeout(resolve, 400));
      }
    }
    if (!socket) {
      debugLogger.error('All connection attempts failed', { lastError: lastError?.message });
      throw lastError || new Error('WebSocket error');
    }
    const connection = new RelayConnection(socket);
    connection.onclose = () => {
      debugLogger.log('relay', 'Connection closed, removing from pending', { selectorTabId });
      this._pendingTabSelection.delete(selectorTabId);
    };
    this._pendingTabSelection.set(selectorTabId, {connection});
    debugLogger.log('relay', 'Added to pendingTabSelection', { selectorTabId });
  }

  async _connectTab(
    selectorTabId,
    tabId,
    windowId,
    mcpRelayUrl,
    tabUrl,
    newTab,
  ) {
    debugLogger.log('tab', '_connectTab called', { selectorTabId, tabId, tabUrl, newTab });
    if (!tabId && tabUrl) {
      tabId = await this._resolveTabId(tabUrl, newTab);
      debugLogger.log('tab', 'Resolved tabId from URL', { tabId, tabUrl });
    }
    if (!tabId) {
      debugLogger.error('No tab selected');
      throw new Error('No tab selected');
    }

    const existingConnection = this._activeConnections.get(tabId);
    if (existingConnection) {
      debugLogger.log('tab', 'Replacing existing connection', { tabId });
      existingConnection.close('Connection replaced for the same tab');
      this._activeConnections.delete(tabId);
      await this._setConnectedTab(tabId, false);
    }

    const pending = this._pendingTabSelection.get(selectorTabId);
    if (!pending) {
      debugLogger.log('relay', 'No pending connection, creating new one');
      // If no pending connection, create one now.
      await this._connectToRelay(selectorTabId, mcpRelayUrl);
    }
    const newPending = this._pendingTabSelection.get(selectorTabId);
    if (!newPending) {
      debugLogger.error('No active MCP relay connection after connect attempt');
      throw new Error('No active MCP relay connection');
    }

    this._pendingTabSelection.delete(selectorTabId);
    const connection = newPending.connection;
    connection.setTabId(tabId);
    connection.sendReady(tabId);
    connection.onclose = () => {
      debugLogger.log('tab', 'Active connection closed', { tabId });
      this._activeConnections.delete(tabId);
      void this._setConnectedTab(tabId, false);
    };
    this._activeConnections.set(tabId, connection);
    debugLogger.log('tab', 'Added to activeConnections', { tabId, totalActive: this._activeConnections.size });
    await Promise.all([
      this._setConnectedTab(tabId, true),
      windowId ? chrome.windows.update(windowId, {focused: true}) : undefined,
      chrome.tabs.update(tabId, {active: true}),
    ]);
    debugLogger.log('tab', 'Tab connected successfully', { tabId });
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
    debugLogger.log('tab', 'Tab removed', { tabId });
    const pending = this._pendingTabSelection.get(tabId);
    if (pending) {
      debugLogger.log('tab', 'Closing pending connection for removed tab', { tabId });
      this._pendingTabSelection.delete(tabId);
      pending.connection.close('Browser tab closed');
      return;
    }
    const active = this._activeConnections.get(tabId);
    if (!active) return;
    debugLogger.log('tab', 'Closing active connection for removed tab', { tabId });
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

new TabShareExtension();

// Extension2 style: connect.html is opened directly by the MCP server with URL parameters.
// No discovery polling needed - the MCP server opens:
//   chrome-extension://{EXTENSION_ID}/ui/connect.html?mcpRelayUrl=ws://...
//
// The extension icon click opens status page (like Extension2)
chrome.action.onClicked.addListener(async () => {
  const statusUrl = chrome.runtime.getURL('ui/connect.html');
  await chrome.tabs.create({url: statusUrl, active: true});
});
