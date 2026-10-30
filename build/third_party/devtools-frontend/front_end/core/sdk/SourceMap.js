// Copyright 2012 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
var _a;
import * as ScopesCodec from '../../third_party/source-map-scopes-codec/source-map-scopes-codec.js';
import * as Common from '../common/common.js';
import * as Platform from '../platform/platform.js';
import * as TextUtils from '../text_utils/text_utils.js';
import { scopeTreeForScript } from './ScopeTreeCache.js';
import { buildOriginalScopes, decodePastaRanges } from './SourceMapFunctionRanges.js';
import { decodeRangeMappings } from './SourceMapRangeMappings.js';
import { scriptRelativePosition, SourceMapScopesInfo, } from './SourceMapScopesInfo.js';
/**
 * Parses the {@link content} as JSON, ignoring BOM markers in the beginning, and
 * also handling the CORB bypass prefix correctly.
 *
 * @param content the string representation of a sourcemap.
 * @returns the {@link SourceMapV3} representation of the {@link content}.
 */
export function parseSourceMap(content) {
    if (content.startsWith(')]}')) {
        content = content.substring(content.indexOf('\n'));
    }
    if (content.charCodeAt(0) === 0xFEFF) {
        // Strip BOM at the beginning before parsing the JSON.
        content = content.slice(1);
    }
    return JSON.parse(content);
}
export class SourceMapEntry {
    lineNumber;
    columnNumber;
    sourceIndex;
    sourceURL;
    sourceLineNumber;
    sourceColumnNumber;
    name;
    /**
     * Whether this entry covers everything up to the following entry, mapping the generated
     * code character by character (including newlines) onto the original code.
     *
     * @see https://github.com/tc39/source-map/blob/main/proposals/range-mappings.md
     */
    isRangeMapping;
    constructor(lineNumber, columnNumber, sourceIndex, sourceURL, sourceLineNumber, sourceColumnNumber, name, isRangeMapping = false) {
        this.lineNumber = lineNumber;
        this.columnNumber = columnNumber;
        this.sourceIndex = sourceIndex;
        this.sourceURL = sourceURL;
        this.sourceLineNumber = sourceLineNumber;
        this.sourceColumnNumber = sourceColumnNumber;
        this.name = name;
        this.isRangeMapping = isRangeMapping;
    }
    static compare(entry1, entry2) {
        if (entry1.lineNumber !== entry2.lineNumber) {
            return entry1.lineNumber - entry2.lineNumber;
        }
        return entry1.columnNumber - entry2.columnNumber;
    }
}
export var SourceMapProvenance;
(function (SourceMapProvenance) {
    SourceMapProvenance["CDP"] = "cdp";
    SourceMapProvenance["EXTENSION"] = "extension";
    SourceMapProvenance["USER"] = "user";
})(SourceMapProvenance || (SourceMapProvenance = {}));
export class SourceMap {
    static retainRawSourceMaps = false;
    #json;
    #compiledURL;
    #sourceMappingURL;
    #baseURL;
    #mappings = null;
    #sourceInfos = [];
    #sourceInfoByURL = new Map();
    #script;
    #scopesInfo = null;
    #debugId;
    #scopesFallbackPromise;
    #console;
    #provenance;
    /**
     * Implements Source Map V3 model. See https://github.com/google/closure-compiler/wiki/Source-Maps
     * for format description.
     */
    constructor(compiledURL, sourceMappingURL, payload, console, script, provenance = "cdp" /* SourceMapProvenance.CDP */) {
        this.#json = payload;
        this.#script = script;
        this.#compiledURL = compiledURL;
        this.#sourceMappingURL = sourceMappingURL;
        this.#baseURL = (Common.ParsedURL.schemeIs(sourceMappingURL, 'data:')) ? compiledURL : sourceMappingURL;
        this.#debugId = 'debugId' in payload ? payload.debugId : undefined;
        this.#console = console;
        this.#provenance = provenance;
        if ('sections' in this.#json) {
            if (this.#json.sections.find(section => 'url' in section)) {
                this.#console.warn(`SourceMap "${sourceMappingURL}" contains unsupported "URL" field in one of its sections.`);
            }
        }
        this.eachSection(this.parseSources.bind(this));
    }
    provenance() {
        return this.#provenance;
    }
    json() {
        return this.#json;
    }
    augmentWithScopes(scriptUrl, ranges) {
        this.#ensureSourceMapProcessed();
        if (this.#json && this.#json.version > 3) {
            throw new Error('Only support augmenting source maps up to version 3.');
        }
        // Ensure scriptUrl is associated with sourceMap sources
        const sourceIdx = this.#sourceIndex(scriptUrl);
        if (sourceIdx >= 0) {
            if (!this.#scopesInfo || this.#scopesFallbackPromise !== undefined) {
                // First time seeing this sourcemap, create an new empty scopesInfo object.
                // Also reset the fallback scope info since the extension will provide it.
                this.#scopesInfo = new SourceMapScopesInfo(this, { scopes: [], ranges: [] });
                this.#scopesFallbackPromise = undefined;
            }
            if (!this.#scopesInfo.hasOriginalScopes(sourceIdx)) {
                const originalScopes = buildOriginalScopes(ranges);
                this.#scopesInfo.addOriginalScopesAtIndex(sourceIdx, originalScopes);
            }
        }
        else {
            throw new Error(`Could not find sourceURL ${scriptUrl} in sourceMap`);
        }
    }
    #sourceIndex(sourceURL) {
        return this.#sourceInfos.findIndex(info => info.sourceURL === sourceURL);
    }
    compiledURL() {
        return this.#compiledURL;
    }
    url() {
        return this.#sourceMappingURL;
    }
    debugId() {
        return this.#debugId ?? null;
    }
    sourceURLForSourceIndex(index) {
        return this.#sourceInfos[index]?.sourceURL;
    }
    sourceURLs() {
        return [...this.#sourceInfoByURL.keys()];
    }
    embeddedContentByURL(sourceURL) {
        const entry = this.#sourceInfoByURL.get(sourceURL);
        if (!entry) {
            return null;
        }
        return entry.content;
    }
    hasScopeInfo() {
        this.#ensureSourceMapProcessed();
        return this.#scopesInfo !== null && !this.#scopesInfo.isEmpty();
    }
    /**
     * True iff the scopes come from the source map itself (encoded `scopes`), not from the AST fallback or from an
     * extension.
     */
    hasEncodedScopeInfo() {
        this.#ensureSourceMapProcessed();
        return this.#scopesInfo !== null && this.#scopesFallbackPromise === undefined &&
            this.#scopesInfo.hasGeneratedRanges();
    }
    waitForScopeInfo() {
        this.#ensureSourceMapProcessed();
        return this.#scopesFallbackPromise ?? Promise.resolve();
    }
    findEntry(lineNumber, columnNumber) {
        this.#ensureSourceMapProcessed();
        const mappings = this.mappings();
        const index = Platform.ArrayUtilities.upperBound(mappings, undefined, (_, entry) => lineNumber - entry.lineNumber || columnNumber - entry.columnNumber);
        return index ? mappings[index - 1] : null;
    }
    /** Returns the entry at the given position but only if an entry exists for that exact position */
    findEntryExact(lineNumber, columnNumber) {
        const entry = this.findEntry(lineNumber, columnNumber);
        if (entry?.lineNumber === lineNumber && entry.columnNumber === columnNumber) {
            return entry;
        }
        return null;
    }
    findEntryRanges(lineNumber, columnNumber) {
        const mappings = this.mappings();
        const endIndex = Platform.ArrayUtilities.upperBound(mappings, undefined, (_, entry) => lineNumber - entry.lineNumber || columnNumber - entry.columnNumber);
        if (!endIndex) {
            // If the line and column are preceding all the entries, then there is nothing to map.
            return null;
        }
        // startIndex must be within mappings range because endIndex must be not falsy
        const startIndex = endIndex - 1;
        const sourceURL = mappings[startIndex].sourceURL;
        if (!sourceURL) {
            return null;
        }
        // Let us compute the range that contains the source position in the compiled code.
        const endLine = endIndex < mappings.length ? mappings[endIndex].lineNumber : 2 ** 31 - 1;
        const endColumn = endIndex < mappings.length ? mappings[endIndex].columnNumber : 2 ** 31 - 1;
        const range = new TextUtils.TextRange.TextRange(mappings[startIndex].lineNumber, mappings[startIndex].columnNumber, endLine, endColumn);
        // Now try to find the corresponding token in the original code.
        const reverseMappings = this.reversedMappings(sourceURL);
        const startSourceLine = mappings[startIndex].sourceLineNumber;
        const startSourceColumn = mappings[startIndex].sourceColumnNumber;
        const endReverseIndex = Platform.ArrayUtilities.upperBound(reverseMappings, undefined, (_, i) => startSourceLine - mappings[i].sourceLineNumber || startSourceColumn - mappings[i].sourceColumnNumber);
        if (!endReverseIndex) {
            return null;
        }
        const endSourceLine = endReverseIndex < reverseMappings.length ?
            mappings[reverseMappings[endReverseIndex]].sourceLineNumber :
            2 ** 31 - 1;
        const endSourceColumn = endReverseIndex < reverseMappings.length ?
            mappings[reverseMappings[endReverseIndex]].sourceColumnNumber :
            2 ** 31 - 1;
        const sourceRange = new TextUtils.TextRange.TextRange(startSourceLine, startSourceColumn, endSourceLine, endSourceColumn);
        return { range, sourceRange, sourceURL };
    }
    sourceLineMapping(sourceURL, lineNumber, columnNumber) {
        const mappings = this.mappings();
        const reverseMappings = this.reversedMappings(sourceURL);
        const first = Platform.ArrayUtilities.lowerBound(reverseMappings, lineNumber, lineComparator);
        const last = Platform.ArrayUtilities.upperBound(reverseMappings, lineNumber, lineComparator);
        if (first >= reverseMappings.length || mappings[reverseMappings[first]].sourceLineNumber !== lineNumber) {
            return null;
        }
        const columnMappings = reverseMappings.slice(first, last);
        if (!columnMappings.length) {
            return null;
        }
        const index = Platform.ArrayUtilities.lowerBound(columnMappings, columnNumber, (columnNumber, i) => columnNumber - mappings[i].sourceColumnNumber);
        return index >= columnMappings.length ? mappings[columnMappings[columnMappings.length - 1]] :
            mappings[columnMappings[index]];
        function lineComparator(lineNumber, i) {
            return lineNumber - mappings[i].sourceLineNumber;
        }
    }
    findReverseIndices(sourceURL, lineNumber, columnNumber) {
        const mappings = this.mappings();
        const reverseMappings = this.reversedMappings(sourceURL);
        const endIndex = Platform.ArrayUtilities.upperBound(reverseMappings, undefined, (_, i) => lineNumber - mappings[i].sourceLineNumber || columnNumber - mappings[i].sourceColumnNumber);
        let startIndex = endIndex;
        while (startIndex > 0 &&
            mappings[reverseMappings[startIndex - 1]].sourceLineNumber ===
                mappings[reverseMappings[endIndex - 1]].sourceLineNumber &&
            mappings[reverseMappings[startIndex - 1]].sourceColumnNumber ===
                mappings[reverseMappings[endIndex - 1]].sourceColumnNumber) {
            --startIndex;
        }
        return reverseMappings.slice(startIndex, endIndex);
    }
    findReverseEntries(sourceURL, lineNumber, columnNumber, filterContiguous = false) {
        const mappings = this.mappings();
        let indices = this.findReverseIndices(sourceURL, lineNumber, columnNumber);
        if (filterContiguous) {
            indices = indices.filter((index, i) => i === 0 || index !== indices[i - 1] + 1);
        }
        return indices.map(i => mappings[i]);
    }
    findReverseRanges(sourceURL, lineNumber, columnNumber) {
        const mappings = this.mappings();
        const indices = this.findReverseIndices(sourceURL, lineNumber, columnNumber);
        const ranges = [];
        for (let i = 0; i < indices.length; ++i) {
            const startIndex = indices[i];
            // Merge adjacent ranges.
            let endIndex = startIndex + 1;
            while (i + 1 < indices.length && endIndex === indices[i + 1]) {
                ++endIndex;
                ++i;
            }
            // Source maps don't contain end positions for entries, but each entry is assumed to
            // span until the following entry. This doesn't work however in case of the last
            // entry, where there's no following entry. We also don't know the number of lines
            // and columns in the original source code (which might not be available at all), so
            // for that case we store the maximum signed 32-bit integer, which is definitely going
            // to be larger than any script we can process and can safely be serialized as part of
            // the skip list we send to V8 with `Debugger.stepOver` (http://crbug.com/1305956).
            const startLine = mappings[startIndex].lineNumber;
            const startColumn = mappings[startIndex].columnNumber;
            const endLine = endIndex < mappings.length ? mappings[endIndex].lineNumber : 2 ** 31 - 1;
            const endColumn = endIndex < mappings.length ? mappings[endIndex].columnNumber : 2 ** 31 - 1;
            ranges.push(new TextUtils.TextRange.TextRange(startLine, startColumn, endLine, endColumn));
        }
        return ranges;
    }
    mappings() {
        this.#ensureSourceMapProcessed();
        return this.#mappings ?? [];
    }
    /**
     * If the source map does not contain scope information by itself (e.g. "scopes proposal"
     * or "pasta" scopes), then we'll use this getter to calculate basic function name information from
     * the AST and mappings.
     */
    async #buildScopesFallback() {
        const scopeTreeAndText = this.#script ? await scopeTreeForScript(this.#script) : null;
        if (!scopeTreeAndText) {
            return null;
        }
        const { scopeTree, text } = scopeTreeAndText;
        return SourceMapScopesInfo.createFromAst(this, scopeTree, text);
    }
    reversedMappings(sourceURL) {
        this.#ensureSourceMapProcessed();
        return this.#sourceInfoByURL.get(sourceURL)?.reverseMappings ?? [];
    }
    #ensureSourceMapProcessed() {
        if (this.#mappings === null) {
            this.#mappings = [];
            try {
                this.eachSection(this.parseMap.bind(this));
                if (!this.hasScopeInfo()) {
                    this.#scopesFallbackPromise = this.#buildScopesFallback().then(info => {
                        this.#scopesInfo = info;
                    });
                }
            }
            catch (e) {
                console.error('Failed to parse source map', e);
                this.#mappings = [];
            }
            // As per spec, mappings are not necessarily sorted.
            this.mappings().sort(SourceMapEntry.compare);
            this.#computeReverseMappings(this.#mappings);
        }
        if (!_a.retainRawSourceMaps) {
            this.#json = null;
        }
    }
    #computeReverseMappings(mappings) {
        const reverseMappingsPerUrl = new Map();
        for (let i = 0; i < mappings.length; i++) {
            const entryUrl = mappings[i]?.sourceURL;
            if (!entryUrl) {
                continue;
            }
            let reverseMap = reverseMappingsPerUrl.get(entryUrl);
            if (!reverseMap) {
                reverseMap = [];
                reverseMappingsPerUrl.set(entryUrl, reverseMap);
            }
            reverseMap.push(i);
        }
        for (const [url, reverseMap] of reverseMappingsPerUrl.entries()) {
            const info = this.#sourceInfoByURL.get(url);
            if (!info) {
                continue;
            }
            reverseMap.sort(sourceMappingComparator);
            info.reverseMappings = reverseMap;
        }
        function sourceMappingComparator(indexA, indexB) {
            const a = mappings[indexA];
            const b = mappings[indexB];
            return a.sourceLineNumber - b.sourceLineNumber || a.sourceColumnNumber - b.sourceColumnNumber ||
                a.lineNumber - b.lineNumber || a.columnNumber - b.columnNumber;
        }
    }
    eachSection(callback) {
        if (!this.#json) {
            return;
        }
        if ('sections' in this.#json) {
            let sourcesIndex = 0;
            for (const section of this.#json.sections) {
                if ('map' in section) {
                    callback(section.map, sourcesIndex, section.offset.line, section.offset.column);
                    sourcesIndex += section.map.sources.length;
                }
            }
        }
        else {
            callback(this.#json, 0, 0, 0);
        }
    }
    parseSources(sourceMap) {
        const sourceRoot = sourceMap.sourceRoot ?? '';
        const ignoreList = new Set(sourceMap.ignoreList ?? sourceMap.x_google_ignoreList);
        for (let i = 0; i < sourceMap.sources.length; ++i) {
            let href = sourceMap.sources[i];
            // The source map v3 proposal says to prepend the sourceRoot to the source URL
            // and if the resulting URL is not absolute, then resolve the source URL against
            // the source map URL. Prepending the sourceRoot (if one exists) is not likely to
            // be meaningful or useful if the source URL is already absolute though. In this
            // case, use the source URL as is without prepending the sourceRoot.
            if (Common.ParsedURL.ParsedURL.isRelativeURL(href)) {
                if (sourceRoot && !sourceRoot.endsWith('/') && href && !href.startsWith('/')) {
                    href = sourceRoot.concat('/', href);
                }
                else {
                    href = sourceRoot.concat(href);
                }
            }
            const url = Common.ParsedURL.ParsedURL.completeURL(this.#baseURL, href) || href;
            const source = sourceMap.sourcesContent?.[i];
            const sourceInfo = {
                sourceURL: url,
                content: source ?? null,
                ignoreListHint: ignoreList.has(i),
                reverseMappings: null,
            };
            this.#sourceInfos.push(sourceInfo);
            if (!this.#sourceInfoByURL.has(url)) {
                this.#sourceInfoByURL.set(url, sourceInfo);
            }
        }
    }
    parseMap(map, baseSourceIndex, baseLineNumber, baseColumnNumber) {
        let sourceIndex = baseSourceIndex;
        let lineNumber = baseLineNumber;
        let columnNumber = baseColumnNumber;
        let sourceLineNumber = 0;
        let sourceColumnNumber = 0;
        let nameIndex = 0;
        const names = map.names ?? [];
        const tokenIter = new TokenIterator(map.mappings);
        let sourceURL = this.#sourceInfos[sourceIndex]?.sourceURL;
        // For every line of this section, the index of its first entry in `mappings` and the
        // number of entries on that line. The `rangeMappings` field addresses entries by their
        // index within a line, so this is what resolves those indices below.
        const lineStarts = [];
        const lineCounts = [];
        const mappings = this.mappings();
        const pushEntry = (entry) => {
            const line = entry.lineNumber - baseLineNumber;
            if (lineCounts[line] === undefined) {
                lineStarts[line] = mappings.length;
                lineCounts[line] = 0;
            }
            lineCounts[line]++;
            mappings.push(entry);
        };
        while (true) {
            if (tokenIter.peek() === ',') {
                tokenIter.next();
            }
            else {
                while (tokenIter.peek() === ';') {
                    lineNumber += 1;
                    columnNumber = 0;
                    tokenIter.next();
                }
                if (!tokenIter.hasNext()) {
                    break;
                }
            }
            columnNumber += tokenIter.nextVLQ();
            if (!tokenIter.hasNext() || this.isSeparator(tokenIter.peek())) {
                pushEntry(new SourceMapEntry(lineNumber, columnNumber));
                continue;
            }
            const sourceIndexDelta = tokenIter.nextVLQ();
            if (sourceIndexDelta) {
                sourceIndex += sourceIndexDelta;
                sourceURL = this.#sourceInfos[sourceIndex]?.sourceURL;
            }
            sourceLineNumber += tokenIter.nextVLQ();
            sourceColumnNumber += tokenIter.nextVLQ();
            if (!tokenIter.hasNext() || this.isSeparator(tokenIter.peek())) {
                pushEntry(new SourceMapEntry(lineNumber, columnNumber, sourceIndex, sourceURL, sourceLineNumber, sourceColumnNumber));
                continue;
            }
            nameIndex += tokenIter.nextVLQ();
            pushEntry(new SourceMapEntry(lineNumber, columnNumber, sourceIndex, sourceURL, sourceLineNumber, sourceColumnNumber, names[nameIndex]));
        }
        this.#markRangeMappings(map, lineStarts, lineCounts);
        if (!this.#scopesInfo) {
            this.#scopesInfo = new SourceMapScopesInfo(this, { scopes: [], ranges: [] });
        }
        if (map.scopes || map.ranges) {
            const { scopes, ranges } = ScopesCodec.decode(map, { mode: 2 /* ScopesCodec.DecodeMode.LAX */, generatedOffset: { line: baseLineNumber, column: baseColumnNumber } });
            this.#scopesInfo.addOriginalScopes(scopes.length ? scopes : new Array(map.sources.length).fill(null));
            this.#scopesInfo.addGeneratedRanges(ranges);
        }
        else if (map.x_com_bloomberg_sourcesFunctionMappings) {
            const originalScopes = this.parseBloombergScopes(map);
            this.#scopesInfo.addOriginalScopes(originalScopes);
        }
        else {
            // Keep the OriginalScope[] tree array consistent with sources.
            this.#scopesInfo.addOriginalScopes(new Array(map.sources.length).fill(null));
        }
    }
    /**
     * Marks the entries of the section that was just parsed which the `rangeMappings` field of
     * that section points at.
     *
     * A malformed field never invalidates the SourceMap: a field that can't be decoded is
     * ignored altogether, and indices that don't point at a mapping with an original position
     * are skipped.
     *
     * @param lineStarts index in `mappings` of the first entry of each line of the section.
     * @param lineCounts number of entries on each line of the section.
     */
    #markRangeMappings(map, lineStarts, lineCounts) {
        if (typeof map.rangeMappings !== 'string') {
            return;
        }
        let rangeMappings;
        try {
            rangeMappings = decodeRangeMappings(map.rangeMappings);
        }
        catch {
            return;
        }
        const mappings = this.mappings();
        for (let line = 0; line < rangeMappings.length; ++line) {
            for (const index of rangeMappings[line]) {
                if (index >= (lineCounts[line] ?? 0)) {
                    // The indices are sorted, so the rest of the line is out of bounds as well.
                    break;
                }
                const mappingIndex = lineStarts[line] + index;
                if (mappings[mappingIndex].sourceURL === undefined) {
                    continue;
                }
                mappings[mappingIndex] = asRangeMapping(mappings[mappingIndex]);
            }
        }
    }
    parseBloombergScopes(map) {
        const scopeList = map.x_com_bloomberg_sourcesFunctionMappings;
        if (!scopeList) {
            throw new Error('Cant decode pasta scopes without x_com_bloomberg_sourcesFunctionMappings field');
        }
        else if (scopeList.length !== map.sources.length) {
            throw new Error(`x_com_bloomberg_sourcesFunctionMappings must have ${map.sources.length} scope trees`);
        }
        const names = map.names ?? [];
        return scopeList.map(rawScopes => {
            if (!rawScopes) {
                return null;
            }
            const ranges = decodePastaRanges(rawScopes, names);
            return buildOriginalScopes(ranges);
        });
    }
    isSeparator(char) {
        return char === ',' || char === ';';
    }
    /**
     * Finds all the reverse mappings that intersect with the given `textRange` within the
     * source entity identified by the `url`. If the `url` does not have any reverse mappings
     * within this source map, an empty array is returned.
     *
     * @param url the URL of the source entity to query.
     * @param textRange the range of text within the entity to check, considered `[start,end[`.
     * @returns the list of ranges in the generated file that map to locations overlapping the
     *          {@link textRange} in the source file identified by the {@link url}, or `[]`
     *          if the {@link url} does not identify an entity in this source map.
     */
    reverseMapTextRanges(url, textRange) {
        const reverseMappings = this.reversedMappings(url);
        const mappings = this.mappings();
        if (reverseMappings.length === 0) {
            return [];
        }
        // Determine the first reverse mapping that contains the starting point of the `textRange`.
        let startReverseIndex = Platform.ArrayUtilities.lowerBound(reverseMappings, textRange, ({ startLine, startColumn }, index) => {
            const { sourceLineNumber, sourceColumnNumber } = mappings[index];
            return startLine - sourceLineNumber || startColumn - sourceColumnNumber;
        });
        // Check if the current mapping does not start on the exact start of the `textRange`, and if
        // so we know that a previous mapping entry (if any) would also overlap. If we reach the end
        // of the reverse mappings table, we just take the last entry and report that.
        while (startReverseIndex === reverseMappings.length ||
            startReverseIndex > 0 &&
                (mappings[reverseMappings[startReverseIndex]].sourceLineNumber > textRange.startLine ||
                    mappings[reverseMappings[startReverseIndex]].sourceColumnNumber > textRange.startColumn)) {
            startReverseIndex--;
        }
        // Determine the last reverse mapping that contains the end point of the `textRange`.
        let endReverseIndex = startReverseIndex + 1;
        for (; endReverseIndex < reverseMappings.length; ++endReverseIndex) {
            const { sourceLineNumber, sourceColumnNumber } = mappings[reverseMappings[endReverseIndex]];
            if (sourceLineNumber < textRange.endLine ||
                (sourceLineNumber === textRange.endLine && sourceColumnNumber < textRange.endColumn)) {
                continue;
            }
            break;
        }
        // Create the ranges...
        const ranges = [];
        for (let reverseIndex = startReverseIndex; reverseIndex < endReverseIndex; ++reverseIndex) {
            const startIndex = reverseMappings[reverseIndex], endIndex = startIndex + 1;
            const range = TextUtils.TextRange.TextRange.createUnboundedFromLocation(mappings[startIndex].lineNumber, mappings[startIndex].columnNumber);
            if (endIndex < mappings.length) {
                range.endLine = mappings[endIndex].lineNumber;
                range.endColumn = mappings[endIndex].columnNumber;
            }
            ranges.push(range);
        }
        // ...sort them...
        ranges.sort(TextUtils.TextRange.TextRange.comparator);
        // ...and ensure they are maximally merged.
        let j = 0;
        for (let i = 1; i < ranges.length; ++i) {
            if (ranges[j].immediatelyPrecedes(ranges[i])) {
                ranges[j].endLine = ranges[i].endLine;
                ranges[j].endColumn = ranges[i].endColumn;
            }
            else {
                ranges[++j] = ranges[i];
            }
        }
        ranges.length = j + 1;
        return ranges;
    }
    mapsOrigin() {
        const mappings = this.mappings();
        if (mappings.length > 0) {
            const firstEntry = mappings[0];
            return firstEntry?.lineNumber === 0 || firstEntry.columnNumber === 0;
        }
        return false;
    }
    hasIgnoreListHint(sourceURL) {
        return this.#sourceInfoByURL.get(sourceURL)?.ignoreListHint ?? false;
    }
    /**
     * Returns a list of ranges in the generated script for original sources that
     * match a predicate. Each range is a [begin, end) pair, meaning that code at
     * the beginning location, up to but not including the end location, matches
     * the predicate.
     */
    findRanges(predicate, options) {
        const mappings = this.mappings();
        const ranges = [];
        if (!mappings.length) {
            return [];
        }
        let current = null;
        // If the first mapping isn't at the beginning of the original source, it's
        // up to the caller to decide if it should be considered matching the
        // predicate or not. By default, it's not.
        if ((mappings[0].lineNumber !== 0 || mappings[0].columnNumber !== 0) && options?.isStartMatching) {
            current = TextUtils.TextRange.TextRange.createUnboundedFromLocation(0, 0);
            ranges.push(current);
        }
        for (const { sourceURL, lineNumber, columnNumber } of mappings) {
            const ignoreListHint = sourceURL && predicate(sourceURL);
            if (!current && ignoreListHint) {
                current = TextUtils.TextRange.TextRange.createUnboundedFromLocation(lineNumber, columnNumber);
                ranges.push(current);
                continue;
            }
            if (current && !ignoreListHint) {
                current.endLine = lineNumber;
                current.endColumn = columnNumber;
                current = null;
            }
        }
        return ranges;
    }
    /**
     * Determines whether this and the {@link other} `SourceMap` agree on content and ignore-list hint
     * with respect to the {@link sourceURL}.
     *
     * @param sourceURL the URL to test for (might not be provided by either of the sourcemaps).
     * @param other the other `SourceMap` to check.
     * @returns `true` if both this and the {@link other} `SourceMap` either both have the ignore-list
     *          hint for {@link sourceURL} or neither, and if both of them either provide the same
     *          content for the {@link sourceURL} inline or both provide no `sourcesContent` entry
     *          for it.
     */
    compatibleForURL(sourceURL, other) {
        return this.embeddedContentByURL(sourceURL) === other.embeddedContentByURL(sourceURL) &&
            this.hasIgnoreListHint(sourceURL) === other.hasIgnoreListHint(sourceURL);
    }
    resolveScopeChain(frame) {
        this.#ensureSourceMapProcessed();
        if (this.#provenance === "user" /* SourceMapProvenance.USER */ || !this.#scopesInfo?.hasVariablesAndBindings()) {
            return null;
        }
        return this.#scopesInfo.resolveMappedScopeChain(frame);
    }
    resolveMappedVariablesAtPosition(location, ignoreInnerBlockScopes = false) {
        this.#ensureSourceMapProcessed();
        if (this.#provenance === "user" /* SourceMapProvenance.USER */ || !this.#scopesInfo?.hasVariablesAndBindings()) {
            return null;
        }
        const { line, column } = scriptRelativePosition(location);
        return this.#scopesInfo.resolveMappedVariablesAtPosition(line, column, ignoreInnerBlockScopes, location.inlineFrameIndex);
    }
    findOriginalFunctionName(position) {
        this.#ensureSourceMapProcessed();
        return this.#scopesInfo?.findOriginalFunctionName(position) ?? null;
    }
    findOriginalFunctionScope(position) {
        this.#ensureSourceMapProcessed();
        return this.#scopesInfo?.findOriginalFunctionScope(position) ?? null;
    }
    /** See {@link SourceMapScopesInfo.translateRawFrame}. `null` if no scopes information is available. */
    translateRawFrame(generatedLine, generatedColumn) {
        this.#ensureSourceMapProcessed();
        return this.#scopesInfo?.translateRawFrame(generatedLine, generatedColumn) ?? null;
    }
    /** See {@link SourceMapScopesInfo.inlinedFunctionRange}. `null` without encoded scopes. */
    inlinedFunctionRange(generatedLine, generatedColumn) {
        return this.hasEncodedScopeInfo() ? this.#scopesInfo?.inlinedFunctionRange(generatedLine, generatedColumn) ?? null :
            null;
    }
    /** See {@link SourceMapScopesInfo.inlinedCalleeRanges}. Empty without encoded scopes. */
    inlinedCalleeRanges(generatedLine, generatedColumn) {
        return this.hasEncodedScopeInfo() ? this.#scopesInfo?.inlinedCalleeRanges(generatedLine, generatedColumn) ?? [] :
            [];
    }
    /** See {@link SourceMapScopesInfo.outlinedFunctionRanges}. Empty without encoded scopes. */
    outlinedFunctionRanges(generatedLine, generatedColumn) {
        return this.hasEncodedScopeInfo() ? this.#scopesInfo?.outlinedFunctionRanges(generatedLine, generatedColumn) ?? [] :
            [];
    }
    /** See {@link SourceMapScopesInfo.artificialFunctionRanges}. Empty without encoded scopes. */
    artificialFunctionRanges() {
        return this.hasEncodedScopeInfo() ? this.#scopesInfo?.artificialFunctionRanges() ?? [] : [];
    }
}
_a = SourceMap;
/** @returns a copy of the {@link entry} that is marked as a range mapping. */
function asRangeMapping(entry) {
    return new SourceMapEntry(entry.lineNumber, entry.columnNumber, entry.sourceIndex, entry.sourceURL, entry.sourceLineNumber, entry.sourceColumnNumber, entry.name, true);
}
const VLQ_BASE_SHIFT = 5;
const VLQ_BASE_MASK = (1 << 5) - 1;
const VLQ_CONTINUATION_MASK = 1 << 5;
/** The largest shift an unsigned VLQ digit may contribute at while still fitting into 32 bits. */
const VLQ_UNSIGNED_MAX_SHIFT = 30;
export class TokenIterator {
    #string;
    #position;
    constructor(string) {
        this.#string = string;
        this.#position = 0;
    }
    next() {
        return this.#string.charAt(this.#position++);
    }
    /** Returns the unicode value of the next character and advances the iterator  */
    nextCharCode() {
        return this.#string.charCodeAt(this.#position++);
    }
    peek() {
        return this.#string.charAt(this.#position);
    }
    hasNext() {
        return this.#position < this.#string.length;
    }
    nextVLQ() {
        // Read unsigned value.
        let result = this.#decodeVLQ(false);
        // Fix the sign.
        const negative = result & 1;
        result >>= 1;
        return negative ? -result : result;
    }
    /**
     * Decodes an unsigned Base64 VLQ number, as used by the `rangeMappings` field of the
     * "range mappings" proposal. In contrast to {@link nextVLQ} the least significant bit
     * carries a value rather than a sign, so the full 32 bit range is available. Numbers
     * that don't fit into 32 bits are rejected.
     *
     * @see https://github.com/tc39/source-map/blob/main/proposals/range-mappings.md
     */
    nextUnsignedVLQ() {
        return this.#decodeVLQ(true);
    }
    #decodeVLQ(unsigned) {
        let result = 0;
        let shift = 0;
        let digit = VLQ_CONTINUATION_MASK;
        while (digit & VLQ_CONTINUATION_MASK) {
            if (!this.hasNext()) {
                throw new Error('Unexpected end of input while decoding VLQ number!');
            }
            if (unsigned && shift > VLQ_UNSIGNED_MAX_SHIFT) {
                throw new Error('Unsigned VLQ number does not fit into 32 bits!');
            }
            const charCode = this.nextCharCode();
            digit = Common.Base64.BASE64_CODES[charCode];
            if (charCode !== 65 /* 'A' */ && digit === 0) {
                throw new Error(`Unexpected char '${String.fromCharCode(charCode)}' encountered while decoding`);
            }
            // Unsigned numbers may use the full 32 bits, where `<<` would sign extend.
            result += unsigned ? (digit & VLQ_BASE_MASK) * 2 ** shift : (digit & VLQ_BASE_MASK) << shift;
            shift += VLQ_BASE_SHIFT;
        }
        if (unsigned && result > 0xFFFFFFFF) {
            throw new Error('Unsigned VLQ number does not fit into 32 bits!');
        }
        return result;
    }
    /**
     * @returns the next VLQ number without iterating further. Or returns null if
     * the iterator is at the end or it's not a valid number.
     */
    peekVLQ() {
        const pos = this.#position;
        try {
            return this.nextVLQ();
        }
        catch {
            return null;
        }
        finally {
            this.#position = pos; // Reset the iterator.
        }
    }
}
//# sourceMappingURL=SourceMap.js.map