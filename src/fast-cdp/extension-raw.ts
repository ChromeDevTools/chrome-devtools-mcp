import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import {RelayServer} from '../extension/relay-server.js';
import {logRelay, logExtension, logInfo, logError} from './mcp-logger.js';

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
  allowTabTakeover?: boolean;
  relayPort?: number;
  timeoutMs?: number;
}): Promise<RawExtensionConnection> {
  const startTime = Date.now();
  logInfo('extension-raw', 'connectViaExtensionRaw called', {
    tabUrl: options.tabUrl,
    tabId: options.tabId,
    newTab: options.newTab,
    allowTabTakeover: options.allowTabTakeover,
    timeoutMs: options.timeoutMs,
  });

  // tabUrl is now required; tabId is optional (used for tab selection hint)
  if (options.tabUrl === undefined) {
    logError('extension-raw', 'Validation failed: tabUrl required');
    throw new Error('EXT_INVALID_ARG: tabUrl must be provided');
  }

  logRelay('starting', {port: options.relayPort || 'auto'});
  const relay = new RelayServer({
    port: options.relayPort || 0,
  });
  await relay.start();
  const wsUrl = relay.getConnectionURL();
  const sessionId = relay.getSessionId();
  logRelay('started', {wsUrl});
  console.error(`[fast-cdp] Relay URL: ${wsUrl} (session=${sessionId})`);

  // Save relay info for reload-extension.mjs (after discovery server starts)
  const relayInfoPath = '/tmp/chrome-ai-bridge-relay.json';

  // Start discovery server - extension will detect this and open connect.html
  // Note: Chrome spawn doesn't work for chrome-extension:// URLs, so we rely on discovery polling
  logInfo('extension-raw', 'Starting discovery server', {tabUrl: options.tabUrl, tabId: options.tabId, newTab: options.newTab});
  const discoveryPort = await relay.startDiscoveryServer({
    tabUrl: options.tabUrl,
    tabId: options.tabId,
    newTab: options.newTab,
    allowTabTakeover: options.allowTabTakeover,
  });

  if (discoveryPort) {
    logInfo('extension-raw', 'Discovery server started', {discoveryPort});
    console.error(`[fast-cdp] Discovery server on port ${discoveryPort}`);
    console.error(`[fast-cdp] Extension will auto-detect and open connect.html`);

    // Save relay info for reload-extension.mjs
    try {
      fs.writeFileSync(
        relayInfoPath,
        JSON.stringify({ discoveryPort, sessionId, timestamp: Date.now() }),
      );
      logInfo('extension-raw', 'Saved relay info', { path: relayInfoPath, discoveryPort, sessionId });
    } catch (err) {
      logError('extension-raw', 'Failed to save relay info', { error: err instanceof Error ? err.message : String(err) });
    }
  } else {
    // Fallback: show manual URL
    const connectUrl = `chrome-extension://${EXTENSION_ID}/ui/connect.html?mcpRelayUrl=${encodeURIComponent(wsUrl)}&sessionId=${encodeURIComponent(sessionId)}`;
    logError('extension-raw', 'Discovery server failed', {connectUrl});
    console.error(`[fast-cdp] Discovery server failed. Please open manually:`);
    console.error(`[fast-cdp]   ${connectUrl}`);
  }

  try {
    const actualTimeout = options.timeoutMs ?? 10000;
    const softTimeout = Math.min(5000, Math.floor(actualTimeout * 0.5));
    logExtension('waiting', {timeoutMs: actualTimeout});

    await new Promise<void>((resolve, reject) => {
      let softTimedOut = false;
      const softTimer = setTimeout(() => {
        softTimedOut = true;
        logInfo('extension-raw', 'Still waiting for extension ready', {
          waitedMs: softTimeout,
          timeoutMs: actualTimeout,
        });
      }, softTimeout);
      softTimer.unref();

      const timeout = setTimeout(() => {
        clearTimeout(softTimer);
        logExtension('timeout', {elapsed: actualTimeout});
        reject(new Error(`EXT_READY_TIMEOUT: timeoutMs=${actualTimeout} waitedMs=${actualTimeout}`));
      }, actualTimeout);
      timeout.unref();

      relay.once('ready', () => {
        clearTimeout(softTimer);
        clearTimeout(timeout);
        const elapsed = Date.now() - startTime;
        logExtension('connected', {elapsed, softTimedOut});
        console.error('[fast-cdp] Extension connected');
        resolve();
      });
      relay.once('disconnected', () => {
        clearTimeout(softTimer);
        clearTimeout(timeout);
        logExtension('disconnected', {reason: 'disconnected before ready'});
        reject(new Error('EXT_DISCONNECTED_BEFORE_READY: Extension disconnected before ready'));
      });
    });
  } catch (error) {
    // Clean up on failure - stop relay and discovery servers
    const elapsed = Date.now() - startTime;
    logError('extension-raw', 'Connection failed, cleaning up', {
      elapsed,
      error: error instanceof Error ? error.message : String(error),
    });
    console.error('[fast-cdp] Connection failed, cleaning up relay server');
    logRelay('stopped', {reason: 'connection failed'});
    await relay.stop().catch(() => {});
    throw error;
  }

  let targetInfo: RawExtensionConnection['targetInfo'];
  try {
    logInfo('extension-raw', 'Attaching to tab');
    const attachResult = await relay.sendRequest('attachToTab');
    if (attachResult?.targetInfo) {
      targetInfo = attachResult.targetInfo;
      logInfo('extension-raw', 'Tab attached successfully', {
        targetId: targetInfo?.targetId,
        type: targetInfo?.type,
        url: targetInfo?.url,
      });
    }
  } catch (attachError) {
    // best-effort; targetInfo is optional
    logError('extension-raw', 'Failed to attach to tab (non-fatal)', {
      error: attachError instanceof Error ? attachError.message : String(attachError),
    });
  }

  // Get extension version for logging
  try {
    const versionResult = await relay.sendRequest('getVersion');
    if (versionResult?.version) {
      logInfo('extension-raw', 'Extension version', {version: versionResult.version});
      console.error(`[fast-cdp] Extension version: ${versionResult.version}`);
    }
  } catch {
    // best-effort; version info is optional
  }

  const totalElapsed = Date.now() - startTime;
  logInfo('extension-raw', 'connectViaExtensionRaw completed', {totalElapsed});

  return {relay, targetInfo};
}
