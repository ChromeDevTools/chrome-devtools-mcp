// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as SDK from '../../core/sdk/sdk.js';
import * as TextUtils from '../../core/text_utils/text_utils.js';
import * as Bindings from '../bindings/bindings.js';
import * as Formatter from '../formatter/formatter.js';
import * as Workspace from '../workspace/workspace.js';
const inputCache = new WeakMap();
async function prepareInput(uiSourceCode, content) {
    const formattedContent = await format(uiSourceCode, content);
    const text = new TextUtils.Text.Text(formattedContent ? formattedContent.formattedContent : content);
    let performanceData = uiSourceCode.getDecorationData("performance" /* Workspace.UISourceCode.DecoratorType.PERFORMANCE */);
    // Map profile data to the formatted view of the text.
    if (formattedContent && performanceData) {
        performanceData = Workspace.UISourceCode.createMappedProfileData(performanceData, (line, column) => {
            return formattedContent.formattedMapping.originalToFormatted(line, column);
        });
    }
    return { text, formattedContent, performanceData };
}
/** Formatting and parsing line endings for Text is expensive, so cache it. */
async function prepareInputAndCache(uiSourceCode, content) {
    let cachedPromise = inputCache.get(uiSourceCode);
    if (cachedPromise) {
        return await cachedPromise;
    }
    cachedPromise = prepareInput(uiSourceCode, content);
    inputCache.set(uiSourceCode, cachedPromise);
    return await cachedPromise;
}
function extractPerformanceDataByLine(textRange, performanceData) {
    const { startLine, startColumn, endLine, endColumn } = textRange;
    const byLine = new Array(endLine - startLine + 1).fill(0);
    for (let line = startLine; line <= endLine; line++) {
        const lineData = performanceData.get(line + 1);
        if (!lineData) {
            continue;
        }
        // Fast-path for when the entire line's data is relevant.
        if (line !== startLine && line !== endLine) {
            byLine[line - startLine] = lineData.values().reduce((acc, cur) => acc + cur);
            continue;
        }
        const column0 = line === startLine ? startColumn + 1 : 0;
        const column1 = line === endLine ? endColumn + 1 : Number.POSITIVE_INFINITY;
        let totalData = 0;
        for (const [column, data] of lineData) {
            if (column >= column0 && column <= column1) {
                totalData += data;
            }
        }
        byLine[line - startLine] = totalData;
    }
    return byLine.map(data => Math.round(data * 10) / 10);
}
function createFunctionCode(inputData, functionBounds, options) {
    let { startLine, startColumn, endLine, endColumn } = functionBounds.range;
    if (inputData.formattedContent) {
        const startMapped = inputData.formattedContent.formattedMapping.originalToFormatted(startLine, startColumn);
        startLine = startMapped[0];
        startColumn = startMapped[1];
        const endMapped = inputData.formattedContent.formattedMapping.originalToFormatted(endLine, endColumn);
        endLine = endMapped[0];
        endColumn = endMapped[1];
    }
    const text = inputData.text;
    const content = text.value();
    // Define two ranges - the first is just the function bounds, the second includes
    // that plus some surrounding context as dictated by the options.
    const range = new TextUtils.TextRange.TextRange(startLine, startColumn, endLine, endColumn);
    const functionStartOffset = text.offsetFromPosition(startLine, startColumn);
    const functionEndOffset = text.offsetFromPosition(endLine, endColumn);
    let contextStartOffset = 0;
    if (options?.contextLength !== undefined) {
        const contextLength = options.contextLength;
        contextStartOffset = Math.max(contextStartOffset, functionStartOffset - contextLength);
    }
    if (options?.contextLineLength !== undefined) {
        const contextLineLength = options.contextLineLength;
        const position = text.offsetFromPosition(Math.max(startLine - contextLineLength, 0), 0);
        contextStartOffset = Math.max(contextStartOffset, position);
    }
    let contextEndOffset = content.length;
    if (options?.contextLength !== undefined) {
        const contextLength = options.contextLength;
        contextEndOffset = Math.min(contextEndOffset, functionEndOffset + contextLength);
    }
    if (options?.contextLineLength !== undefined) {
        const contextLineLength = options.contextLineLength;
        const position = text.offsetFromPosition(Math.min(endLine + contextLineLength, text.lineCount() - 1), Number.POSITIVE_INFINITY);
        contextEndOffset = Math.min(contextEndOffset, position);
    }
    const contextStart = text.positionFromOffset(contextStartOffset);
    const contextEnd = text.positionFromOffset(contextEndOffset);
    const rangeWithContext = new TextUtils.TextRange.TextRange(contextStart.lineNumber, contextStart.columnNumber, contextEnd.lineNumber, contextEnd.columnNumber);
    // Grab substrings for the function range, and for the context range.
    const code = content.substring(functionStartOffset, functionEndOffset);
    const before = content.substring(contextStartOffset, functionStartOffset);
    const after = content.substring(functionEndOffset, contextEndOffset);
    let codeWithContext;
    if (options?.appendProfileData && inputData.performanceData) {
        const performanceDataByLine = extractPerformanceDataByLine(range, inputData.performanceData);
        const lines = performanceDataByLine.map((data, i) => {
            let line = text.lineAt(startLine + i);
            const isLastLine = i === performanceDataByLine.length - 1;
            if (i === 0) {
                if (isLastLine) {
                    line = line.substring(startColumn, endColumn);
                }
                else {
                    line = line.substring(startColumn);
                }
            }
            else if (isLastLine) {
                line = line.substring(0, endColumn);
            }
            if (isLastLine) {
                // Don't ever annotate the last line - it could make the rest of the code on
                // that line get commented out.
                data = 0;
            }
            return data ? `${line} // ${data} ms` : line;
        });
        const annotatedCode = lines.join('\n');
        codeWithContext = before + `<FUNCTION_START>${annotatedCode}<FUNCTION_END>` + after;
    }
    else {
        codeWithContext = before + `<FUNCTION_START>${code}<FUNCTION_END>` + after;
    }
    return {
        functionBounds,
        text,
        code,
        range,
        codeWithContext,
        rangeWithContext,
    };
}
/**
 * Resolves the function code and its surrounding context for a given location.
 *
 * The input location (line, column) may be either an authored (source-mapped)
 * location or a raw location. The function will attempt to resolve it to a
 * raw location regardless. This is necessary because callers (such as AI
 * assistance) may work with either format.
 *
 * We filter projects by `target` to prevent cross-origin leaks.
 */
export async function getFunctionCodeFromLocation(target, url, line, column, debuggerWorkspaceBinding, options) {
    const debuggerModel = target.model(SDK.DebuggerModel.DebuggerModel);
    if (!debuggerModel) {
        throw new Error('missing debugger model');
    }
    let uiSourceCode = null;
    const projects = debuggerWorkspaceBinding.workspace.projectsForType(Workspace.Workspace.projectTypes.Network);
    for (const project of projects) {
        if (Bindings.NetworkProject.NetworkProject.getTargetForProject(project) !== target) {
            continue;
        }
        uiSourceCode = project.uiSourceCodeForURL(url);
        if (uiSourceCode) {
            break;
        }
    }
    if (!uiSourceCode) {
        return null;
    }
    const rawLocations = await debuggerWorkspaceBinding.uiLocationToRawLocations(uiSourceCode, line, column);
    const rawLocation = rawLocations.at(-1);
    if (!rawLocation) {
        return null;
    }
    return await getFunctionCodeFromRawLocation(rawLocation, debuggerWorkspaceBinding, options);
}
async function format(uiSourceCode, content) {
    const contentType = uiSourceCode.contentType();
    const shouldFormat = !contentType.isFromSourceMap() && (contentType.isDocument() || contentType.isScript()) &&
        TextUtils.TextUtils.isMinified(content);
    if (!shouldFormat) {
        return null;
    }
    return await Formatter.ScriptFormatter.formatScriptContent(contentType.canonicalMimeType(), content, '\t');
}
/**
 * Returns a {@link FunctionCode} for the given raw location.
 */
export async function getFunctionCodeFromRawLocation(rawLocation, debuggerWorkspaceBinding, options) {
    const functionBounds = await debuggerWorkspaceBinding.functionBoundsAtRawLocation(rawLocation);
    if (!functionBounds) {
        return null;
    }
    await functionBounds.uiSourceCode.requestContentData();
    const content = functionBounds.uiSourceCode.content();
    if (!content) {
        return null;
    }
    const inputData = await prepareInputAndCache(functionBounds.uiSourceCode, content);
    return createFunctionCode(inputData, functionBounds, options);
}
//# sourceMappingURL=FunctionCodeResolver.js.map