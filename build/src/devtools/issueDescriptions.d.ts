/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Reads all issue descriptions from the filesystem into memory.
 */
export declare function loadIssueDescriptions(): Promise<void>;
/**
 * Gets an issue description from the in-memory cache.
 * @param fileName The file name of the issue description.
 * @returns The description of the issue, or null if it doesn't exist.
 */
export declare function getIssueDescription(fileName: string): string | null;
export declare const ISSUE_UTILS: {
    loadIssueDescriptions: () => Promise<void>;
    getIssueDescription: (fileName: string) => string | null;
};
