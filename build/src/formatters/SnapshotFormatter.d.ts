/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { TextSnapshot } from '../TextSnapshot.js';
export declare class SnapshotFormatter {
    #private;
    constructor(snapshot: TextSnapshot);
    toString(): string;
    toJSON(): object;
}
