/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
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

import {
  detectSystemChromeProfile,
  detectAnySystemChromeProfile,
  isSandboxedEnvironment,
  logSystemProfileInfo,
  type SystemChromeProfile,
} from './system-profile.js';

let browser: Browser | undefined;


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
                const manifestContent = fs.readFileSync(subManifestPath, 'utf-8');
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
 * Get the Chrome extensions directory path for the current platform
 */
function getChromeExtensionsDirectory(channel?: Channel): string {
  const homeDir = os.homedir();
  const platform = os.platform();

  let chromeDataPath: string;
  let profileName = 'Default';

  if (platform === 'darwin') {
    // macOS
    chromeDataPath = path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome');
    if (channel === 'canary') {
      chromeDataPath = path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome Canary');
    } else if (channel === 'beta') {
      chromeDataPath = path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome Beta');
    } else if (channel === 'dev') {
      chromeDataPath = path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome Dev');
    }
  } else if (platform === 'win32') {
    // Windows
    chromeDataPath = path.join(homeDir, 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
    if (channel === 'canary') {
      chromeDataPath = path.join(homeDir, 'AppData', 'Local', 'Google', 'Chrome SxS', 'User Data');
    } else if (channel === 'beta') {
      chromeDataPath = path.join(homeDir, 'AppData', 'Local', 'Google', 'Chrome Beta', 'User Data');
    } else if (channel === 'dev') {
      chromeDataPath = path.join(homeDir, 'AppData', 'Local', 'Google', 'Chrome Dev', 'User Data');
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

function validateExtensionManifest(manifestPath: string): ExtensionManifest | null {
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
    console.warn(`Invalid manifest.json at ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Discover Chrome extensions installed in the system
 */
function discoverSystemExtensions(channel?: Channel): string[] {
  const extensionPaths: string[] = [];
  const extensionsDir = getChromeExtensionsDirectory(channel);

  console.error(`🔍 Discovering system Chrome extensions in: ${extensionsDir}`);

  try {
    if (!fs.existsSync(extensionsDir)) {
      console.warn(`System Chrome extensions directory not found: ${extensionsDir}`);
      return extensionPaths;
    }

    const extensionIds = fs.readdirSync(extensionsDir, { withFileTypes: true });

    for (const extensionEntry of extensionIds) {
      if (!extensionEntry.isDirectory()) continue;

      const extensionIdPath = path.join(extensionsDir, extensionEntry.name);

      try {
        // Each extension ID directory contains version subdirectories
        const versions = fs.readdirSync(extensionIdPath, { withFileTypes: true });

        // Find the latest/most recent version
        let latestVersion = '';
        let latestPath = '';

        for (const versionEntry of versions) {
          if (!versionEntry.isDirectory()) continue;

          const versionPath = path.join(extensionIdPath, versionEntry.name);
          const manifestPath = path.join(versionPath, 'manifest.json');

          const manifest = validateExtensionManifest(manifestPath);
          if (manifest) {
            // Use the first valid version found (Chrome keeps the latest active)
            if (!latestVersion || versionEntry.name > latestVersion) {
              latestVersion = versionEntry.name;
              latestPath = versionPath;
            }
          }
        }

        if (latestPath && latestVersion) {
          const manifest = validateExtensionManifest(path.join(latestPath, 'manifest.json'));
          if (manifest) {
            extensionPaths.push(latestPath);
            console.error(`  ✅ Found: ${manifest.name} v${manifest.version} (Manifest v${manifest.manifest_version})`);
          }
        }
      } catch (error) {
        console.warn(`Error processing extension ${extensionEntry.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    console.error(`📦 System extension discovery complete: ${extensionPaths.length} valid extensions found`);
  } catch (error) {
    console.error(`Error discovering system extensions: ${error instanceof Error ? error.message : String(error)}`);
  }

  return extensionPaths;
}

interface McpLaunchOptions {
  executablePath?: string;
  customDevTools?: string;
  channel?: Channel;
  userDataDir?: string;
  headless: boolean;
  isolated: boolean;
  loadExtension?: string;
  loadExtensionsDir?: string;
  loadSystemExtensions?: boolean;
  logFile?: fs.WriteStream;
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
    headless,
    isolated,
    loadExtension,
    loadExtensionsDir,
    loadSystemExtensions,
  } = options;

  // Reset development extension paths
  developmentExtensionPaths = [];
  const profileDirName =
    channel && channel !== 'stable'
      ? `chrome-profile-${channel}`
      : 'chrome-profile';

  let userDataDir = options.userDataDir;
  let usingSystemProfile = false;
  let profileDirectory = 'Default';

  if (!userDataDir) {
    // Use isolated profile (independent from system Chrome)
    userDataDir = path.join(
      os.homedir(),
      '.cache',
      'chrome-devtools-mcp',
      profileDirName,
    );
    await fs.promises.mkdir(userDataDir, {
      recursive: true,
    });
    console.error(`📁 Using isolated profile: ${userDataDir}`);
  }

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
            console.error(`❌ Invalid manifest.json in ${loadExtension}: missing manifest_version`);
          }
        } catch (error) {
          console.error(`❌ Invalid manifest.json in ${loadExtension}: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        console.error(`❌ Extension path missing manifest.json: ${loadExtension}`);
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
    const systemExtensions = discoverSystemExtensions(channel);
    if (systemExtensions.length > 0) {
      extensionPaths.push(...systemExtensions);
      console.error(`✅ Loaded ${systemExtensions.length} system Chrome extension(s)`);
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
    console.error(`Chrome args will include: --load-extension=${extensionPaths.join(',')}`);
    console.error('Applied Chrome 137+ extension loading fix');
  }

  // Add Google login automation detection bypass
  args.push('--disable-blink-features=AutomationControlled');
  console.error('Added Google login bypass: --disable-blink-features=AutomationControlled');
  let puppeterChannel: ChromeReleaseChannel | undefined;
  if (!executablePath) {
    puppeterChannel =
      channel && channel !== 'stable'
        ? (`chrome-${channel}` as ChromeReleaseChannel)
        : 'chrome';
  }

  // Log complete Chrome configuration before launch
  console.error('Chrome Launch Configuration:');
  console.error(`  Channel: ${puppeterChannel || 'default'}`);
  console.error(`  Executable: ${executablePath || 'auto-detected'}`);
  console.error(`  User Data Dir: ${userDataDir || 'temporary'}`);
  console.error(`  Profile Directory: ${profileDirectory}`);
  console.error(`  Profile Type: ${usingSystemProfile ? 'System Profile (auto-detected)' : 'Custom Profile'}`);
  console.error(`  Headless: ${headless}`);
  console.error(`  Args: ${JSON.stringify(args, null, 2)}`);
  console.error(`  Ignored Default Args: ["--disable-extensions", "--enable-automation"]`);

  try {
    const browser = await puppeteer.launch({
      ...connectOptions,
      channel: puppeterChannel,
      executablePath,
      defaultViewport: null,
      userDataDir,
      pipe: true,
      headless,
      args,
      ignoreDefaultArgs: ['--disable-extensions', '--enable-automation'],
    });

    // Log actual spawn args for debugging
    const spawnArgs = browser.process()?.spawnargs;
    if (spawnArgs) {
      console.error(`Actual spawn args: ${spawnArgs.join(' ')}`);
    }

    if (options.logFile) {
      // FIXME: we are probably subscribing too late to catch startup logs. We
      // should expose the process earlier or expose the getRecentLogs() getter.
      browser.process()?.stderr?.pipe(options.logFile);
      browser.process()?.stdout?.pipe(options.logFile);
    }

    // Apply Google login automation detection bypass to all pages
    browser.on('targetcreated', async (target) => {
      if (target.type() === 'page') {
        try {
          const page = await target.page();
          if (page) {
            await page.evaluateOnNewDocument(() => {
              Object.defineProperty(window.navigator, 'webdriver', {
                get: () => undefined,
                configurable: true
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
    const initialPages = await browser.pages();
    for (const page of initialPages) {
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(window.navigator, 'webdriver', {
          get: () => undefined,
          configurable: true
        });
      });
      console.error('Applied navigator.webdriver bypass to existing page');
    }

    // Verify extensions were loaded by checking chrome://extensions/
    if (extensionPaths.length > 0) {
      console.error('🔍 Verifying extension loading...');
      try {
        const pages = await browser.pages();
        const page = pages[0] || await browser.newPage();

        // Add a small delay to ensure Chrome is fully started
        await new Promise(resolve => setTimeout(resolve, 2000));

        await page.goto('chrome://extensions/', { waitUntil: 'networkidle0' });

        const loadedExtensions = await page.evaluate(() => {
          const extensionCards = document.querySelectorAll('extensions-item');
          const results: Array<{name: string; id: string; enabled: boolean}> = [];

          Array.from(extensionCards).forEach(card => {
            const shadowRoot = card.shadowRoot;
            if (shadowRoot) {
              const name = shadowRoot.querySelector('#name')?.textContent?.trim() || 'Unknown';
              const enabled = !shadowRoot.querySelector('#enable-toggle')?.hasAttribute('disabled');
              const id = card.getAttribute('id') || 'unknown';
              results.push({ name, id, enabled });
            }
          });

          return results;
        });

        console.error(`✅ Extensions verification complete. Found ${loadedExtensions.length} extensions:`);
        loadedExtensions.forEach((ext, index) => {
          console.error(`  ${index + 1}. ${ext.name} (${ext.enabled ? 'enabled' : 'disabled'}) - ID: ${ext.id}`);
        });

        if (loadedExtensions.length === 0) {
          console.error('⚠️  No extensions found in chrome://extensions/ - this may indicate loading failure');
        }

      } catch (verificationError) {
        console.error(`⚠️  Extension verification failed: ${verificationError}`);
      }
    }

    return browser;
  } catch (error) {
    // Fail fast with clear error message - no silent fallback
    console.error(`❌ Failed to launch Chrome`);
    console.error(`   User Data Dir: ${userDataDir}`);
    console.error(`   Profile Directory: ${profileDirectory}`);
    console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);

    if (usingSystemProfile) {
      console.error('');
      console.error('💡 Troubleshooting:');
      console.error('   1. Close all Chrome windows and try again');
      console.error('   2. Use --isolated flag to use temporary profile');
      console.error('   3. Use --userDataDir to specify custom profile location');
    }

    throw error;
  }
}

async function ensureBrowserLaunched(
  options: McpLaunchOptions,
): Promise<Browser> {
  if (browser?.connected) {
    return browser;
  }
  browser = await launch(options);
  return browser;
}

export async function resolveBrowser(options: {
  browserUrl?: string;
  executablePath?: string;
  customDevTools?: string;
  channel?: Channel;
  headless: boolean;
  isolated: boolean;
  loadExtension?: string;
  loadExtensionsDir?: string;
  loadSystemExtensions?: boolean;
  userDataDir?: string;
  logFile?: fs.WriteStream;
}) {
  const resolvedBrowser = options.browserUrl
    ? await ensureBrowserConnected(options.browserUrl)
    : await ensureBrowserLaunched(options);

  return resolvedBrowser;
}

export {
  scanExtensionsDirectory,
  discoverSystemExtensions,
  getChromeExtensionsDirectory,
  validateExtensionManifest
};
export type Channel = 'stable' | 'canary' | 'beta' | 'dev';
export type { ExtensionManifest };
