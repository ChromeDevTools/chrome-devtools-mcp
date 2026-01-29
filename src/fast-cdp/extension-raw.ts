import {RelayServer} from '../extension/relay-server.js';

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
  discoveryPort?: number;
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
  const previousDiscoveryPort = process.env.MCP_EXTENSION_DISCOVERY_PORT;
  const previousDiscoveryRange = process.env.MCP_EXTENSION_DISCOVERY_PORT_RANGE;
  if (options.discoveryPort) {
    process.env.MCP_EXTENSION_DISCOVERY_PORT = String(options.discoveryPort);
  } else if (!process.env.MCP_EXTENSION_DISCOVERY_PORT_RANGE) {
    // Prefer a free port within a safe range to avoid collisions.
    process.env.MCP_EXTENSION_DISCOVERY_PORT_RANGE = '8765-8775';
  }
  try {
    if (options.discoveryPort) {
      console.error(`[fast-cdp] Discovery port: ${options.discoveryPort}`);
    } else if (process.env.MCP_EXTENSION_DISCOVERY_PORT_RANGE) {
      console.error(
        `[fast-cdp] Discovery port range: ${process.env.MCP_EXTENSION_DISCOVERY_PORT_RANGE}`,
      );
    }
    await relay.startDiscoveryServer(wsUrl, {
      tabUrl: options.tabUrl,
      newTab: options.newTab,
    });
  } finally {
    if (options.discoveryPort) {
      if (previousDiscoveryPort === undefined) {
        delete process.env.MCP_EXTENSION_DISCOVERY_PORT;
      } else {
        process.env.MCP_EXTENSION_DISCOVERY_PORT = previousDiscoveryPort;
      }
    }
    if (!options.discoveryPort) {
      if (previousDiscoveryRange === undefined) {
        delete process.env.MCP_EXTENSION_DISCOVERY_PORT_RANGE;
      } else {
        process.env.MCP_EXTENSION_DISCOVERY_PORT_RANGE = previousDiscoveryRange;
      }
    }
  }

  await new Promise<void>((resolve, reject) => {
    const timeoutMs = 30000;
    const timeout = setTimeout(() => {
      reject(new Error('Extension connection timeout (30s)'));
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
