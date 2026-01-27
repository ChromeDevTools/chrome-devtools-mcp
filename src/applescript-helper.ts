/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);

async function osascript(script: string): Promise<string> {
  const {stdout} = await execFileAsync('osascript', ['-e', script], {
    encoding: 'utf8',
  });
  return stdout.trim();
}

export async function getFrontmostAppName(): Promise<string> {
  try {
    return await osascript(
      'tell application "System Events" to get name of first process whose frontmost is true',
    );
  } catch {
    return '';
  }
}

export async function activateApp(appName: string): Promise<void> {
  try {
    await osascript(`tell application "${appName}" to activate`);
  } catch (error) {
    console.warn(
      `⚠️  Could not activate ${appName}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function setProcessVisible(
  processName: string,
  visible: boolean,
): Promise<void> {
  try {
    const v = visible ? 'true' : 'false';
    await osascript(
      `tell application "System Events" to set visible of process "${processName}" to ${v}`,
    );
  } catch (error) {
    console.warn(
      `⚠️  Could not set visibility for ${processName}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function bringChromeToFront(): Promise<void> {
  await setProcessVisible('Google Chrome', true);
  await activateApp('Google Chrome');
}

export async function hideChrome(): Promise<void> {
  await setProcessVisible('Google Chrome', false);
}
