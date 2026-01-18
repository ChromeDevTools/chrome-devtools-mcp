/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface SystemChromeProfile {
  path: string;
  exists: boolean;
  platform: string;
  channel: string;
}

/**
 * Get platform-specific Chrome user data directory paths
 */
function getChromeUserDataPaths(): Record<string, string> {
  const homeDir = os.homedir();
  const platform = os.platform();

  const platformPaths: Record<string, Record<string, string>> = {
    darwin: {
      stable: path.join(
        homeDir,
        'Library',
        'Application Support',
        'Google',
        'Chrome',
      ),
      canary: path.join(
        homeDir,
        'Library',
        'Application Support',
        'Google',
        'Chrome Canary',
      ),
      beta: path.join(
        homeDir,
        'Library',
        'Application Support',
        'Google',
        'Chrome Beta',
      ),
      dev: path.join(
        homeDir,
        'Library',
        'Application Support',
        'Google',
        'Chrome Dev',
      ),
    },
    win32: {
      stable: path.join(
        homeDir,
        'AppData',
        'Local',
        'Google',
        'Chrome',
        'User Data',
      ),
      canary: path.join(
        homeDir,
        'AppData',
        'Local',
        'Google',
        'Chrome SxS',
        'User Data',
      ),
      beta: path.join(
        homeDir,
        'AppData',
        'Local',
        'Google',
        'Chrome Beta',
        'User Data',
      ),
      dev: path.join(
        homeDir,
        'AppData',
        'Local',
        'Google',
        'Chrome Dev',
        'User Data',
      ),
    },
    linux: {
      stable: path.join(homeDir, '.config', 'google-chrome'),
      canary: path.join(homeDir, '.config', 'google-chrome-unstable'),
      beta: path.join(homeDir, '.config', 'google-chrome-beta'),
      dev: path.join(homeDir, '.config', 'google-chrome-dev'),
    },
  };

  return (platformPaths[platform] as Record<string, string>) || {};
}

/**
 * Check if Chrome profile directory exists and is valid
 */
function validateChromeProfile(profilePath: string): boolean {
  try {
    if (!fs.existsSync(profilePath)) {
      return false;
    }

    const stats = fs.statSync(profilePath);
    if (!stats.isDirectory()) {
      return false;
    }

    // Check for essential Chrome profile files
    const essentialFiles = [
      'Default', // Default profile directory
      'Local State', // Chrome local state file
    ];

    for (const file of essentialFiles) {
      const filePath = path.join(profilePath, file);
      if (!fs.existsSync(filePath)) {
        return false;
      }
    }

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Detect system Chrome profile for the specified channel
 */
export function detectSystemChromeProfile(
  channel = 'stable',
): SystemChromeProfile | null {
  const platform = os.platform();
  const chromePaths = getChromeUserDataPaths();

  if (!chromePaths[channel]) {
    return null;
  }

  const profilePath = chromePaths[channel];
  const exists = validateChromeProfile(profilePath);

  if (exists) {
    return {
      path: profilePath,
      exists: true,
      platform,
      channel,
    };
  }

  return null;
}

/**
 * Detect any available system Chrome profile with fallback priority
 */
export function detectAnySystemChromeProfile(): SystemChromeProfile | null {
  const platform = os.platform();
  const chromePaths = getChromeUserDataPaths();

  // Priority order: stable > beta > dev > canary
  const channelPriority = ['stable', 'beta', 'dev', 'canary'];

  for (const channel of channelPriority) {
    const profilePath = chromePaths[channel];
    if (profilePath) {
      const exists = validateChromeProfile(profilePath);

      if (exists) {
        return {
          path: profilePath,
          exists: true,
          platform,
          channel,
        };
      }
    }
  }

  return null;
}

/**
 * Get all available system Chrome profiles
 */
export function getAllSystemChromeProfiles(): SystemChromeProfile[] {
  const platform = os.platform();
  const chromePaths = getChromeUserDataPaths();
  const profiles: SystemChromeProfile[] = [];

  for (const [channel, profilePath] of Object.entries(chromePaths)) {
    if (profilePath) {
      const exists = validateChromeProfile(profilePath);
      profiles.push({
        path: profilePath,
        exists,
        platform,
        channel,
      });
    }
  }

  return profiles;
}

/**
 * Get the default profile path within a Chrome user data directory
 */
export function getDefaultProfilePath(userDataDir: string): string {
  return path.join(userDataDir, 'Default');
}

/**
 * Check if we're running in a sandboxed environment where system profile detection might fail
 */
export function isSandboxedEnvironment(): boolean {
  const platform = os.platform();

  // Check for common sandbox indicators
  if (platform === 'darwin') {
    // macOS Seatbelt indicators
    const sandboxIndicators = [
      process.env.APP_SANDBOX_CONTAINER_ID,
      process.env.TMPDIR?.includes('TemporaryItems'),
    ];
    return sandboxIndicators.some(indicator => !!indicator);
  }

  if (platform === 'linux') {
    // Linux container indicators
    const containerIndicators = [
      fs.existsSync('/.dockerenv'),
      process.env.container,
      process.env.KUBERNETES_SERVICE_HOST,
    ];
    return containerIndicators.some(indicator => !!indicator);
  }

  return false;
}

/**
 * Log system profile detection information for debugging
 */
export function logSystemProfileInfo(): void {
  const platform = os.platform();
  const profiles = getAllSystemChromeProfiles();
  const sandboxed = isSandboxedEnvironment();

  console.error(`System Chrome Profile Detection:`);
  console.error(`  Platform: ${platform}`);
  console.error(`  Sandboxed Environment: ${sandboxed}`);
  console.error(`  Available Profiles:`);

  if (profiles.length === 0) {
    console.error(`    None detected`);
  } else {
    profiles.forEach((profile, index) => {
      console.error(
        `    ${index + 1}. ${profile.channel}: ${profile.path} (${profile.exists ? 'exists' : 'not found'})`,
      );
    });
  }
}
