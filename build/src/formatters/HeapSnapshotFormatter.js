/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { DevTools } from '../third_party/index.js';
const { formatBytesToKb } = DevTools.I18n.ByteUtilities;
export const MAX_NAME_LENGTH = 100;
/**
 * Renders a name for single-line output: the name is truncated to
 * `maxNameLength` and line breaks are always escaped.
 */
export function formatName(name, options) {
    return truncateValue(name, options.maxNameLength)
        .replaceAll('\r', '\\r')
        .replaceAll('\n', '\\n');
}
/**
 * Truncates `value` to `maxLength`, appending an ellipsis if it was cut off.
 */
function truncateValue(value, maxLength = MAX_NAME_LENGTH) {
    if (value.length <= maxLength) {
        return value;
    }
    return value.slice(0, maxLength) + '...';
}
/**
 * Flattens the analysis into the contexts matching `options`, ranked descending
 * by their dead-field retained-size score across all scopes.
 */
export function collectRankedContexts(analysis, options = {}) {
    const { min = 0, max } = options.retainedSize ?? {};
    const contexts = [];
    for (const scope of analysis.scopes) {
        if (options.scopeInfoNodeId !== undefined &&
            scope.scopeInfoNodeId !== options.scopeInfoNodeId) {
            continue;
        }
        for (const context of scope.contexts) {
            const score = context.deadFieldsRetainedSizeSum;
            if (score < min || (max !== undefined && score > max)) {
                continue;
            }
            contexts.push({ scope, context });
        }
    }
    contexts.sort((left, right) => right.context.deadFieldsRetainedSizeSum -
        left.context.deadFieldsRetainedSizeSum);
    return contexts;
}
export function isNodeLike(item) {
    return (typeof item === 'object' && item !== null && 'id' in item && 'name' in item);
}
export function isEdgeLike(item) {
    return (typeof item === 'object' &&
        item !== null &&
        'name' in item &&
        'node' in item &&
        'type' in item &&
        typeof item.node === 'object' &&
        item.node !== null &&
        'id' in item.node &&
        'name' in item.node);
}
export class HeapSnapshotFormatter {
    static formatNodes(items, options) {
        const lines = [];
        if (items.length > 0) {
            const firstItem = items[0];
            if (isNodeLike(firstItem)) {
                lines.push('nodeId,nodeName,type,distance,selfSize,retainedSize');
            }
            else if (isEdgeLike(firstItem)) {
                lines.push('name,type,nodeId,nodeName,selfSize,retainedSize');
            }
        }
        for (const item of items) {
            if (isNodeLike(item)) {
                lines.push(`${item.id},${formatName(item.name, options)},${item.type},${item.distance},${formatBytesToKb(item.selfSize)},${formatBytesToKb(item.retainedSize)}`);
            }
            else if (isEdgeLike(item)) {
                lines.push(`${formatName(item.name, options)},${item.type},${item.node.id},${formatName(item.node.name, options)},${formatBytesToKb(item.node.selfSize)},${formatBytesToKb(item.node.retainedSize)}`);
            }
        }
        return lines.join('\n');
    }
    static formatRetainingPaths(retainingPaths, options) {
        const lines = [];
        function formatEdge(edge, depth) {
            const indent = '  '.repeat(depth);
            lines.push(`${indent}<- @${edge.nodeId} ${formatName(edge.nodeName, options)} via ${edge.edgeType} ${formatName(edge.edgeName, options)} (distance: ${edge.distance})`);
            for (const child of edge.children) {
                formatEdge(child, depth + 1);
            }
        }
        for (const path of retainingPaths) {
            formatEdge(path, 0);
        }
        return lines.join('\n');
    }
    static formatDominators(dominators, options) {
        const lines = [];
        lines.push('nodeId,nodeName,selfSize,retainedSize');
        for (const node of dominators) {
            lines.push(`${node.nodeId},${formatName(node.nodeName, options)},${formatBytesToKb(node.selfSize)},${formatBytesToKb(node.retainedSize)}`);
        }
        return lines.join('\n');
    }
    static formatDuplicateStrings(groups, options) {
        const lines = [];
        lines.push('value,count,totalSelfSize,totalRetainedSize,truncated,nodeIds');
        for (const group of groups) {
            const nodeIds = group.nodes.map(n => `@${n.id}`).join(' ');
            const truncated = group.truncated ?? false;
            const displayValue = truncateValue(group.value, options.maxNameLength);
            lines.push(`${JSON.stringify(displayValue)},${group.count},${formatBytesToKb(group.totalSelfSize)},${formatBytesToKb(group.totalRetainedSize)},${truncated},${nodeIds}`);
        }
        return lines.join('\n');
    }
    static formatNativeContextSizes(sizes, options) {
        const lines = [];
        lines.push('nodeId,nodeName,selfSize,retainedSize,attributedSize');
        const sortedContexts = [...sizes.nativeContexts].sort((a, b) => b.attributedSize - a.attributedSize);
        for (const nc of sortedContexts) {
            lines.push(`${nc.nodeId},${formatName(nc.nodeName, options)},${formatBytesToKb(nc.selfSize)},${formatBytesToKb(nc.retainedSize)},${formatBytesToKb(nc.attributedSize)}`);
        }
        lines.push(`Shared Size: ${formatBytesToKb(sizes.sharedSize)}`);
        lines.push(`Unattributed Size: ${formatBytesToKb(sizes.noAttributionSize)}`);
        return lines.join('\n');
    }
    static formatRetainedByContextSummary(summary) {
        const lines = [];
        lines.push(`Context count: ${summary.contextCount}`);
        lines.push(`Retained by context size: ${formatBytesToKb(summary.retainedByContextSize)} (${summary.retainedByContextCount} objects)`);
        lines.push(`Not retained by context size: ${formatBytesToKb(summary.notRetainedByContextSize)} (${summary.notRetainedByContextCount} objects)`);
        lines.push(`Total size: ${formatBytesToKb(summary.totalSize)}`);
        return lines.join('\n');
    }
    static formatAggregates(aggregates, options) {
        const lines = [];
        lines.push('id,className,count,selfSize,retainedSize');
        for (const info of aggregates) {
            lines.push(`${info.id},${formatName(info.className, options)},${info.count},${formatBytesToKb(info.selfSize)},${formatBytesToKb(info.retainedSize)}`);
        }
        return lines.join('\n');
    }
    static formatDiffSummary(diffs, options) {
        const lines = [];
        lines.push('index,className,addedCount,removedCount,countDelta,addedSize,removedSize,sizeDelta');
        for (const diff of diffs) {
            lines.push(`${diff.index},${formatName(diff.className, options)},${diff.addedCount},${diff.removedCount},${diff.countDelta},${formatBytesToKb(diff.addedSize)},${formatBytesToKb(diff.removedSize)},${formatBytesToKb(diff.sizeDelta)}`);
        }
        return lines.join('\n');
    }
    static formatDiffTotals(totals) {
        return `Total: # new: ${totals.addedCount}, # deleted: ${totals.removedCount}, # delta: ${formatSignedCount(totals.countDelta)}, alloc size: ${formatSignedSize(totals.addedSize)}, freed size: ${formatSignedSize(totals.removedSize)}, size delta: ${formatSignedSize(totals.sizeDelta)}`;
    }
    static formatDiffDetails(diff, options) {
        const lines = [];
        lines.push(`${formatName(diff.className, options)}: # new: ${diff.addedCount}, # deleted: ${diff.removedCount}, # delta: ${formatSignedCount(diff.countDelta)}, alloc size: ${formatSignedSize(diff.addedSize)}, freed size: ${formatSignedSize(diff.removedSize)}, size delta: ${formatSignedSize(diff.sizeDelta)}`);
        const addedIds = diff.addedIds;
        const addedSelfSizes = diff.addedSelfSizes;
        const deletedIds = diff.deletedIds;
        const deletedSelfSizes = diff.deletedSelfSizes;
        lines.push(`Objects:`);
        for (let i = 0; i < addedIds.length; i++) {
            lines.push(`  + @${addedIds[i]} (self_size: ${formatBytesToKb(addedSelfSizes[i])})`);
        }
        for (let i = 0; i < deletedIds.length; i++) {
            lines.push(`  - @${deletedIds[i]} (self_size: ${formatBytesToKb(deletedSelfSizes[i])})`);
        }
        return lines.join('\n');
    }
    static formatObjectInfo(info, options) {
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
    static formatContextAnalysis(report, options) {
        const lines = [];
        if (report.contexts.length === 0) {
            lines.push('No live contexts with dead fields were found.');
        }
        for (const { scope, context } of report.contexts) {
            if (lines.length > 0) {
                lines.push('');
            }
            lines.push(`#### Context @${context.contextNodeId} in \`${formatScopeName(scope, options)}\` — ${formatBytesToKb(context.deadFieldsRetainedSizeSum)}`, `Script @${scope.scriptNodeId}, ScopeInfo @${scope.scopeInfoNodeId}, offsets ${scope.scopeStart}-${scope.scopeEnd}, ${formatCount(scope.contextFieldCount, 'context field')}`);
            for (const field of context.deadFields) {
                lines.push(`- \`${formatName(field.name, options)}\` (${formatName(field.valueName, options)} @${field.valueNodeId}) — ${formatBytesToKb(field.retainedSize)}`);
            }
        }
        if (report.scriptsWithoutScopes.length > 0) {
            lines.push('', 'Scripts without scope metadata could not be analyzed:');
            for (const script of report.scriptsWithoutScopes) {
                const scriptName = script.scriptName
                    ? formatName(script.scriptName, options)
                    : `script @${script.scriptNodeId}`;
                lines.push(`- \`${scriptName}\` (@${script.scriptNodeId}) — ${formatCount(script.contextCount, 'context')}`);
            }
        }
        return lines.join('\n');
    }
}
function formatCount(count, singular) {
    return `${count} ${singular}${count === 1 ? '' : 's'}`;
}
function formatScopeName(scope, options) {
    const scriptName = scope.scriptName
        ? formatName(scope.scriptName, options)
        : `script @${scope.scriptNodeId}`;
    return scope.scopeName
        ? `${formatName(scope.scopeName, options)} (${scriptName})`
        : scriptName;
}
function formatDOMLinkState(state) {
    switch (state) {
        case 1 /* DevTools.HeapSnapshotModel.HeapSnapshotModel.DOMLinkState.ATTACHED */:
            return 'attached';
        case 2 /* DevTools.HeapSnapshotModel.HeapSnapshotModel.DOMLinkState.DETACHED */:
            return 'detached';
        case 0 /* DevTools.HeapSnapshotModel.HeapSnapshotModel.DOMLinkState.UNKNOWN */:
        default:
            return 'unknown';
    }
}
function formatSignedCount(n) {
    return n > 0 ? `+${n}` : `${n}`;
}
function formatSignedSize(bytes) {
    const formatted = formatBytesToKb(bytes);
    return bytes > 0 ? `+${formatted}` : formatted;
}
//# sourceMappingURL=HeapSnapshotFormatter.js.map