/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { HeapSnapshotAggregate, HeapSnapshotClassDiff, HeapSnapshotClassDiffTotals, HeapSnapshotDiffObject, DuplicateStringGroup } from '../processors/HeapSnapshotManager.js';
import { DevTools } from '../third_party/index.js';
import type { ByteSizeRange } from '../utils/bytes.js';
export declare const MAX_NAME_LENGTH = 100;
export interface HeapSnapshotFormatOptions {
    /**
     * Values longer than this are truncated. Defaults to `MAX_NAME_LENGTH`. Pass
     * a large value to get untruncated values.
     */
    maxNameLength?: number;
}
/**
 * Renders a name for single-line output: the name is truncated to
 * `maxNameLength` and line breaks are always escaped.
 */
export declare function formatName(name: string, options: HeapSnapshotFormatOptions): string;
export interface ContextAnalysisReport {
    contexts: readonly ScopedContext[];
    scriptsWithoutScopes: readonly DevTools.HeapSnapshotModel.HeapSnapshotModel.ScriptWithoutScopes[];
}
/** A context paired with the scope that declares it. */
export interface ScopedContext {
    scope: DevTools.HeapSnapshotModel.HeapSnapshotModel.ScopeAnalysis;
    context: DevTools.HeapSnapshotModel.HeapSnapshotModel.ContextAnalysis;
}
export interface ContextFilterOptions {
    /** Inclusive dead-field retained-size score range a context must fall into. */
    retainedSize?: ByteSizeRange;
    /** Restricts the result to contexts declared by this scope. */
    scopeInfoNodeId?: number;
}
/**
 * Flattens the analysis into the contexts matching `options`, ranked descending
 * by their dead-field retained-size score across all scopes.
 */
export declare function collectRankedContexts(analysis: DevTools.HeapSnapshotModel.HeapSnapshotModel.ContextAnalysisResult, options?: ContextFilterOptions): ScopedContext[];
export declare function isNodeLike(item: unknown): item is DevTools.HeapSnapshotModel.HeapSnapshotModel.Node;
export declare function isEdgeLike(item: unknown): item is DevTools.HeapSnapshotModel.HeapSnapshotModel.Edge;
export declare class HeapSnapshotFormatter {
    static formatNodes(items: ReadonlyArray<DevTools.HeapSnapshotModel.HeapSnapshotModel.Node | DevTools.HeapSnapshotModel.HeapSnapshotModel.Edge>, options: HeapSnapshotFormatOptions): string;
    static formatRetainingPaths(retainingPaths: readonly DevTools.HeapSnapshotModel.HeapSnapshotModel.RetainingEdge[], options: HeapSnapshotFormatOptions): string;
    static formatDominators(dominators: DevTools.HeapSnapshotModel.HeapSnapshotModel.DominatorChain, options: HeapSnapshotFormatOptions): string;
    static formatDuplicateStrings(groups: readonly DuplicateStringGroup[], options: HeapSnapshotFormatOptions): string;
    static formatNativeContextSizes(sizes: DevTools.HeapSnapshotModel.HeapSnapshotModel.NativeContextSizes, options: HeapSnapshotFormatOptions): string;
    static formatRetainedByContextSummary(summary: DevTools.HeapSnapshotModel.HeapSnapshotModel.RetainedByContextSummary): string;
    static formatAggregates(aggregates: readonly HeapSnapshotAggregate[], options: HeapSnapshotFormatOptions): string;
    static formatDiffSummary(diffs: readonly HeapSnapshotClassDiff[], options: HeapSnapshotFormatOptions): string;
    static formatDiffTotals(totals: HeapSnapshotClassDiffTotals): string;
    static formatDetailedClassDiffHeader(diff: HeapSnapshotClassDiff, options: HeapSnapshotFormatOptions): string;
    static formatDetailedClassDiffObjects(objects: readonly HeapSnapshotDiffObject[]): string;
    static formatObjectInfo(info: DevTools.HeapSnapshotModel.HeapSnapshotModel.ObjectInfo, options: HeapSnapshotFormatOptions): string;
    static formatContextAnalysis(report: ContextAnalysisReport, options: HeapSnapshotFormatOptions): string;
}
