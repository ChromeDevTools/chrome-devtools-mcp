// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
const CALL_FRAME_REGEX = /^\s*at\s+/;
/**
 * Takes a V8 Error#stack string and extracts structured information.
 *
 * @returns Null if the provided string has an unexpected format. A
 *          populated `RawFrame[]` otherwise.
 */
export function parseRawFramesFromErrorStack(stack, resolveURL) {
    const lines = stack.split('\n');
    const firstAtLineIndex = findFramesStartLine(lines);
    const rawFrames = [];
    if (firstAtLineIndex === -1) {
        return rawFrames;
    }
    for (let i = firstAtLineIndex; i < lines.length; ++i) {
        const line = lines[i];
        const match = CALL_FRAME_REGEX.exec(line);
        if (!match) {
            if (line.trim() === '') {
                continue;
            }
            return null;
        }
        let lineContent = line.substring(match[0].length);
        let isAsync = false;
        if (lineContent.startsWith('async ')) {
            isAsync = true;
            lineContent = lineContent.substring(6);
        }
        let isConstructor = false;
        if (lineContent.startsWith('new ')) {
            isConstructor = true;
            lineContent = lineContent.substring(4);
        }
        let functionName = '';
        let url = '';
        let lineNumber = -1;
        let columnNumber = -1;
        let typeName;
        let methodName;
        let isEval = false;
        let isWasm = false;
        let wasmModuleName;
        let wasmFunctionIndex;
        let promiseIndex;
        let evalOrigin;
        const openParenIndex = lineContent.indexOf(' (');
        let location = '';
        if (lineContent.endsWith(')') && openParenIndex !== -1) {
            functionName = lineContent.substring(0, openParenIndex).trim();
            location = lineContent.substring(openParenIndex + 2, lineContent.length - 1);
        }
        else if (lineContent.startsWith('(') && lineContent.endsWith(')')) {
            location = lineContent.substring(1, lineContent.length - 1);
        }
        else {
            location = lineContent;
        }
        if (location.startsWith('eval at ')) {
            isEval = true;
            const commaIndex = location.lastIndexOf(', ');
            let evalOriginStr = location;
            if (commaIndex !== -1) {
                evalOriginStr = location.substring(0, commaIndex);
                location = location.substring(commaIndex + 2);
            }
            else {
                location = '';
            }
            if (evalOriginStr.startsWith('eval at ')) {
                evalOriginStr = evalOriginStr.substring(8);
            }
            const innerOpenParen = evalOriginStr.indexOf(' (');
            let evalFunctionName = evalOriginStr;
            let evalLocation = '';
            if (innerOpenParen !== -1) {
                evalFunctionName = evalOriginStr.substring(0, innerOpenParen).trim();
                evalLocation = evalOriginStr.substring(innerOpenParen + 2, evalOriginStr.length - 1);
                evalOrigin = parseRawFramesFromErrorStack(`    at ${evalFunctionName} (${evalLocation})`, resolveURL)?.[0];
            }
            else {
                evalOrigin = parseRawFramesFromErrorStack(`    at ${evalFunctionName}`, resolveURL)?.[0];
            }
        }
        if (location.startsWith('index ')) {
            promiseIndex = parseInt(location.substring(6), 10);
            url = '';
        }
        else if (location === '<anonymous>' || location === 'native') {
            url = '';
        }
        else if (location.includes(':wasm-function[')) {
            isWasm = true;
            const wasmMatch = /^(.*):wasm-function\[(\d+)\]:(0x[0-9a-fA-F]+)$/.exec(location);
            if (wasmMatch) {
                url = wasmMatch[1];
                wasmFunctionIndex = parseInt(wasmMatch[2], 10);
                columnNumber = parseInt(wasmMatch[3], 16);
                lineNumber = 0;
            }
        }
        else if (location) {
            const splitResult = Common.ParsedURL.ParsedURL.splitLineAndColumn(location);
            lineNumber = splitResult.lineNumber ?? -1;
            columnNumber = splitResult.columnNumber ?? -1;
            if (resolveURL && splitResult.url !== '<anonymous>' && splitResult.url !== 'native') {
                const resolved = resolveURL(splitResult.url);
                if (!resolved) {
                    return null;
                }
                url = resolved;
            }
            else {
                url = splitResult.url;
            }
        }
        // Handle "typeName.methodName [as alias]"
        if (functionName) {
            const aliasMatch = /(.*)\s+\[as\s+(.*)\]/.exec(functionName);
            if (aliasMatch) {
                methodName = aliasMatch[2];
                functionName = aliasMatch[1];
            }
            const dotIndex = functionName.indexOf('.');
            if (dotIndex !== -1) {
                typeName = functionName.substring(0, dotIndex);
                methodName = methodName ?? functionName.substring(dotIndex + 1);
            }
            if (isWasm && typeName) {
                wasmModuleName = typeName;
            }
        }
        rawFrames.push({
            url: url,
            functionName,
            lineNumber,
            columnNumber,
            isWasm,
            parsedFrameInfo: {
                isAsync,
                isConstructor,
                isEval,
                evalOrigin,
                wasmModuleName,
                wasmFunctionIndex,
                typeName,
                methodName,
                promiseIndex,
            },
        });
    }
    return rawFrames;
}
function findFramesStartLine(lines) {
    return lines.findIndex(line => CALL_FRAME_REGEX.test(line));
}
export function parseMessage(stack) {
    const lines = stack.split('\n');
    const firstAtLineIndex = findFramesStartLine(lines);
    if (firstAtLineIndex !== -1) {
        return lines.slice(0, firstAtLineIndex).join('\n');
    }
    return stack;
}
/**
 * Error#stack output only contains script URLs. In some cases we are able to
 * retrieve additional exception details from V8 that we can use to augment
 * the parsed Error#stack with script IDs.
 */
export function augmentRawFramesWithScriptIds(rawFrames, protocolStackTrace) {
    function augmentFrame(rawFrame) {
        const protocolFrame = protocolStackTrace.callFrames.find(frame => {
            return rawFrame.url === frame.url && rawFrame.lineNumber === frame.lineNumber &&
                rawFrame.columnNumber === frame.columnNumber;
        });
        if (protocolFrame) {
            // @ts-expect-error scriptId is a readonly property.
            rawFrame.scriptId = protocolFrame.scriptId;
        }
        if (rawFrame.parsedFrameInfo?.evalOrigin) {
            augmentFrame(rawFrame.parsedFrameInfo.evalOrigin);
        }
    }
    for (const rawFrame of rawFrames) {
        augmentFrame(rawFrame);
    }
}
/**
 * Combines the error description (essentially the `Error#stack` property value)
 * with the `issueSummary`.
 *
 * @param description the `description` property of the `Error` remote object.
 * @param issueSummary the optional `issueSummary` of the `exceptionMetaData`.
 * @returns the enriched description.
 * @see https://goo.gle/devtools-reduce-network-noise-design
 */
export function concatErrorDescriptionAndIssueSummary(description, issueSummary) {
    // Insert the issue summary right after the error message.
    const pos = description.indexOf('\n');
    const prefix = pos === -1 ? description : description.substring(0, pos);
    const suffix = pos === -1 ? '' : description.substring(pos);
    description = `${prefix}. ${issueSummary}${suffix}`;
    return description;
}
//# sourceMappingURL=DetailedErrorStackParser.js.map