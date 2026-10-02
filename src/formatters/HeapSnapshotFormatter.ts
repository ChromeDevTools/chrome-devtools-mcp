/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AggregatedInfoWithId,
  HeapSnapshotClassDiff,
  HeapSnapshotDetailedClassDiff,
  DuplicateStringGroup,
} from '../processors/HeapSnapshotManager.js';
import {DevTools} from '../third_party/index.js';
import type {ByteSizeRange} from '../utils/bytes.js';
import {stableIdSymbol} from '../utils/id.js';

const {formatBytesToKb} = DevTools.I18n.ByteUtilities;

export const MAX_NAME_LENGTH = 100;

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
export function formatName(
  name: string,
  options: HeapSnapshotFormatOptions,
): string {
  return truncateValue(name, options.maxNameLength)
    .replaceAll('\r', '\\r')
    .replaceAll('\n', '\\n');
}

/**
 * Truncates `value` to `maxLength`, appending an ellipsis if it was cut off.
 */
export function truncateValue(
  value: string,
  maxLength = MAX_NAME_LENGTH,
): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength) + '...';
}

export interface FormattedSnapshotEntry {
  className: string;
  id?: number;
  count: number;
  selfSize: string;
  retainedSize: string;
}

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
export function collectRankedContexts(
  analysis: DevTools.HeapSnapshotModel.HeapSnapshotModel.ContextAnalysisResult,
  options: ContextFilterOptions = {},
): ScopedContext[] {
  const {min = 0, max} = options.retainedSize ?? {};
  const contexts: ScopedContext[] = [];
  for (const scope of analysis.scopes) {
    if (
      options.scopeInfoNodeId !== undefined &&
      scope.scopeInfoNodeId !== options.scopeInfoNodeId
    ) {
      continue;
    }
    for (const context of scope.contexts) {
      const score = context.deadFieldsRetainedSizeSum;
      if (score < min || (max !== undefined && score > max)) {
        continue;
      }
      contexts.push({scope, context});
    }
  }
  contexts.sort(
    (left, right) =>
      right.context.deadFieldsRetainedSizeSum -
      left.context.deadFieldsRetainedSizeSum,
  );
  return contexts;
}

export function isNodeLike(
  item: unknown,
): item is DevTools.HeapSnapshotModel.HeapSnapshotModel.Node {
  return (
    typeof item === 'object' && item !== null && 'id' in item && 'name' in item
  );
}

export function isEdgeLike(
  item: unknown,
): item is DevTools.HeapSnapshotModel.HeapSnapshotModel.Edge {
  return (
    typeof item === 'object' &&
    item !== null &&
    'name' in item &&
    'node' in item &&
    'type' in item &&
    typeof item.node === 'object' &&
    item.node !== null &&
    'id' in item.node &&
    'name' in item.node
  );
}

export class HeapSnapshotFormatter {
  #aggregates: Record<string, AggregatedInfoWithId>;

  constructor(aggregates: Record<string, AggregatedInfoWithId>) {
    this.#aggregates = aggregates;
  }

  static formatNodes(
    items: ReadonlyArray<
      | DevTools.HeapSnapshotModel.HeapSnapshotModel.Node
      | DevTools.HeapSnapshotModel.HeapSnapshotModel.Edge
    >,
    options: HeapSnapshotFormatOptions,
  ): string {
    const lines: string[] = [];

    if (items.length > 0) {
      const firstItem = items[0];
      if (isNodeLike(firstItem)) {
        lines.push('nodeId,nodeName,type,distance,selfSize,retainedSize');
      } else if (isEdgeLike(firstItem)) {
        lines.push('name,type,nodeId,nodeName,selfSize,retainedSize');
      }
    }

    for (const item of items) {
      if (isNodeLike(item)) {
        lines.push(
          `${item.id},${formatName(item.name, options)},${item.type},${item.distance},${formatBytesToKb(item.selfSize)},${formatBytesToKb(item.retainedSize)}`,
        );
      } else if (isEdgeLike(item)) {
        lines.push(
          `${formatName(item.name, options)},${item.type},${item.node.id},${formatName(item.node.name, options)},${formatBytesToKb(item.node.selfSize)},${formatBytesToKb(item.node.retainedSize)}`,
        );
      }
    }

    return lines.join('\n');
  }

  static formatRetainingPaths(
    retainingPaths: readonly DevTools.HeapSnapshotModel.HeapSnapshotModel.RetainingEdge[],
    options: HeapSnapshotFormatOptions,
  ): string {
    const lines: string[] = [];

    function formatEdge(
      edge: DevTools.HeapSnapshotModel.HeapSnapshotModel.RetainingEdge,
      depth: number,
    ) {
      const indent = '  '.repeat(depth);
      lines.push(
        `${indent}<- @${edge.nodeId} ${formatName(edge.nodeName, options)} via ${edge.edgeType} ${formatName(edge.edgeName, options)} (distance: ${edge.distance})`,
      );
      for (const child of edge.children) {
        formatEdge(child, depth + 1);
      }
    }

    for (const path of retainingPaths) {
      formatEdge(path, 0);
    }

    return lines.join('\n');
  }

  static formatDominators(
    dominators: DevTools.HeapSnapshotModel.HeapSnapshotModel.DominatorChain,
    options: HeapSnapshotFormatOptions,
  ): string {
    const lines: string[] = [];
    lines.push('nodeId,nodeName,selfSize,retainedSize');
    for (const node of dominators) {
      lines.push(
        `${node.nodeId},${formatName(node.nodeName, options)},${formatBytesToKb(node.selfSize)},${formatBytesToKb(node.retainedSize)}`,
      );
    }
    return lines.join('\n');
  }

  static formatDuplicateStrings(
    groups: readonly DuplicateStringGroup[],
    options: HeapSnapshotFormatOptions,
  ): string {
    const lines: string[] = [];
    lines.push('value,count,totalSelfSize,totalRetainedSize,truncated,nodeIds');
    for (const group of groups) {
      const nodeIds = group.nodes.map(n => `@${n.id}`).join(' ');
      const truncated = group.truncated ?? false;
      const displayValue = truncateValue(group.value, options.maxNameLength);
      lines.push(
        `${JSON.stringify(displayValue)},${group.count},${formatBytesToKb(group.totalSelfSize)},${formatBytesToKb(group.totalRetainedSize)},${truncated},${nodeIds}`,
      );
    }
    return lines.join('\n');
  }

  static formatNativeContextSizes(
    sizes: DevTools.HeapSnapshotModel.HeapSnapshotModel.NativeContextSizes,
    options: HeapSnapshotFormatOptions,
  ): string {
    const lines: string[] = [];
    lines.push('nodeId,nodeName,selfSize,retainedSize,attributedSize');
    const sortedContexts = [...sizes.nativeContexts].sort(
      (a, b) => b.attributedSize - a.attributedSize,
    );
    for (const nc of sortedContexts) {
      lines.push(
        `${nc.nodeId},${formatName(nc.nodeName, options)},${formatBytesToKb(nc.selfSize)},${formatBytesToKb(nc.retainedSize)},${formatBytesToKb(nc.attributedSize)}`,
      );
    }
    lines.push(`Shared Size: ${formatBytesToKb(sizes.sharedSize)}`);
    lines.push(
      `Unattributed Size: ${formatBytesToKb(sizes.noAttributionSize)}`,
    );
    return lines.join('\n');
  }

  static formatRetainedByContextSummary(
    summary: DevTools.HeapSnapshotModel.HeapSnapshotModel.RetainedByContextSummary,
  ): string {
    const lines: string[] = [];
    lines.push(`Context count: ${summary.contextCount}`);
    lines.push(
      `Retained by context size: ${formatBytesToKb(summary.retainedByContextSize)} (${summary.retainedByContextCount} objects)`,
    );
    lines.push(
      `Not retained by context size: ${formatBytesToKb(summary.notRetainedByContextSize)} (${summary.notRetainedByContextCount} objects)`,
    );
    lines.push(`Total size: ${formatBytesToKb(summary.totalSize)}`);
    return lines.join('\n');
  }

  #getSortedAggregates(): AggregatedInfoWithId[] {
    return Object.values(this.#aggregates).sort((a, b) => b.maxRet - a.maxRet);
  }

  toString(): string {
    const sorted = this.#getSortedAggregates();
    const lines: string[] = [];
    lines.push('id,name,count,selfSize,retainedSize');

    for (const info of sorted) {
      const id = info[stableIdSymbol] ?? '';
      lines.push(
        `${id},${info.name},${info.count},${formatBytesToKb(info.self)},${formatBytesToKb(info.maxRet)}`,
      );
    }

    return lines.join('\n');
  }

  toJSON(): FormattedSnapshotEntry[] {
    const sorted = this.#getSortedAggregates();
    return sorted.map(info => ({
      id: info[stableIdSymbol],
      className: info.name,
      count: info.count,
      selfSize: formatBytesToKb(info.self),
      retainedSize: formatBytesToKb(info.maxRet),
    }));
  }

  static sort(
    aggregates: Record<
      string,
      DevTools.HeapSnapshotModel.HeapSnapshotModel.AggregatedInfo
    >,
  ): Array<
    [string, DevTools.HeapSnapshotModel.HeapSnapshotModel.AggregatedInfo]
  > {
    return Object.entries(aggregates).sort((a, b) => b[1].maxRet - a[1].maxRet);
  }

  static formatDiffSummary(diffs: HeapSnapshotClassDiff[]): string {
    const lines: string[] = [];
    lines.push(
      'index,className,addedCount,removedCount,countDelta,addedSize,removedSize,sizeDelta',
    );

    let index = 0;
    for (const diff of diffs) {
      lines.push(
        `${index},${diff.className},${diff.addedCount},${diff.removedCount},${diff.countDelta},${formatBytesToKb(diff.addedSize)},${formatBytesToKb(diff.removedSize)},${formatBytesToKb(diff.sizeDelta)}`,
      );
      index++;
    }

    return lines.join('\n');
  }

  static formatDiffDetails(diff: HeapSnapshotDetailedClassDiff): string {
    const lines: string[] = [];
    lines.push(
      `${diff.className}: # new: ${diff.addedCount}, # deleted: ${diff.removedCount}, # delta: ${formatSignedCount(diff.countDelta)}, alloc size: ${formatSignedSize(diff.addedSize)}, freed size: ${formatSignedSize(diff.removedSize)}, size delta: ${formatSignedSize(diff.sizeDelta)}`,
    );

    const addedIds = diff.addedIds;
    const addedSelfSizes = diff.addedSelfSizes;
    const deletedIds = diff.deletedIds;
    const deletedSelfSizes = diff.deletedSelfSizes;

    lines.push(`Objects:`);

    for (let i = 0; i < addedIds.length; i++) {
      lines.push(
        `  + @${addedIds[i]} (self_size: ${formatBytesToKb(addedSelfSizes[i])})`,
      );
    }
    for (let i = 0; i < deletedIds.length; i++) {
      lines.push(
        `  - @${deletedIds[i]} (self_size: ${formatBytesToKb(deletedSelfSizes[i])})`,
      );
    }

    return lines.join('\n');
  }

  static formatObjectInfo(
    info: DevTools.HeapSnapshotModel.HeapSnapshotModel.ObjectInfo,
    options: HeapSnapshotFormatOptions,
  ): string {
    const lines = [
      `id: @${info.id}`,
      `name: ${formatName(info.name, options)}`,
      `type: ${info.type}`,
      `detachedness: ${formatDOMLinkState(info.detachedness)}`,
      `selfSize: ${formatBytesToKb(info.selfSize)}`,
      `retainedSize: ${formatBytesToKb(info.retainedSize)}`,
      `distance: ${info.distance}`,
      `edgeCount: ${info.edgeCount}`,
      `retainerCount: ${info.retainerCount}`,
    ];
    return lines.join('\n');
  }

  static formatContextAnalysis(
    report: ContextAnalysisReport,
    options: HeapSnapshotFormatOptions,
  ): string {
    const lines: string[] = [];

    if (report.contexts.length === 0) {
      lines.push('No live contexts with dead fields were found.');
    }

    for (const {scope, context} of report.contexts) {
      if (lines.length > 0) {
        lines.push('');
      }
      lines.push(
        `#### Context @${context.contextNodeId} in \`${formatScopeName(scope, options)}\` — ${formatBytesToKb(context.deadFieldsRetainedSizeSum)}`,
        `Script @${scope.scriptNodeId}, ScopeInfo @${scope.scopeInfoNodeId}, offsets ${scope.scopeStart}-${scope.scopeEnd}, ${formatCount(scope.contextFieldCount, 'context field')}`,
      );
      for (const field of context.deadFields) {
        lines.push(
          `- \`${formatName(field.name, options)}\` (${formatName(field.valueName, options)} @${field.valueNodeId}) — ${formatBytesToKb(field.retainedSize)}`,
        );
      }
    }

    if (report.scriptsWithoutScopes.length > 0) {
      lines.push('', 'Scripts without scope metadata could not be analyzed:');
      for (const script of report.scriptsWithoutScopes) {
        const scriptName = script.scriptName
          ? formatName(script.scriptName, options)
          : `script @${script.scriptNodeId}`;
        lines.push(
          `- \`${scriptName}\` (@${script.scriptNodeId}) — ${formatCount(script.contextCount, 'context')}`,
        );
      }
    }

    return lines.join('\n');
  }
}

function formatCount(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function formatScopeName(
  scope: DevTools.HeapSnapshotModel.HeapSnapshotModel.ScopeAnalysis,
  options: HeapSnapshotFormatOptions,
): string {
  const scriptName = scope.scriptName
    ? formatName(scope.scriptName, options)
    : `script @${scope.scriptNodeId}`;
  return scope.scopeName
    ? `${formatName(scope.scopeName, options)} (${scriptName})`
    : scriptName;
}

function formatDOMLinkState(
  state: DevTools.HeapSnapshotModel.HeapSnapshotModel.DOMLinkState,
): string {
  switch (state) {
    case DevTools.HeapSnapshotModel.HeapSnapshotModel.DOMLinkState.ATTACHED:
      return 'attached';
    case DevTools.HeapSnapshotModel.HeapSnapshotModel.DOMLinkState.DETACHED:
      return 'detached';
    case DevTools.HeapSnapshotModel.HeapSnapshotModel.DOMLinkState.UNKNOWN:
    default:
      return 'unknown';
  }
}

function formatSignedCount(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

function formatSignedSize(bytes: number): string {
  const formatted = formatBytesToKb(bytes);
  return bytes > 0 ? `+${formatted}` : formatted;
}
