import {RelayServer} from '../extension/relay-server.js';

// Stable extension ID (from manifest.json key)
const EXTENSION_ID = 'ibjplbopgmcacpmfpnaeoloepdhenlbm';

export interface RawExtensionConnection {
  relay: RelayServer;
  targetInfo?: {
    targetId: string;
    type: string;
    title: string;
    url: string;
    attached?: boolean;
    canActivate?: boolean;
    browserContextId?: string;
  };
}

export async function connectViaExtensionRaw(options: {
  tabId?: number;
  tabUrl?: string;
  newTab?: boolean;
  relayPort?: number;
}): Promise<RawExtensionConnection> {
  if (options.tabId === undefined && options.tabUrl === undefined) {
    throw new Error('Either tabId or tabUrl must be provided');
  }
  if (options.tabId !== undefined && options.tabUrl !== undefined) {
    throw new Error('Cannot specify both tabId and tabUrl');
  }

  const relay = new RelayServer({
    port: options.relayPort || 0,
  });
  await relay.start();
  const wsUrl = relay.getConnectionURL();
  console.error(`[fast-cdp] Relay URL: ${wsUrl}`);

  // Start discovery server for extension to find the relay
  // Extension polls this endpoint and auto-opens connect.html when found
  const discoveryPort = await relay.startDiscoveryServer({
    tabUrl: options.tabUrl,
    newTab: options.newTab,
  });

  if (discoveryPort) {
    console.error(`[fast-cdp] Discovery server on port ${discoveryPort}`);
    console.error(`[fast-cdp] Extension will auto-detect and open connect.html`);
  } else {
    // Fallback: manual URL
    const connectUrl = `chrome-extension://${EXTENSION_ID}/ui/connect.html?mcpRelayUrl=${encodeURIComponent(wsUrl)}`;
    console.error(`[fast-cdp] Discovery server failed. Please open manually:`);
    console.error(`[fast-cdp]   ${connectUrl}`);
  }

  await new Promise<void>((resolve, reject) => {
    const timeoutMs = 30000;
    const timeout = setTimeout(() => {
      reject(new Error('Extension connection timeout (30s). Make sure the chrome-ai-bridge extension is installed and Chrome is open.'));
    }, timeoutMs);

    relay.once('ready', () => {
      clearTimeout(timeout);
      console.error('[fast-cdp] Extension connected');
      resolve();
    });
    relay.once('disconnected', () => {
      clearTimeout(timeout);
      reject(new Error('Extension disconnected before ready'));
    });
  });

  let targetInfo: RawExtensionConnection['targetInfo'];
  try {
    const attachResult = await relay.sendRequest('attachToTab');
    if (attachResult?.targetInfo) {
      targetInfo = attachResult.targetInfo;
    }
  } catch {
    // best-effort; targetInfo is optional
  }

  return {relay, targetInfo};
}
