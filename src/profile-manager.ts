/**
 * Profile Manager for Chrome DevTools MCP
 *
 * This module manages dedicated Chrome profiles that use symlinks to share
 * Extensions and Bookmarks from the system Chrome profile while maintaining
 * isolated Cookies, Login Data, and Preferences.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Information about a dedicated Chrome profile
 */
export interface DedicatedProfileInfo {
  /** Path to the dedicated profile's user data directory */
  userDataDir: string;
  /** Profile directory name (e.g., "Default") */
  profileDirectory: string;
  /** Path to the system profile (for reference) */
  systemProfilePath?: string;
  /** Chrome channel (stable, beta, canary) */
  channel?: string;
}

/**
 * Detect system Chrome profile for a specific channel
 */
function detectSystemChromeProfile(
  channel?: string,
): { path: string; channel: string } | null {
  const home = os.homedir();
  const chromePaths: Record<string, string> = {
    stable: path.join(home, 'Library/Application Support/Google/Chrome'),
    beta: path.join(home, 'Library/Application Support/Google/Chrome Beta'),
    canary: path.join(
      home,
      'Library/Application Support/Google/Chrome Canary',
    ),
    dev: path.join(home, 'Library/Application Support/Google/Chrome Dev'),
  };

  const targetChannel = channel || 'stable';
  const chromePath = chromePaths[targetChannel];

  if (chromePath && fs.existsSync(chromePath)) {
    return { path: chromePath, channel: targetChannel };
  }

  return null;
}

/**
 * Detect any available system Chrome profile
 */
function detectAnySystemChromeProfile(): {
  path: string;
  channel: string;
} | null {
  const channels = ['stable', 'beta', 'dev', 'canary'];
  for (const channel of channels) {
    const profile = detectSystemChromeProfile(channel);
    if (profile) {
      return profile;
    }
  }
  return null;
}

/**
 * Get the last used profile directory name from Local State
 */
function getLastUsedProfile(userDataDir: string): string {
  const localStatePath = path.join(userDataDir, 'Local State');

  try {
    const localStateContent = fs.readFileSync(localStatePath, 'utf-8');
    const localState = JSON.parse(localStateContent);
    const lastUsed = localState?.profile?.last_used;

    if (lastUsed && typeof lastUsed === 'string') {
      return lastUsed;
    }
  } catch (error) {
    // Ignore errors, will use default
  }

  return 'Default';
}

/**
 * Create or update a symlink safely
 *
 * @param target - The target path that the symlink should point to
 * @param linkPath - The path where the symlink should be created
 */
function createSymlinkSafe(target: string, linkPath: string): void {
  // Check if target exists
  if (!fs.existsSync(target)) {
    console.error(`⚠️  Symlink target does not exist: ${target}`);
    return;
  }

  // If link already exists and points to the correct target, skip
  if (fs.existsSync(linkPath)) {
    try {
      const currentTarget = fs.readlinkSync(linkPath);
      if (currentTarget === target) {
        // Already correctly linked
        return;
      }
      // Remove old symlink
      fs.unlinkSync(linkPath);
    } catch (error) {
      // Not a symlink, remove the file/directory
      if (fs.lstatSync(linkPath).isDirectory()) {
        fs.rmSync(linkPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(linkPath);
      }
    }
  }

  // Create new symlink
  fs.symlinkSync(target, linkPath, 'dir');
  console.error(`🔗 Created symlink: ${path.basename(linkPath)} -> ${target}`);
}

/**
 * Setup a dedicated Chrome profile with symlinks to system profile
 *
 * This function:
 * 1. Detects the system Chrome profile
 * 2. Creates a dedicated profile directory
 * 3. Creates symlinks for Extensions and Bookmarks
 * 4. Returns the dedicated profile information
 *
 * @param channel - Chrome channel to use (stable, beta, canary, dev)
 * @returns Dedicated profile information
 */
export async function setupDedicatedProfile(
  channel?: string,
): Promise<DedicatedProfileInfo> {
  // Detect system Chrome profile
  const systemProfile =
    detectSystemChromeProfile(channel) || detectAnySystemChromeProfile();

  if (!systemProfile) {
    throw new Error(
      'No system Chrome profile found. Please install Chrome and run it at least once.',
    );
  }

  // Get the last used profile directory
  const profileDirectory = getLastUsedProfile(systemProfile.path);
  const systemProfileDir = path.join(systemProfile.path, profileDirectory);

  // Create dedicated profile directory
  const dedicatedUserDataDir = path.join(
    os.homedir(),
    '.cache',
    'chrome-devtools-mcp',
    'chrome-profile-dedicated',
  );

  await fs.promises.mkdir(dedicatedUserDataDir, { recursive: true });

  const dedicatedProfileDir = path.join(
    dedicatedUserDataDir,
    profileDirectory,
  );
  await fs.promises.mkdir(dedicatedProfileDir, { recursive: true });

  console.error('📁 Dedicated Profile Setup:');
  console.error(`   System Profile: ${systemProfileDir}`);
  console.error(`   Dedicated Profile: ${dedicatedProfileDir}`);
  console.error(`   Profile Directory: ${profileDirectory}`);

  // Create symlinks for shared resources
  const symlinkTargets = [
    { name: 'Extensions', required: false },
    { name: 'Bookmarks', required: false },
  ];

  for (const { name, required } of symlinkTargets) {
    const targetPath = path.join(systemProfileDir, name);
    const linkPath = path.join(dedicatedProfileDir, name);

    if (fs.existsSync(targetPath)) {
      createSymlinkSafe(targetPath, linkPath);
    } else if (required) {
      console.error(`⚠️  Required item not found: ${name}`);
    }
  }

  console.error('✅ Dedicated profile setup complete');
  console.error(
    '   First launch will require Google login (login state is not shared)',
  );

  return {
    userDataDir: dedicatedUserDataDir,
    profileDirectory,
    systemProfilePath: systemProfileDir,
    channel: systemProfile.channel,
  };
}