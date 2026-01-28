/**
 * chrome-ai-bridge Extension Background Service Worker
 * Based on Playwright extension2 architecture
 */

/**
 * RelayConnection - Manages connection to a single tab
 */
class RelayConnection {
  constructor(tabId, ws, debuggeeId) {
    this._tabId = tabId;
    this._ws = ws;
    this._debuggeeId = debuggeeId;
    this._eventListeners = new Map();
    this._callbacks = new Map();
    this._nextId = 0;
    this._attached = false;
  }

  async attach() {
    if (this._attached) return;

    try {
      await new Promise((resolve, reject) => {
        chrome.debugger.attach(this._debuggeeId, '1.3', () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            this._attached = true;
            resolve();
          }
        });
      });

      // Set up CDP event forwarding
      chrome.debugger.onEvent.addListener(this._onDebuggerEvent.bind(this));
      chrome.debugger.onDetach.addListener(this._onDebuggerDetach.bind(this));

      console.log(`[RelayConnection] Attached to tab ${this._tabId}`);
    } catch (error) {
      console.error(`[RelayConnection] Failed to attach to tab ${this._tabId}:`, error);
      throw error;
    }
  }

  async detach() {
    if (!this._attached) return;

    try {
      await new Promise((resolve) => {
        chrome.debugger.detach(this._debuggeeId, () => {
          this._attached = false;
          resolve();
        });
      });
      console.log(`[RelayConnection] Detached from tab ${this._tabId}`);
    } catch (error) {
      console.error(`[RelayConnection] Failed to detach from tab ${this._tabId}:`, error);
    }
  }

  sendCDPCommand(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this._nextId++;
      this._callbacks.set(id, { resolve, reject });

      chrome.debugger.sendCommand(this._debuggeeId, method, params, (result) => {
        const callback = this._callbacks.get(id);
        this._callbacks.delete(id);

        if (chrome.runtime.lastError) {
          callback.reject(new Error(chrome.runtime.lastError.message));
        } else {
          callback.resolve(result);
        }
      });
    });
  }

  _onDebuggerEvent(source, method, params) {
    if (source.tabId !== this._tabId) return;

    // Forward CDP event to MCP server
    this._sendToMCP({
      type: 'forwardCDPEvent',
      tabId: this._tabId,
      method,
      params
    });
  }

  _onDebuggerDetach(source, reason) {
    if (source.tabId !== this._tabId) return;

    console.log(`[RelayConnection] Debugger detached from tab ${this._tabId}, reason: ${reason}`);
    this._attached = false;

    // Notify MCP server
    this._sendToMCP({
      type: 'detached',
      tabId: this._tabId,
      reason
    });
  }

  _sendToMCP(message) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(message));
    }
  }

  async handleMCPMessage(message) {
    if (message.type === 'forwardCDPCommand') {
      try {
        const result = await this.sendCDPCommand(message.method, message.params);
        this._sendToMCP({
          type: 'forwardCDPResult',
          id: message.id,
          result
        });
      } catch (error) {
        this._sendToMCP({
          type: 'forwardCDPError',
          id: message.id,
          error: error.message
        });
      }
    }
  }

  get tabId() {
    return this._tabId;
  }

  get attached() {
    return this._attached;
  }
}

/**
 * TabShareExtension - Manages multiple relay connections
 */
class TabShareExtension {
  constructor() {
    this._connections = new Map(); // ws -> RelayConnection
    this._activeConnections = new Set(); // Set of active WebSocket connections
  }

  async handleConnection(ws, tabId) {
    console.log(`[TabShareExtension] New connection request for tab ${tabId}`);

    // Validate tabId
    if (!tabId || typeof tabId !== 'number') {
      ws.close(1008, 'Invalid tabId');
      return;
    }

    // Check if tab exists
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab) {
        ws.close(1008, 'Tab not found');
        return;
      }
    } catch (error) {
      ws.close(1008, `Tab not found: ${error.message}`);
      return;
    }

    // Create relay connection
    const debuggeeId = { tabId };
    const connection = new RelayConnection(tabId, ws, debuggeeId);

    try {
      await connection.attach();
      this._connections.set(ws, connection);
      this._activeConnections.add(ws);

      console.log(`[TabShareExtension] Connected to tab ${tabId}, total connections: ${this._activeConnections.size}`);

      // Set up WebSocket message handler
      ws.addEventListener('message', async (event) => {
        try {
          const message = JSON.parse(event.data);
          await connection.handleMCPMessage(message);
        } catch (error) {
          console.error('[TabShareExtension] Error handling message:', error);
        }
      });

      // Set up WebSocket close handler
      ws.addEventListener('close', async () => {
        console.log(`[TabShareExtension] WebSocket closed for tab ${tabId}`);
        await connection.detach();
        this._connections.delete(ws);
        this._activeConnections.delete(ws);
      });

      // Send ready message
      ws.send(JSON.stringify({
        type: 'ready',
        tabId
      }));

    } catch (error) {
      console.error(`[TabShareExtension] Failed to connect to tab ${tabId}:`, error);
      ws.close(1011, `Failed to attach: ${error.message}`);
    }
  }

  async disconnectTab(tabId) {
    for (const [ws, connection] of this._connections.entries()) {
      if (connection.tabId === tabId) {
        ws.close(1000, 'User disconnected');
        return true;
      }
    }
    return false;
  }

  async cleanup() {
    console.log('[TabShareExtension] Cleaning up all connections...');

    for (const ws of this._activeConnections) {
      const connection = this._connections.get(ws);
      if (connection) {
        await connection.detach();
      }
      ws.close();
    }

    this._connections.clear();
    this._activeConnections.clear();
  }
}

// Global instance
const tabShareExtension = new TabShareExtension();

async function findTabByUrl(urlPattern) {
  try {
    const urlObj = new URL(urlPattern);
    const pattern = `*://${urlObj.hostname}${urlObj.pathname}*`;
    const tabs = await chrome.tabs.query({ url: pattern });
    if (!tabs.length) return null;
    const activeTab = tabs.find(tab => tab.active);
    return activeTab || tabs[0];
  } catch (error) {
    console.error('[chrome-ai-bridge] Failed to match tab by URL:', error);
    return null;
  }
}

async function resolveTabId({ tabId, tabUrl, newTab }) {
  if (typeof tabId === 'number') {
    return tabId;
  }

  if (!tabUrl) {
    return null;
  }

  if (!newTab) {
    const matched = await findTabByUrl(tabUrl);
    if (matched && typeof matched.id === 'number') {
      return matched.id;
    }
  }

  const created = await chrome.tabs.create({ url: tabUrl, active: true });
  return created.id ?? null;
}

async function connectToRelay({ mcpRelayUrl, tabId, tabUrl, newTab }) {
  if (!mcpRelayUrl) {
    throw new Error('Missing mcpRelayUrl');
  }

  const relayUrl = new URL(mcpRelayUrl);
  if (!['127.0.0.1', 'localhost', '::1'].includes(relayUrl.hostname)) {
    throw new Error('Invalid relay URL: must be loopback address');
  }

  const resolvedTabId = await resolveTabId({ tabId, tabUrl, newTab });
  if (!resolvedTabId) {
    throw new Error('Target tab not found');
  }

  return await new Promise((resolve, reject) => {
    const ws = new WebSocket(mcpRelayUrl);

    ws.addEventListener('open', async () => {
      try {
        await tabShareExtension.handleConnection(ws, resolvedTabId);
        resolve({ tabId: resolvedTabId });
      } catch (error) {
        reject(error);
      }
    });

    ws.addEventListener('error', () => {
      reject(new Error('WebSocket connection error'));
    });

    ws.addEventListener('close', (event) => {
      if (event && event.code !== 1000) {
        console.warn('[chrome-ai-bridge] Relay connection closed:', event.reason);
      }
    });
  });
}

// Service worker lifecycle
chrome.runtime.onInstalled.addListener(() => {
  console.log('[chrome-ai-bridge] Extension installed');
});

chrome.runtime.onSuspend.addListener(async () => {
  console.log('[chrome-ai-bridge] Extension suspending, cleaning up...');
  await tabShareExtension.cleanup();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === 'connectToRelay') {
    connectToRelay({
      mcpRelayUrl: message.mcpRelayUrl,
      tabId: message.tabId,
      tabUrl: message.tabUrl,
      newTab: message.newTab,
    })
      .then(result => sendResponse({ success: true, tabId: result.tabId }))
      .catch(error =>
        sendResponse({ success: false, error: error.message || String(error) }),
      );
    return true;
  }

  if (message.type === 'disconnectTab') {
    tabShareExtension.disconnectTab(message.tabId).then(success => {
      sendResponse({ success });
    });
    return true;
  }

  return false;
});

// Export for connect.html
globalThis.tabShareExtension = tabShareExtension;

console.log('[chrome-ai-bridge] Background service worker loaded');
