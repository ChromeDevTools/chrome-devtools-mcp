// Copyright 2011 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../core/platform/platform.js';
import { formatterWorkerPool } from './FormatterWorkerPool.js';
function locationToPosition(lineEndings, lineNumber, columnNumber) {
    const position = lineNumber ? lineEndings[lineNumber - 1] + 1 : 0;
    return position + columnNumber;
}
function positionToLocation(lineEndings, position) {
    const lineNumber = Platform.ArrayUtilities.upperBound(lineEndings, position - 1, Platform.ArrayUtilities.DEFAULT_COMPARATOR);
    let columnNumber;
    if (!lineNumber) {
        columnNumber = position;
    }
    else {
        columnNumber = position - lineEndings[lineNumber - 1] - 1;
    }
    return [lineNumber, columnNumber];
}
export async function format(contentType, mimeType, content, indent) {
    if (contentType.isDocumentOrScriptOrStyleSheet()) {
        return await formatScriptContent(mimeType, content, indent);
    }
    return { formattedContent: content, formattedMapping: new IdentityFormatterSourceMapping() };
}
export async function formatScriptContent(mimeType, content, indent) {
    const originalContent = content.replace(/\r\n?|[\n\u2028\u2029]/g, '\n').replace(/^\uFEFF/, '');
    const pool = formatterWorkerPool();
    let formatResult = { content: originalContent, mapping: { original: [], formatted: [] } };
    try {
        formatResult = await pool.format(mimeType, originalContent, indent);
    }
    catch {
    }
    const originalContentLineEndings = Platform.StringUtilities.findLineEndingIndexes(originalContent);
    const formattedContentLineEndings = Platform.StringUtilities.findLineEndingIndexes(formatResult.content);
    const sourceMapping = new FormatterSourceMappingImpl(originalContentLineEndings, formattedContentLineEndings, formatResult.mapping);
    return { formattedContent: formatResult.content, formattedMapping: sourceMapping };
}
class IdentityFormatterSourceMapping {
    originalToFormatted(lineNumber, columnNumber = 0) {
        return [lineNumber, columnNumber];
    }
    formattedToOriginal(lineNumber, columnNumber = 0) {
        return [lineNumber, columnNumber];
    }
}
class FormatterSourceMappingImpl {
    originalLineEndings;
    formattedLineEndings;
    mapping;
    constructor(originalLineEndings, formattedLineEndings, mapping) {
        this.originalLineEndings = originalLineEndings;
        this.formattedLineEndings = formattedLineEndings;
        this.mapping = mapping;
    }
    originalToFormatted(lineNumber, columnNumber) {
        const originalPosition = locationToPosition(this.originalLineEndings, lineNumber, columnNumber || 0);
        const formattedPosition = this.convertPosition(this.mapping.original, this.mapping.formatted, originalPosition);
        return positionToLocation(this.formattedLineEndings, formattedPosition);
    }
    formattedToOriginal(lineNumber, columnNumber) {
        const formattedPosition = locationToPosition(this.formattedLineEndings, lineNumber, columnNumber || 0);
        const originalPosition = this.convertPosition(this.mapping.formatted, this.mapping.original, formattedPosition);
        return positionToLocation(this.originalLineEndings, originalPosition);
    }
    convertPosition(positions1, positions2, position) {
        const index = Platform.ArrayUtilities.upperBound(positions1, position, Platform.ArrayUtilities.DEFAULT_COMPARATOR) - 1;
        let convertedPosition = positions2[index] + position - positions1[index];
        if (index < positions2.length - 1 && convertedPosition > positions2[index + 1]) {
            convertedPosition = positions2[index + 1];
        }
        return convertedPosition;
    }
}
//# sourceMappingURL=ScriptFormatter.js.map