/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export interface LocalState {
    lastActive?: string;
    lastToolCall?: string;
}
export interface Persistence {
    loadState(): Promise<LocalState>;
    saveState(state: LocalState): Promise<void>;
}
export declare class FilePersistence implements Persistence {
    #private;
    constructor(dataFolderOverride?: string);
    loadState(): Promise<LocalState>;
    saveState(state: LocalState): Promise<void>;
}
