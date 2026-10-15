/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { logger } from '../utils/logger.js';
import { ClearcutLogger } from './ClearcutLogger.js';
import { ErrorCode } from './errors.js';
function isValidTime(time) {
    if (time === undefined) {
        return true;
    }
    if (typeof time !== 'string' || time === '') {
        return false;
    }
    return !Number.isNaN(new Date(time).getTime());
}
function isContextValid(state) {
    return isValidTime(state.lastActive) && isValidTime(state.lastToolCall);
}
const STATE_FILE_NAME = 'telemetry_state.json';
function getDataFolder() {
    const homedir = os.homedir();
    const { env } = process;
    const name = 'chrome-devtools-mcp';
    if (process.platform === 'darwin') {
        return path.join(homedir, 'Library', 'Application Support', name);
    }
    if (process.platform === 'win32') {
        const localAppData = env.LOCALAPPDATA || path.join(homedir, 'AppData', 'Local');
        return path.join(localAppData, name, 'Data');
    }
    return path.join(env.XDG_DATA_HOME || path.join(homedir, '.local', 'share'), name);
}
export class FilePersistence {
    #dataFolder;
    constructor(dataFolderOverride) {
        this.#dataFolder = dataFolderOverride ?? getDataFolder();
    }
    async loadState() {
        const filePath = path.join(this.#dataFolder, STATE_FILE_NAME);
        try {
            await fs.access(filePath);
        }
        catch {
            // File doesn't exist. Not an error because new users do not have the state file.
            return {};
        }
        let state;
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            state = JSON.parse(content);
        }
        catch (error) {
            logger?.(`Failed to read telemetry state from ${filePath}:`, error);
            void ClearcutLogger.get()?.logServerError({
                errorCode: ErrorCode.ERROR_CODE_PERSISTENCE_FILE_READ_FAILED,
            });
            return {};
        }
        return isContextValid(state) ? state : {};
    }
    async saveState(state) {
        const filePath = path.join(this.#dataFolder, STATE_FILE_NAME);
        try {
            await fs.mkdir(this.#dataFolder, { recursive: true });
            await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf-8');
        }
        catch (error) {
            // Ignore errors during state saving to avoid crashing the server
            logger?.(`Failed to save telemetry state to ${filePath}:`, error);
            void ClearcutLogger.get()?.logServerError({
                errorCode: ErrorCode.ERROR_CODE_PERSISTENCE_FILE_SAVE_FAILED,
            });
        }
    }
}
//# sourceMappingURL=persistence.js.map