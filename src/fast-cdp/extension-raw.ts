import {spawn} from 'node:child_process';
import os from 'node:os';
import {RelayServer} from '../extension/relay-server.js';

// Stable extension ID (from manifest.json key)
const EXTENSION_ID = 'ibjplbopgmcacpmfpnaeoloepdhenlbm';

/**
 * Get Chrome executable path for the current platform
 */
function getChromeExecutable(): string {
  const platform = os.platform();

  if (platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  } else if (platform === 'win32') {
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    return `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`;
  } else {
    // Linux
    return '/usr/bin/google-chrome';
  }
}

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

  // Build the extension connect.html URL with parameters (Extension2 style)
  const connectParams = new URLSearchParams({mcpRelayUrl: wsUrl});
  if (options.tabUrl) connectParams.set('tabUrl', options.tabUrl);
  if (options.newTab) connectParams.set('newTab', 'true');
  const connectUrl = `chrome-extension://${EXTENSION_ID}/ui/connect.html?${connectParams.toString()}`;

  console.error(`[fast-cdp] Opening extension UI: ${connectUrl}`);

  // Open the connect.html in Chrome by spawning Chrome directly
  // Note: `open -a "Google Chrome" "chrome-extension://..."` does not work
  // Instead, we spawn Chrome directly with the extension URL as an argument
  try {
    const chromeExe = getChromeExecutable();
    console.error(`[fast-cdp] Chrome executable: ${chromeExe}`);

    // Spawn Chrome with the connect.html URL
    // This will open a new tab in an existing Chrome instance (or start a new one)
    const chromeProcess = spawn(chromeExe, [connectUrl], {
      detached: true,
      stdio: 'ignore',
    });
    chromeProcess.unref();

    console.error('[fast-cdp] Extension UI opened in Chrome');
  } catch (error) {
    console.error(`[fast-cdp] Failed to open Chrome: ${error instanceof Error ? error.message : String(error)}`);
    console.error('[fast-cdp] Please manually open in Chrome:');
    console.error(`[fast-cdp]   ${connectUrl}`);
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
