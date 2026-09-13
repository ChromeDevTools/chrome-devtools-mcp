/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import {logger} from '../utils/logger.js';
import {getDataFolder} from '../utils/paths.js';

import {ClearcutLogger} from './ClearcutLogger.js';
import {ErrorCode} from './errors.js';

export interface LocalState {
  lastActive?: string; // ISO 8601 UTC date string
  lastToolCall?: string; // ISO 8601 UTC date string
}

function isValidTime(time?: unknown): boolean {
  if (time === undefined) {
    return true;
  }
  if (typeof time !== 'string' || time === '') {
    return false;
  }
  return !Number.isNaN(new Date(time).getTime());
}

function isContextValid(state: LocalState): boolean {
  return isValidTime(state.lastActive) && isValidTime(state.lastToolCall);
}

const STATE_FILE_NAME = 'telemetry_state.json';

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
    const filePath = path.join(this.#dataFolder, STATE_FILE_NAME);
    try {
      await fs.access(filePath);
    } catch {
      // File doesn't exist. Not an error because new users do not have the state file.
      return {};
    }

    let state;
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      state = JSON.parse(content) as LocalState;
    } catch (error) {
      logger?.(`Failed to read telemetry state from ${filePath}:`, error);
      void ClearcutLogger.get()?.logServerError({
        errorCode: ErrorCode.ERROR_CODE_PERSISTENCE_FILE_READ_FAILED,
      });
      return {};
    }

    return isContextValid(state) ? state : {};
  }

  async saveState(state: LocalState): Promise<void> {
    const filePath = path.join(this.#dataFolder, STATE_FILE_NAME);
    try {
      await fs.mkdir(this.#dataFolder, {recursive: true});
      await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch (error) {
      // Ignore errors during state saving to avoid crashing the server
      logger?.(`Failed to save telemetry state to ${filePath}:`, error);
      void ClearcutLogger.get()?.logServerError({
        errorCode: ErrorCode.ERROR_CODE_PERSISTENCE_FILE_SAVE_FAILED,
      });
    }
  }
}
