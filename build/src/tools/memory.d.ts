/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { type BrowserlessToolFactory, type PageToolFactory } from './ToolDefinition.js';
export declare const takeHeapSnapshot: PageToolFactory;
export declare const getHeapSnapshotSummary: BrowserlessToolFactory;
export declare const getHeapSnapshotDetails: BrowserlessToolFactory;
export declare const getHeapSnapshotClassNodes: BrowserlessToolFactory;
export declare const getHeapSnapshotRetainers: BrowserlessToolFactory;
export declare const closeHeapSnapshot: BrowserlessToolFactory;
export declare const getHeapSnapshotRetainingPaths: BrowserlessToolFactory;
export declare const getHeapSnapshotEdges: BrowserlessToolFactory;
export declare const getHeapSnapshotDominators: BrowserlessToolFactory;
export declare const compareHeapSnapshots: BrowserlessToolFactory;
export declare const getHeapSnapshotDuplicateStrings: BrowserlessToolFactory;
export declare const getHeapSnapshotObjectDetails: BrowserlessToolFactory;
export declare const queryHeapSnapshotObjects: BrowserlessToolFactory;
export declare const analyzeHeapSnapshotContexts: BrowserlessToolFactory;
