/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {execSync, spawn} from 'node:child_process';
import fs from 'node:fs';
import {promises as fsPromises} from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import type {
  Browser,
  ChromeReleaseChannel,
  ConnectOptions,
  LaunchOptions,
  Target,
} from 'puppeteer-core';
import puppeteer from 'puppeteer-core';

import {logger} from './logger.js';
import {resolveUserDataDir} from './profile-resolver.js';
import {
  isProjectRootInitialized,
  getProjectRoot,
} from './project-root-state.js';
import type {RootsInfo} from './roots-manager.js';
import {
  detectSystemChromeProfile,
  detectAnySystemChromeProfile,
  isSandboxedEnvironment,
  logSystemProfileInfo,
  type SystemChromeProfile,
} from './system-profile.js';

// Phase 4: open -g + puppeteer.connect() types
type LaunchMethod = 'launch' | 'connect';

interface BrowserHandle {
  browser: Browser;
  method: LaunchMethod;
  debugPort?: number;
  chromePid?: number | null;
}

let browser: Browser | undefined;
let browserHandle: BrowserHandle | undefined;

const ignoredPrefixes = new Set([
  'chrome://',
  'chrome-extension://',
  'chrome-untrusted://',
  'devtools://',
]);

function targetFilter(target: Target): boolean {
  if (target.url() === 'chrome://newtab/') {
    return true;
  }
  for (const prefix of ignoredPrefixes) {
    if (target.url().startsWith(prefix)) {
      return false;
    }
  }
  return true;
}

// Phase 4: Helper functions for open -g + connect
async function findFreePort(start = 9222, count = 50): Promise<number> {
  for (let p = start; p < start + count; p++) {
    const ok = await new Promise<boolean>((resolve) => {
      const srv = net.createServer();
      srv.once('error', () => resolve(false));
      srv.listen(p, '127.0.0.1', () => srv.close(() => resolve(true)));
    });
    if (ok) return p;
  }
  throw new Error('No free port in range 9222-9272');
}

async function waitForChromeDebug(
  port: number,
  timeoutMs = 15000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await new Promise<boolean>((resolve) => {
      const req = http.get(
        `http://127.0.0.1:${port}/json/version`,
        (res) => {
          res.resume();
          resolve(res.statusCode === 200);
        },
      );
      req.on('error', () => resolve(false));
      req.setTimeout(1000, () => {
        req.destroy();
        resolve(false);
      });
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Chrome debug port not ready: ${port}`);
}

function findChromePidByPortAndProfile(
  port: number,
  userDataDir: string,
): number | null {
  try {
    const out = execSync('ps -ax -o pid=,command=', {encoding: 'utf-8'});
    const lines = out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    for (const line of lines) {
      if (
        line.includes(`--remote-debugging-port=${port}`) &&
        line.includes(`--user-data-dir=${userDataDir}`) &&
        (line.includes('Google Chrome.app') || line.includes('Google Chrome'))
      ) {
        const pidStr = line.split(/\s+/, 1)[0];
        const pid = Number(pidStr);
        if (Number.isFinite(pid)) return pid;
      }
    }
  } catch {}
  return null;
}

function killProcess(pid: number): void {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {}
}

function killProcessHard(pid: number): void {
  try {
    process.kill(pid, 'SIGKILL');
  } catch {}
}

function toAppBundlePath(p: string): string {
  // .../Google Chrome.app/Contents/MacOS/Google Chrome -> .../Google Chrome.app
  const m = p.match(/^(.*?\.app)\/Contents\/MacOS\/.+$/);
  return m ? m[1] : p;
}

const connectOptions: ConnectOptions = {
  targetFilter,
  // We do not expect any single CDP command to take more than 10sec.
  protocolTimeout: 10_000,
};

async function ensureBrowserConnected(browserURL: string) {
  if (browser?.connected) {
    return browser;
  }
  browser = await puppeteer.connect({
    ...connectOptions,
    browserURL,
    defaultViewport: null,
  });
  return browser;
}

function scanExtensionsDirectory(extensionsDir: string): string[] {
  const extensionPaths: string[] = [];

  try {
    if (!fs.existsSync(extensionsDir)) {
      console.warn(`Extensions directory not found: ${extensionsDir}`);
      return extensionPaths;
    }

    const entries = fs.readdirSync(extensionsDir, {withFileTypes: true});

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const extensionPath = path.join(extensionsDir, entry.name);
        const manifestPath = path.join(extensionPath, 'manifest.json');

        // First, check if manifest.json exists in the root directory
        if (fs.existsSync(manifestPath)) {
          try {
            const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
            const manifest = JSON.parse(manifestContent);

            if (manifest.manifest_version) {
              extensionPaths.push(extensionPath);
              console.error(
                `Found extension: ${entry.name} (v${manifest.version || 'unknown'})`,
              );
            }
          } catch (error) {
            console.warn(
              `Invalid manifest.json in ${entry.name}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        } else {
          // If not found in root, check common subdirectories
          const subDirs = ['extension', 'dist', 'dist-simple', 'build', 'src'];
          for (const subDir of subDirs) {
            const subPath = path.join(extensionPath, subDir);
            const subManifestPath = path.join(subPath, 'manifest.json');

            if (fs.existsSync(subManifestPath)) {
              try {
                const manifestContent = fs.readFileSync(
                  subManifestPath,
                  'utf-8',
                );
                const manifest = JSON.parse(manifestContent);

                if (manifest.manifest_version) {
                  extensionPaths.push(subPath);
                  console.error(
                    `Found extension: ${entry.name}/${subDir} (v${manifest.version || 'unknown'})`,
                  );
                  break; // Use the first valid subdirectory found
                }
              } catch (error) {
                console.warn(
                  `Invalid manifest.json in ${entry.name}/${subDir}: ${error instanceof Error ? error.message : String(error)}`,
                );
              }
            }
          }
        }
      }
    }

    console.error(
      `Scanned ${extensionsDir}: found ${extensionPaths.length} valid extensions`,
    );
  } catch (error) {
    console.error(
      `Error scanning extensions directory ${extensionsDir}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return extensionPaths;
}

/**
 * Get system Chrome executable path
 */
function getSystemChromeExecutable(channel?: Channel): string {
  const platform = os.platform();

  if (platform === 'darwin') {
    // macOS
    if (channel === 'canary') {
      return '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary';
    } else if (channel === 'beta') {
      return '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta';
    } else if (channel === 'dev') {
      return '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev';
    }
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  } else if (platform === 'win32') {
    // Windows
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const programFilesX86 =
      process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    if (channel === 'canary') {
      return path.join(
        process.env.LOCALAPPDATA || '',
        'Google',
        'Chrome SxS',
        'Application',
        'chrome.exe',
      );
    } else if (channel === 'beta') {
      return path.join(
        programFiles,
        'Google',
        'Chrome Beta',
        'Application',
        'chrome.exe',
      );
    } else if (channel === 'dev') {
      return path.join(
        programFiles,
        'Google',
        'Chrome Dev',
        'Application',
        'chrome.exe',
      );
    }

    // Try both Program Files locations
    const path1 = path.join(
      programFiles,
      'Google',
      'Chrome',
      'Application',
      'chrome.exe',
    );
    const path2 = path.join(
      programFilesX86,
      'Google',
      'Chrome',
      'Application',
      'chrome.exe',
    );

    if (fs.existsSync(path1)) return path1;
    if (fs.existsSync(path2)) return path2;
    return path1; // Default fallback
  } else {
    // Linux
    if (channel === 'canary' || channel === 'dev') {
      return '/usr/bin/google-chrome-unstable';
    } else if (channel === 'beta') {
      return '/usr/bin/google-chrome-beta';
    }

    // Try google-chrome first, fallback to chromium
    if (fs.existsSync('/usr/bin/google-chrome')) {
      return '/usr/bin/google-chrome';
    }
    return '/usr/bin/chromium-browser';
  }
}

/**
 * Get System Chrome User Data directory (not Chrome for Testing)
 */
function getSystemChromeUserDataDir(channel?: Channel): string {
  const homeDir = os.homedir();
  const platform = os.platform();

  if (platform === 'darwin') {
    // macOS
    let chromeDataPath = path.join(
      homeDir,
      'Library',
      'Application Support',
      'Google',
      'Chrome',
    );
    if (channel === 'canary') {
      chromeDataPath = path.join(
        homeDir,
        'Library',
        'Application Support',
        'Google',
        'Chrome Canary',
      );
    } else if (channel === 'beta') {
      chromeDataPath = path.join(
        homeDir,
        'Library',
        'Application Support',
        'Google',
        'Chrome Beta',
      );
    } else if (channel === 'dev') {
      chromeDataPath = path.join(
        homeDir,
        'Library',
        'Application Support',
        'Google',
        'Chrome Dev',
      );
    }
    return chromeDataPath;
  } else if (platform === 'win32') {
    // Windows
    let chromeDataPath = path.join(
      homeDir,
      'AppData',
      'Local',
      'Google',
      'Chrome',
      'User Data',
    );
    if (channel === 'canary') {
      chromeDataPath = path.join(
        homeDir,
        'AppData',
        'Local',
        'Google',
        'Chrome SxS',
        'User Data',
      );
    } else if (channel === 'beta') {
      chromeDataPath = path.join(
        homeDir,
        'AppData',
        'Local',
        'Google',
        'Chrome Beta',
        'User Data',
      );
    } else if (channel === 'dev') {
      chromeDataPath = path.join(
        homeDir,
        'AppData',
        'Local',
        'Google',
        'Chrome Dev',
        'User Data',
      );
    }
    return chromeDataPath;
  } else {
    // Linux
    let chromeDataPath = path.join(homeDir, '.config', 'google-chrome');
    if (channel === 'canary') {
      chromeDataPath = path.join(homeDir, '.config', 'google-chrome-unstable');
    } else if (channel === 'beta') {
      chromeDataPath = path.join(homeDir, '.config', 'google-chrome-beta');
    } else if (channel === 'dev') {
      chromeDataPath = path.join(homeDir, '.config', 'google-chrome-unstable');
    }

    // Check if google-chrome exists, fallback to chromium
    if (!fs.existsSync(chromeDataPath)) {
      const chromiumPath = path.join(homeDir, '.config', 'chromium');
      if (fs.existsSync(chromiumPath)) {
        return chromiumPath;
      }
    }
    return chromeDataPath;
  }
}

/**
 * Read Local State file to get last used profile
 */
function readLocalState(userDataDir: string): {
  lastUsed?: string;
} {
  const localStatePath = path.join(userDataDir, 'Local State');

  try {
    if (!fs.existsSync(localStatePath)) {
      return {};
    }

    const content = fs.readFileSync(localStatePath, 'utf-8');
    const json = JSON.parse(content);
    const lastUsed = json?.profile?.last_used;

    if (typeof lastUsed === 'string') {
      return {lastUsed};
    }
  } catch (error) {
    console.warn(
      `Failed to read Local State: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return {};
}

/**
 * Compare version strings (e.g., "2.3.2_0" vs "2.3.1_0")
 */
function compareVersion(a: string, b: string): number {
  // Normalize: "2.3.2_0" → [2, 3, 2]
  const normalize = (v: string) =>
    v
      .split('_')[0]
      .split('.')
      .map(x => parseInt(x, 10) || 0);

  const aParts = normalize(a);
  const bParts = normalize(b);
  const maxLen = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < maxLen; i++) {
    const diff = (aParts[i] || 0) - (bParts[i] || 0);
    if (diff !== 0) return diff;
  }

  return 0;
}

/**
 * Scan one profile's Extensions directory and return extension paths
 */
function scanExtensionsInProfile(profileDir: string): string[] {
  const extensionPaths: string[] = [];
  const extensionsDir = path.join(profileDir, 'Extensions');

  if (!fs.existsSync(extensionsDir)) {
    return extensionPaths;
  }

  try {
    const extensionIds = fs.readdirSync(extensionsDir, {withFileTypes: true});

    for (const extensionEntry of extensionIds) {
      if (!extensionEntry.isDirectory()) continue;

      const extensionIdPath = path.join(extensionsDir, extensionEntry.name);

      try {
        const versions = fs
          .readdirSync(extensionIdPath, {withFileTypes: true})
          .filter(e => e.isDirectory())
          .map(e => e.name);

        if (versions.length === 0) continue;

        // Find the latest version
        const latestVersion = versions.sort(compareVersion).pop()!;
        const versionPath = path.join(extensionIdPath, latestVersion);
        const manifestPath = path.join(versionPath, 'manifest.json');

        const manifest = validateExtensionManifest(manifestPath);
        if (manifest) {
          extensionPaths.push(versionPath);
          console.error(
            `  ✅ ${manifest.name} v${manifest.version} (MV${manifest.manifest_version})`,
          );
        }
      } catch (error) {
        console.warn(
          `Error processing extension ${extensionEntry.name}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  } catch (error) {
    console.error(
      `Error scanning extensions in ${extensionsDir}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return extensionPaths;
}

/**
 * Get the Chrome extensions directory path for the current platform
 */
function getChromeExtensionsDirectory(channel?: Channel): string {
  const homeDir = os.homedir();
  const platform = os.platform();

  let chromeDataPath: string;
  const profileName = 'Default';

  if (platform === 'darwin') {
    // macOS
    chromeDataPath = path.join(
      homeDir,
      'Library',
      'Application Support',
      'Google',
      'Chrome',
    );
    if (channel === 'canary') {
      chromeDataPath = path.join(
        homeDir,
        'Library',
        'Application Support',
        'Google',
        'Chrome Canary',
      );
    } else if (channel === 'beta') {
      chromeDataPath = path.join(
        homeDir,
        'Library',
        'Application Support',
        'Google',
        'Chrome Beta',
      );
    } else if (channel === 'dev') {
      chromeDataPath = path.join(
        homeDir,
        'Library',
        'Application Support',
        'Google',
        'Chrome Dev',
      );
    }
  } else if (platform === 'win32') {
    // Windows
    chromeDataPath = path.join(
      homeDir,
      'AppData',
      'Local',
      'Google',
      'Chrome',
      'User Data',
    );
    if (channel === 'canary') {
      chromeDataPath = path.join(
        homeDir,
        'AppData',
        'Local',
        'Google',
        'Chrome SxS',
        'User Data',
      );
    } else if (channel === 'beta') {
      chromeDataPath = path.join(
        homeDir,
        'AppData',
        'Local',
        'Google',
        'Chrome Beta',
        'User Data',
      );
    } else if (channel === 'dev') {
      chromeDataPath = path.join(
        homeDir,
        'AppData',
        'Local',
        'Google',
        'Chrome Dev',
        'User Data',
      );
    }
  } else {
    // Linux
    chromeDataPath = path.join(homeDir, '.config', 'google-chrome');
    if (channel === 'canary') {
      chromeDataPath = path.join(homeDir, '.config', 'google-chrome-unstable');
    } else if (channel === 'beta') {
      chromeDataPath = path.join(homeDir, '.config', 'google-chrome-beta');
    } else if (channel === 'dev') {
      chromeDataPath = path.join(homeDir, '.config', 'google-chrome-unstable');
    }
  }

  return path.join(chromeDataPath, profileName, 'Extensions');
}

/**
 * Validate an extension manifest.json file
 */
interface ExtensionManifest {
  manifest_version: number;
  name: string;
  version: string;
  description?: string;
  permissions?: string[];
  host_permissions?: string[];
  background?: {
    service_worker?: string;
    scripts?: string[];
    page?: string;
    persistent?: boolean;
  };
  content_scripts?: Array<{
    matches: string[];
    js?: string[];
    css?: string[];
  }>;
}

function validateExtensionManifest(
  manifestPath: string,
): ExtensionManifest | null {
  try {
    if (!fs.existsSync(manifestPath)) {
      return null;
    }

    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent) as ExtensionManifest;

    // Basic validation
    if (!manifest.manifest_version || !manifest.name || !manifest.version) {
      return null;
    }

    // Ensure it's a valid manifest version (2 or 3)
    if (manifest.manifest_version !== 2 && manifest.manifest_version !== 3) {
      return null;
    }

    return manifest;
  } catch (error) {
    console.warn(
      `Invalid manifest.json at ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/**
 * Discover Chrome extensions installed in the system
 * Uses Local State to determine the active profile, or uses specified profile
 */
function discoverSystemExtensions(
  channel?: Channel,
  chromeProfile?: string,
): string[] {
  console.error(`🔍 Discovering system Chrome extensions...`);

  const userDataDir = getSystemChromeUserDataDir(channel);
  console.error(`📁 Chrome User Data: ${userDataDir}`);

  // Determine target profile
  let targetProfile: string;

  if (chromeProfile) {
    // CLI-specified profile takes priority
    targetProfile = chromeProfile;
    console.error(`🎯 Using CLI-specified profile: ${targetProfile}`);
  } else {
    // Read Local State to get last used profile
    const {lastUsed} = readLocalState(userDataDir);
    targetProfile = lastUsed || 'Default';

    if (lastUsed) {
      console.error(
        `🎯 Using last-used profile from Local State: ${targetProfile}`,
      );
    } else {
      console.error(`🎯 Local State not found, using Default profile`);
    }
  }

  // Check if target profile exists
  const profileDir = path.join(userDataDir, targetProfile);
  if (!fs.existsSync(profileDir)) {
    console.warn(`⚠️  Profile directory not found: ${targetProfile}`);

    // Fallback to Default
    if (targetProfile !== 'Default') {
      console.error(`📁 Falling back to Default profile`);
      targetProfile = 'Default';
      const defaultProfileDir = path.join(userDataDir, targetProfile);

      if (!fs.existsSync(defaultProfileDir)) {
        console.error(
          `❌ Default profile also not found. No extensions will be loaded.`,
        );
        return [];
      }
    } else {
      console.error(
        `❌ Default profile not found. No extensions will be loaded.`,
      );
      return [];
    }
  }

  // Scan the target profile
  console.error(`📂 Scanning profile: ${targetProfile}`);
  const extensionPaths = scanExtensionsInProfile(
    path.join(userDataDir, targetProfile),
  );

  console.error(
    `📦 Total: ${extensionPaths.length} extension(s) found in profile "${targetProfile}"`,
  );

  return extensionPaths;
}

interface McpLaunchOptions {
  executablePath?: string;
  customDevTools?: string;
  channel?: Channel;
  userDataDir?: string;
  headless?: boolean;
  isolated?: boolean;
  loadExtension?: string;
  loadExtensionsDir?: string;
  loadSystemExtensions?: boolean;
  chromeProfile?: string;
  logFile?: fs.WriteStream;
  rootsInfo?: RootsInfo; // v0.18.0: Roots-based profile resolution
  focus?: boolean; // v1.0.18: Bring Chrome window to foreground (default: false)
}

// Store development extension paths globally for later retrieval
let developmentExtensionPaths: string[] = [];

export function getDevelopmentExtensionPaths(): string[] {
  return developmentExtensionPaths;
}

export async function launch(options: McpLaunchOptions): Promise<Browser> {
  const {
    channel,
    executablePath,
    customDevTools,
    headless = false,
    isolated = false,
    loadExtension,
    loadExtensionsDir,
    loadSystemExtensions = false,
    chromeProfile,
    focus = false,
  } = options;

  // Reset development extension paths
  developmentExtensionPaths = [];

  // Local browser variable for this launch
  let localBrowser: Browser | undefined;
  let localBrowserHandle: BrowserHandle | undefined;

  // Resolve user data directory using new profile resolver (v0.15.0+)
  const resolved = resolveUserDataDir({
    cliUserDataDir: options.userDataDir,
    env: process.env,
    cwd: process.cwd(),
    channel: channel || 'stable',
    rootsInfo: options.rootsInfo, // v0.18.0: Pass Roots info
  });

  const userDataDir = resolved.path;
  await fs.promises.mkdir(userDataDir, {recursive: true});

  // Legacy profile warning (shown if legacy path exists)
  try {
    const legacy = path.join(
      os.homedir(),
      '.cache',
      'chrome-ai-bridge',
      'chrome-profile',
    );
    if (fs.existsSync(legacy)) {
      console.error(
        `⚠️  Legacy profile detected: ${legacy}\n` +
          `ℹ️  New profile location: ${path.join(
            os.homedir(),
            '.cache',
            'chrome-ai-bridge',
            'profiles',
            'project-default',
            'stable',
          )}\n` +
          `💡 To continue using the legacy profile, set: MCP_USER_DATA_DIR=${legacy}`,
      );
    }
  } catch {
    /* ignore */
  }

  // Profile resolution logs
  console.error(`[profiles] Using: ${userDataDir}`);
  console.error(`           Reason: ${resolved.reason}`);
  console.error(
    `           Project: ${resolved.projectName} (${resolved.hash})`,
  );
  console.error(`           Client:  ${resolved.clientId}`);
  if (resolved.reason === 'AUTO') {
    console.error(`           Root: ${process.cwd()}`);
  }

  const usingSystemProfile = false;
  const profileDirectory = 'Default';

  const args: LaunchOptions['args'] = [
    '--hide-crash-restore-bubble',
    `--profile-directory=${profileDirectory}`,
  ];
  if (customDevTools) {
    args.push(`--custom-devtools-frontend=file://${customDevTools}`);
  }
  // Collect all extension paths
  const extensionPaths: string[] = [];

  if (loadExtension) {
    // Validate single extension path
    if (fs.existsSync(loadExtension)) {
      const manifestPath = path.join(loadExtension, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        try {
          const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
          const manifest = JSON.parse(manifestContent);
          if (manifest.manifest_version) {
            extensionPaths.push(loadExtension);
            developmentExtensionPaths.push(loadExtension); // Track as development extension
            console.error(`✅ Single extension validated: ${loadExtension}`);
          } else {
            console.error(
              `❌ Invalid manifest.json in ${loadExtension}: missing manifest_version`,
            );
          }
        } catch (error) {
          console.error(
            `❌ Invalid manifest.json in ${loadExtension}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      } else {
        console.error(
          `❌ Extension path missing manifest.json: ${loadExtension}`,
        );
      }
    } else {
      console.error(`❌ Extension path does not exist: ${loadExtension}`);
    }
  }

  if (loadExtensionsDir) {
    const scannedExtensions = scanExtensionsDirectory(loadExtensionsDir);
    extensionPaths.push(...scannedExtensions);
    developmentExtensionPaths.push(...scannedExtensions); // Track as development extensions
  }

  // System extension discovery (default: true unless isolated flag is set)
  const shouldLoadSystemExtensions = loadSystemExtensions ?? !isolated;
  if (shouldLoadSystemExtensions) {
    const systemExtensions = discoverSystemExtensions(channel, chromeProfile);
    if (systemExtensions.length > 0) {
      extensionPaths.push(...systemExtensions);
      console.error(
        `✅ Loaded ${systemExtensions.length} system Chrome extension(s)`,
      );
    } else {
      console.warn(`⚠️  No system extensions found or accessible`);
    }
  }

  if (extensionPaths.length > 0) {
    args.push(`--load-extension=${extensionPaths.join(',')}`);
    args.push('--enable-experimental-extension-apis');
    // Fix for Chrome 137+ where --load-extension is disabled by default
    args.push('--disable-features=DisableLoadExtensionCommandLineSwitch');
    console.error(`Loading ${extensionPaths.length} Chrome extension(s):`);
    extensionPaths.forEach((path, index) => {
      console.error(`  ${index + 1}. ${path}`);
    });
    console.error(
      `Chrome args will include: --load-extension=${extensionPaths.join(',')}`,
    );
    console.error('Applied Chrome 137+ extension loading fix');
  }

  // Add Google login automation detection bypass
  args.push('--disable-blink-features=AutomationControlled');
  console.error(
    'Added Google login bypass: --disable-blink-features=AutomationControlled',
  );

  // Use system Chrome instead of Chrome for Testing when loading extensions
  let puppeterChannel: ChromeReleaseChannel | undefined;
  let effectiveExecutablePath = executablePath;

  if (!executablePath && extensionPaths.length > 0) {
    // Auto-detect system Chrome executable for extension support
    effectiveExecutablePath = getSystemChromeExecutable(channel);
    console.error(`🔍 Auto-detected system Chrome: ${effectiveExecutablePath}`);
    console.error(`💡 Using system Chrome binary with isolated MCP profile`);
    console.error(
      `📝 Extensions will be loaded from: ${extensionPaths.join(', ')}`,
    );
  } else if (!executablePath) {
    // No extensions, use Chrome for Testing via channel
    puppeterChannel =
      channel && channel !== 'stable'
        ? (`chrome-${channel}` as ChromeReleaseChannel)
        : 'chrome';
  }

  // Log complete Chrome configuration before launch
  console.error('Chrome Launch Configuration:');
  console.error(`  Channel: ${puppeterChannel || 'default'}`);
  console.error(`  Executable: ${effectiveExecutablePath || 'auto-detected'}`);
  console.error(`  User Data Dir: ${userDataDir || 'temporary'}`);
  console.error(`  Profile Directory: ${profileDirectory}`);
  console.error(
    `  Profile Type: ${usingSystemProfile ? 'System Profile (auto-detected)' : 'Custom Profile'}`,
  );
  console.error(`  Headless: ${headless}`);
  console.error(`  Args: ${JSON.stringify(args, null, 2)}`);
  console.error(
    `  Ignored Default Args: ["--disable-extensions", "--enable-automation"]`,
  );

  // IMPORTANT: Chrome extensions (especially MV3 content scripts and service workers)
  // DO NOT work in headless mode. Always use headless:false when loading extensions.
  // Reference: https://groups.google.com/a/chromium.org/g/headless-dev/c/nEoeUkoNI0o/m/9KZ4Os46AQAJ
  const effectiveHeadless = extensionPaths.length > 0 ? false : (headless ?? false);

  if (extensionPaths.length > 0 && headless) {
    console.warn(
      '⚠️  WARNING: Extensions require headful mode. Forcing headless:false',
    );
  }

  let browser: Browser;
  let finalUserDataDir = userDataDir;

  // Remember current foreground app before Chrome launch (for background mode)
  let previousApp: string | null = null;
  if (!focus && !effectiveHeadless && os.platform() === 'darwin') {
    try {
      previousApp = execSync(
        `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
        {encoding: 'utf-8', timeout: 5000},
      ).trim();
      console.error(`📋 Current foreground app: ${previousApp}`);
    } catch (error) {
      console.warn(
        `⚠️  Could not detect foreground app: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Windows/Linux: Add --start-minimized for background mode
  if (!focus && !effectiveHeadless && os.platform() !== 'darwin') {
    args.push('--start-minimized');
    console.error('📋 Added --start-minimized for background mode');
  }

  // Phase 4: Try open -g + connect for macOS background mode
  const useOpenConnect =
    os.platform() === 'darwin' && !focus && !effectiveHeadless;

  console.error(
    `🔍 Phase 4 check: platform=${os.platform()}, focus=${focus}, headless=${effectiveHeadless}, useOpenConnect=${useOpenConnect}`,
  );

  if (useOpenConnect) {
    try {
      const port = await findFreePort(9222, 50);
      const chromeArgs = [
        ...args,
        `--remote-debugging-port=${port}`,
        `--remote-debugging-address=127.0.0.1`,
        `--user-data-dir=${userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
      ];

      // Launch Chrome with open -gjF (background + hidden + fresh)
      const chromeApp = toAppBundlePath(
        effectiveExecutablePath || '/Applications/Google Chrome.app',
      );
      spawn(
        'open',
        ['-n', '-g', '-j', '-F', '-a', chromeApp, '--args', ...chromeArgs],
        {
          stdio: 'ignore',
          detached: true,
        },
      ).unref();

      console.error(`📋 Launching Chrome in background (port ${port})...`);

      // Wait for Chrome to be ready
      await waitForChromeDebug(port, 15000);

      // Connect to Chrome
      localBrowser = await puppeteer.connect({
        browserURL: `http://127.0.0.1:${port}`,
        defaultViewport: null,
      });

      // Track PID for cleanup
      const chromePid = findChromePidByPortAndProfile(port, userDataDir);
      localBrowserHandle = {
        browser: localBrowser,
        method: 'connect',
        debugPort: port,
        chromePid,
      };

      console.error('✅ Connected to Chrome in background mode');
    } catch (openError: any) {
      console.warn(
        `⚠️  Background launch failed: ${openError.message}, falling back to normal launch`,
      );
      // Fall through to normal launch
    }
  }

  // Normal launch (or fallback from open-connect)
  if (!localBrowser) {
    try {
      localBrowser = await puppeteer.launch({
        ...connectOptions,
        channel: puppeterChannel,
        executablePath: effectiveExecutablePath,
        defaultViewport: null,
        userDataDir,
        pipe: true,
        headless: effectiveHeadless,
        args,
        ignoreDefaultArgs: ['--disable-extensions', '--enable-automation'],
      });
      localBrowserHandle = {browser: localBrowser, method: 'launch'};
    } catch (e: any) {
    // Profile lock collision fallback (v0.15.1)
    const errorMsg = String(e.message || '').toLowerCase();
    const isProfileLocked =
      errorMsg.includes('in use') ||
      errorMsg.includes('lock') ||
      errorMsg.includes('another chrome') ||
      errorMsg.includes('profile appears to be');

    if (isProfileLocked) {
      // Fallback to ephemeral session
      const sessionId = `${process.pid}-${Date.now()}`;
      const tempPath = path.join(
        os.homedir(),
        '.cache',
        'chrome-ai-bridge',
        'sessions',
        sessionId,
        channel || 'stable',
      );
      await fs.promises.mkdir(tempPath, {recursive: true});

      console.error(`⚠️  Profile locked: ${userDataDir}`);
      console.error(`📁 Falling back to ephemeral session: ${tempPath}`);
      console.error(
        `💡 To avoid this, set MCP_CLIENT_ID (e.g., "claude-code", "codex")`,
      );

      // Clean up on exit
      process.on('exit', () => {
        try {
          fs.rmSync(tempPath, {recursive: true, force: true});
        } catch {
          /* ignore */
        }
      });

      finalUserDataDir = tempPath;

      // Retry with ephemeral profile
      localBrowser = await puppeteer.launch({
        ...connectOptions,
        channel: puppeterChannel,
        executablePath: effectiveExecutablePath,
        defaultViewport: null,
        userDataDir: tempPath,
        pipe: true,
        headless: effectiveHeadless,
        args,
        ignoreDefaultArgs: ['--disable-extensions', '--enable-automation'],
      });
      localBrowserHandle = {browser: localBrowser, method: 'launch'};
    } else {
      throw e;
    }
  }
  }

  try {
    // Log actual spawn args for debugging (only for launch method)
    if (localBrowserHandle?.method === 'launch') {
      const spawnArgs = localBrowser.process()?.spawnargs;
      if (spawnArgs) {
        console.error(`Actual spawn args: ${spawnArgs.join(' ')}`);
      }

      if (options.logFile) {
        // FIXME: we are probably subscribing too late to catch startup logs. We
        // should expose the process earlier or expose the getRecentLogs() getter.
        localBrowser.process()?.stderr?.pipe(options.logFile);
        localBrowser.process()?.stdout?.pipe(options.logFile);
      }
    }

    // Apply Google login automation detection bypass to all pages
    localBrowser.on('targetcreated', async target => {
      if (target.type() === 'page') {
        try {
          const page = await target.page();
          if (page) {
            await page.evaluateOnNewDocument(() => {
              Object.defineProperty(window.navigator, 'webdriver', {
                get: () => undefined,
                configurable: true,
              });
            });
            console.error('Applied navigator.webdriver bypass to new page');
          }
        } catch (error) {
          console.error('Failed to apply webdriver bypass:', error);
        }
      }
    });

    // Apply bypass to existing pages
    const initialPages = await localBrowser.pages();
    for (const page of initialPages) {
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(window.navigator, 'webdriver', {
          get: () => undefined,
          configurable: true,
        });
      });
      console.error('Applied navigator.webdriver bypass to existing page');
    }

    // Restore focus to previous app (background mode on macOS)
    if (!focus && !effectiveHeadless && previousApp && os.platform() === 'darwin') {
      try {
        // Small delay to ensure Chrome window is fully rendered
        await new Promise(resolve => setTimeout(resolve, 500));
        execSync(
          `osascript -e 'tell application "${previousApp}" to activate'`,
          {timeout: 5000},
        );
        console.error(`✅ Restored focus to: ${previousApp}`);
      } catch (error) {
        console.warn(
          `⚠️  Could not restore focus: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Set global variables
    browser = localBrowser;
    browserHandle = localBrowserHandle;

    return localBrowser;
  } catch (error) {
    // Fail fast with clear error message - no silent fallback
    console.error(`❌ Failed to launch Chrome`);
    console.error(`   User Data Dir: ${userDataDir}`);
    console.error(`   Profile Directory: ${profileDirectory}`);
    console.error(
      `   Error: ${error instanceof Error ? error.message : String(error)}`,
    );

    if (usingSystemProfile) {
      console.error('');
      console.error('💡 Troubleshooting:');
      console.error('   1. Close all Chrome windows and try again');
      console.error('   2. Use --isolated flag to use temporary profile');
      console.error(
        '   3. Use --userDataDir to specify custom profile location',
      );
    }

    throw error;
  }
}

async function ensureBrowserLaunched(
  options: McpLaunchOptions,
): Promise<Browser> {
  console.error(
    `[ensureBrowserLaunched] browser exists: ${!!browser}, connected: ${browser?.connected}`,
  );

  if (browser?.connected) {
    console.error(`[ensureBrowserLaunched] Reusing existing browser`);
    return browser;
  }

  console.error(`[ensureBrowserLaunched] Launching new browser`);
  browser = await launch(options);
  return browser;
}

export async function resolveBrowser(options: {
  browserUrl?: string;
  executablePath?: string;
  customDevTools?: string;
  channel?: Channel;
  headless?: boolean;
  isolated?: boolean;
  loadExtension?: string;
  loadExtensionsDir?: string;
  loadSystemExtensions?: boolean;
  chromeProfile?: string;
  userDataDir?: string;
  logFile?: fs.WriteStream;
  rootsInfo?: RootsInfo;
  attachTab?: number; // Extension Bridge mode (by tab ID)
  attachTabUrl?: string; // Extension Bridge mode (by URL)
  attachTabNew?: boolean; // Extension Bridge mode (force new tab)
  extensionRelayPort?: number; // Extension Bridge relay port
}) {
  logger(
    `[resolveBrowser] attachTab=${String(
      options.attachTab,
    )} attachTabUrl=${String(options.attachTabUrl)} attachTabNew=${String(
      options.attachTabNew,
    )} extensionRelayPort=${String(options.extensionRelayPort)}`,
  );
  if (
    options.attachTab !== undefined ||
    options.attachTabUrl !== undefined ||
    process.env.MCP_DEBUG_EXTENSION
  ) {
    console.error(
      `[resolveBrowser-debug] attachTab=${String(
        options.attachTab,
      )} attachTabUrl=${String(options.attachTabUrl)} attachTabNew=${String(
        options.attachTabNew,
      )} extensionRelayPort=${String(options.extensionRelayPort)}`,
    );
  }
  // Extension Bridge mode - connect to existing tab by ID
  if (options.attachTab !== undefined) {
    if (browser?.connected) {
      logger('[Extension Bridge] Reusing existing browser connection');
      return browser;
    }
    logger(
      `[Extension Bridge] Connecting to tab ${options.attachTab} via Extension`,
    );
    const connected = await connectViaExtension({
      tabId: options.attachTab,
      newTab: options.attachTabNew,
      relayPort: options.extensionRelayPort,
    });
    browser = connected;
    browserHandle = {browser: connected, method: 'connect'};
    return connected;
  }

  // Extension Bridge mode - connect to existing tab by URL
  if (options.attachTabUrl !== undefined) {
    if (browser?.connected) {
      logger('[Extension Bridge] Reusing existing browser connection');
      return browser;
    }
    logger(
      `[Extension Bridge] Connecting to tab with URL ${options.attachTabUrl} via Extension`,
    );
    try {
      const connected = await connectViaExtension({
        tabUrl: options.attachTabUrl,
        newTab: options.attachTabNew,
        relayPort: options.extensionRelayPort,
      });
      browser = connected;
      browserHandle = {browser: connected, method: 'connect'};
      return connected;
    } catch (error) {
      logger(
        `[Extension Bridge] connectViaExtension failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  // CRITICAL: Project root must be initialized before launching Chrome
  // This ensures proper profile isolation for multi-project environments
  if (
    !isProjectRootInitialized() &&
    !options.browserUrl &&
    !options.userDataDir
  ) {
    const errorMsg = [
      '❌ CRITICAL ERROR: Project root not initialized',
      '',
      'Chrome cannot be launched because the MCP client did not provide the project root directory.',
      'This is required for proper Chrome profile isolation when using multiple projects.',
      '',
      '📋 Required client behavior:',
      '1. Client must call setProjectRoot() immediately after MCP server starts',
      '2. Or set MCP_PROJECT_ROOT environment variable before launching MCP',
      '3. Or use --project-root CLI flag',
      '',
      `Current state: projectRoot=${getProjectRoot() || 'undefined'}`,
      `Process cwd: ${process.cwd()}`,
    ].join('\n');

    console.error(errorMsg);
    throw new Error(
      'Project root not initialized - cannot launch Chrome without profile isolation',
    );
  }

  const resolvedBrowser = options.browserUrl
    ? await ensureBrowserConnected(options.browserUrl)
    : await ensureBrowserLaunched(options);

  return resolvedBrowser;
}

/**
 * Connect to an existing Chrome tab via Extension Bridge
 */
export async function connectViaExtension(options: {
  tabId?: number;
  tabUrl?: string;
  newTab?: boolean;
  relayPort?: number;
}): Promise<Browser> {
  logger(
    `[Extension Bridge] connectViaExtension start tabId=${String(
      options.tabId,
    )} tabUrl=${String(options.tabUrl)} newTab=${String(
      options.newTab,
    )} relayPort=${String(options.relayPort)}`,
  );
  console.error(
    `[Extension Bridge] connectViaExtension start tabId=${String(
      options.tabId,
    )} tabUrl=${String(options.tabUrl)} newTab=${String(
      options.newTab,
    )} relayPort=${String(options.relayPort)}`,
  );
  // Validate: either tabId or tabUrl must be provided
  if (options.tabId === undefined && options.tabUrl === undefined) {
    throw new Error(
      '[Extension Bridge] Either tabId or tabUrl must be provided',
    );
  }
  if (options.tabId !== undefined && options.tabUrl !== undefined) {
    throw new Error(
      '[Extension Bridge] Cannot specify both tabId and tabUrl',
    );
  }

  const target = options.tabId !== undefined
    ? `tab ${options.tabId}`
    : `tab with URL ${options.tabUrl}`;
  logger(`[Extension Bridge] Starting connection to ${target}`);

  // Import Extension Bridge components
  const {RelayServer} = await import('./extension/relay-server.js');
  const {ExtensionTransport} = await import(
    './extension/extension-transport.js'
  );
  const puppeteer = await import('puppeteer-core');

  // Start RelayServer
  const relay = new RelayServer({
    port: options.relayPort || 0,
  });

  const port = await relay.start();
  const token = relay.getToken();
  const wsUrl = relay.getConnectionURL();

  // Start discovery server for extension to find relay URL
  const discoveryPort = await relay.startDiscoveryServer({
    tabUrl: options.tabUrl,
    newTab: options.newTab,
  });

  logger(`[Extension Bridge] RelayServer started on port ${port}`);
  if (discoveryPort) {
    logger(`[Extension Bridge] Discovery server on port ${discoveryPort}`);
    console.error(`[Extension Bridge] Discovery available at http://127.0.0.1:${discoveryPort}/relay-info`);
  }
  logger(`[Extension Bridge] Connection URL: ${wsUrl}`);
  console.error(`[Extension Bridge] RelayServer started on port ${port}`);
  console.error(`[Extension Bridge] Connection URL: ${wsUrl}`);

  // Generate extension UI URL with appropriate parameters
  const uiParams = new URLSearchParams({
    mcpRelayUrl: wsUrl,
  });
  if (options.tabId !== undefined) {
    uiParams.set('tabId', options.tabId.toString());
  }
  if (options.tabUrl !== undefined) {
    uiParams.set('tabUrl', options.tabUrl);
  }
  if (options.newTab) {
    uiParams.set('newTab', 'true');
  }

  logger(
    `[Extension Bridge] Open extension UI: chrome-extension://[EXTENSION_ID]/ui/connect.html?${uiParams.toString()}`,
  );
  console.error(
    `[Extension Bridge] Open extension UI: chrome-extension://[EXTENSION_ID]/ui/connect.html?${uiParams.toString()}`,
  );

  // Wait for Extension to connect
  logger('[Extension Bridge] Waiting for Extension connection...');
  console.error('[Extension Bridge] Waiting for Extension connection...');

  let connectedTabId: number | undefined;
  await new Promise<void>((resolve, reject) => {
    const timeoutMs = 120000;
    const timeout = setTimeout(() => {
      reject(
        new Error('Extension connection timeout (120s) - please install and activate chrome-ai-bridge extension'),
      );
    }, timeoutMs);

    relay.once('ready', (tabId: number) => {
      clearTimeout(timeout);
      connectedTabId = tabId;
      logger(`[Extension Bridge] Extension connected to tab ${tabId}`);
      resolve();
    });

    relay.once('disconnected', () => {
      clearTimeout(timeout);
      reject(new Error('Extension disconnected before ready'));
    });
  });

  let targetInfo:
    | {
        targetId: string;
        type: string;
        title: string;
        url: string;
        attached?: boolean;
        canActivate?: boolean;
        browserContextId?: string;
      }
    | undefined;
  try {
    const attachResult = await relay.sendRequest('attachToTab');
    if (attachResult?.targetInfo) {
      targetInfo = attachResult.targetInfo;
    }
  } catch (error) {
    logger(
      `[Extension Bridge] attachToTab failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Create Puppeteer transport
  if (!targetInfo && connectedTabId !== undefined) {
    targetInfo = {
      targetId: String(connectedTabId),
      type: 'page',
      title: '',
      url: options.tabUrl ?? '',
      attached: false,
      canActivate: true,
      browserContextId: 'default',
    };
  }
  const transport = new ExtensionTransport(relay, targetInfo);

  // Connect Puppeteer to Extension
  const browser = await puppeteer.connect({
    transport,
    defaultViewport: null,
  });

  logger('[Extension Bridge] Puppeteer connected to Extension');

  // Proactively trigger target discovery so browser.pages() can resolve.
  try {
    const session = await browser.target().createCDPSession();
    await session.send('Target.setDiscoverTargets', {discover: true});
    await session.send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
    });
  } catch (error) {
    logger(
      `[Extension Bridge] Target discovery bootstrap failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return browser;
}

export {
  scanExtensionsDirectory,
  discoverSystemExtensions,
  getChromeExtensionsDirectory,
  validateExtensionManifest,
};
export type Channel = 'stable' | 'canary' | 'beta' | 'dev';
export type {ExtensionManifest};
