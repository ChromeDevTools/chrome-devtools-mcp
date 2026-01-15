/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {logger} from '../logger.js';

export interface LocalState {
  lastActive: string; // ISO 8601 UTC date string
}

const STATE_FILE_NAME = 'telemetry_state.json';
function getDataFolder(): string {
  const homedir = os.homedir();
  const {env} = process;
  const name = 'chrome-devtools-mcp';

  if (process.platform === 'darwin') {
    return path.join(homedir, 'Library', 'Application Support', name);
  }

  if (process.platform === 'win32') {
    const localAppData =
      env.LOCALAPPDATA || path.join(homedir, 'AppData', 'Local');
    return path.join(localAppData, name, 'Data');
  }

  return path.join(
    env.XDG_DATA_HOME || path.join(homedir, '.local', 'share'),
    name,
  );
}

export interface Persistence {
  loadState(): Promise<LocalState>;
  saveState(state: LocalState): Promise<void>;
}

export class FilePersistence implements Persistence {
  #dataFolder: string;

  constructor(dataFolderOverride?: string) {
    this.#dataFolder = dataFolderOverride ?? getDataFolder();
  }

  async loadState(): Promise<LocalState> {
    try {
      const filePath = path.join(this.#dataFolder, STATE_FILE_NAME);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as LocalState;
    } catch {
      return {
        lastActive: '',
      };
    }
  }

  async saveState(state: LocalState): Promise<void> {
    const filePath = path.join(this.#dataFolder, STATE_FILE_NAME);
    try {
      await fs.mkdir(this.#dataFolder, {recursive: true});
      await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch (error) {
      // Ignore errors during state saving to avoid crashing the server
      logger(`Failed to save telemetry state to ${filePath}:`, error);
    }
  }
}
