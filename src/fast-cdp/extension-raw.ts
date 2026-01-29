import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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

/**
 * Get Chrome executable path for current platform
 */
function getChromeExecutable(): string {
  const platform = os.platform();

  if (platform === 'darwin') {
    // macOS
    const paths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
    return paths[0]; // fallback
  } else if (platform === 'win32') {
    // Windows
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const paths = [
      `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`,
      `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
    return 'chrome'; // fallback to PATH
  } else {
    // Linux
    const paths = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
    return 'google-chrome'; // fallback to PATH
  }
}

/**
 * Spawn Chrome to open connect.html (Extension2-style)
 * This opens a new tab in the existing Chrome window
 */
function spawnChromeWithConnectUrl(connectUrl: string): boolean {
  const platform = os.platform();

  try {
    if (platform === 'darwin') {
      // macOS: use 'open' command for better integration
      // -g: don't bring app to foreground
      // -a: specify application
      spawn('open', ['-g', '-a', 'Google Chrome', connectUrl], {
        detached: true,
        stdio: 'ignore',
      }).unref();
    } else if (platform === 'win32') {
      // Windows: spawn Chrome directly
      const chromePath = getChromeExecutable();
      spawn(chromePath, [connectUrl], {
        detached: true,
        stdio: 'ignore',
      }).unref();
    } else {
      // Linux: spawn Chrome directly
      const chromePath = getChromeExecutable();
      spawn(chromePath, [connectUrl], {
        detached: true,
        stdio: 'ignore',
      }).unref();
    }
    return true;
  } catch (error) {
    console.error(`[fast-cdp] Failed to spawn Chrome: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
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

  // Start discovery server - extension will detect this and open connect.html
  // Note: Chrome spawn doesn't work for chrome-extension:// URLs, so we rely on discovery polling
  const discoveryPort = await relay.startDiscoveryServer({
    tabUrl: options.tabUrl,
    newTab: options.newTab,
  });

  if (discoveryPort) {
    console.error(`[fast-cdp] Discovery server on port ${discoveryPort}`);
    console.error(`[fast-cdp] Extension will auto-detect and open connect.html`);
  } else {
    // Fallback: show manual URL
    const connectUrl = `chrome-extension://${EXTENSION_ID}/ui/connect.html?mcpRelayUrl=${encodeURIComponent(wsUrl)}`;
    console.error(`[fast-cdp] Discovery server failed. Please open manually:`);
    console.error(`[fast-cdp]   ${connectUrl}`);
  }

  try {
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
  } catch (error) {
    // Clean up on failure - stop relay and discovery servers
    console.error('[fast-cdp] Connection failed, cleaning up relay server');
    await relay.stop().catch(() => {});
    throw error;
  }

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
