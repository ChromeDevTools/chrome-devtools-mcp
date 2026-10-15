// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as CodeMirror from '../../third_party/codemirror.next/codemirror.next.js';
import { TextMatcher } from './CSSPropertyParserMatchers.js';
const globalValues = new Set(['inherit', 'initial', 'unset']);
const tagRegexp = /[\x20-\x7E]{4}/;
const numRegexp = /[+-]?(?:\d*\.)?\d+(?:[eE]\d+)?/;
const fontVariationSettingsRegexp = new RegExp(`(?:'(${tagRegexp.source})')|(?:"(${tagRegexp.source})")\\s+(${numRegexp.source})`);
/**
 * Extracts information about font variation settings assuming
 * value is valid according to the spec: https://drafts.csswg.org/css-fonts-4/#font-variation-settings-def
 */
export function parseFontVariationSettings(value) {
    if (globalValues.has(value.trim()) || value.trim() === 'normal') {
        return [];
    }
    const results = [];
    for (const setting of splitByComma(stripComments(value))) {
        const match = setting.match(fontVariationSettingsRegexp);
        if (match) {
            results.push({
                tag: match[1] || match[2],
                value: parseFloat(match[3]),
            });
        }
    }
    return results;
}
// "str" or 'str'
const fontFamilyRegexp = /^"(.+)"|'(.+)'$/;
/**
 * Extracts font families assuming the value is valid according to
 * the spec: https://drafts.csswg.org/css-fonts-4/#font-family-prop
 */
export function parseFontFamily(value) {
    if (globalValues.has(value.trim())) {
        return [];
    }
    const results = [];
    for (const family of splitByComma(stripComments(value))) {
        const match = family.match(fontFamilyRegexp);
        if (match) {
            // Either the 1st or 2nd group matches if the value is in quotes
            results.push(match[1] || match[2]);
        }
        else {
            // Value without without quotes.
            results.push(family);
        }
    }
    return results;
}
/**
 * Splits a list of values by comma and trims parts
 */
export function splitByComma(value) {
    return value.split(',').map(part => part.trim());
}
export function stripComments(value) {
    return value.replaceAll(/(\/\*(?:.|\s)*?\*\/)/g, '');
}
function nodeText(node, text) {
    return nodeTextRange(node, node, text);
}
function nodeTextRange(from, to, text) {
    return text.substring(from.from, to.to);
}
export class SyntaxTree {
    propertyValue;
    rule;
    tree;
    trailingNodes;
    propertyName;
    constructor(propertyValue, rule, tree, propertyName, trailingNodes = []) {
        this.propertyName = propertyName;
        this.propertyValue = propertyValue;
        this.rule = rule;
        this.tree = tree;
        this.trailingNodes = trailingNodes;
    }
    text(node) {
        if (node === null) {
            return '';
        }
        return nodeText(node ?? this.tree, this.rule);
    }
    textRange(from, to) {
        if (!from || !to) {
            return '';
        }
        return nodeTextRange(from, to, this.rule);
    }
    subtree(node) {
        return new SyntaxTree(this.propertyValue, this.rule, node);
    }
}
export class TreeWalker {
    ast;
    constructor(ast) {
        this.ast = ast;
    }
    static walkExcludingSuccessors(propertyValue, ...args) {
        const instance = new this(propertyValue, ...args);
        if (propertyValue.tree.name === 'Declaration') {
            instance.iterateDeclaration(propertyValue.tree);
        }
        else {
            instance.iterateExcludingSuccessors(propertyValue.tree);
        }
        return instance;
    }
    static walk(propertyValue, ...args) {
        const instance = new this(propertyValue, ...args);
        if (propertyValue.tree.name === 'Declaration') {
            instance.iterateDeclaration(propertyValue.tree);
        }
        else {
            instance.iterate(propertyValue.tree);
        }
        return instance;
    }
    iterateDeclaration(tree) {
        if (tree.name !== 'Declaration') {
            return;
        }
        if (this.enter(tree)) {
            for (const sibling of ASTUtils.siblings(ASTUtils.declValue(tree))) {
                sibling.cursor().iterate(this.enter.bind(this), this.leave.bind(this));
            }
        }
        this.leave(tree);
    }
    iterate(tree) {
        // Includes siblings of tree.
        for (const sibling of ASTUtils.siblings(tree)) {
            sibling.cursor().iterate(this.enter.bind(this), this.leave.bind(this));
        }
    }
    iterateExcludingSuccessors(tree) {
        tree.cursor().iterate(this.enter.bind(this), this.leave.bind(this));
    }
    enter(_node) {
        return true;
    }
    leave(_node) {
    }
}
export function matcherBase(matchT) {
    class MatcherBase {
        matchType = matchT;
        accepts(_propertyName) {
            return true;
        }
        matches(_node, _matching) {
            return null;
        }
    }
    return MatcherBase;
}
export class BottomUpTreeMatching extends TreeWalker {
    #matchers = [];
    #matchedNodes = new Map();
    computedText;
    #key(node) {
        return `${node.from}:${node.to}`;
    }
    constructor(ast, matchers) {
        super(ast);
        this.computedText = new ComputedText(ast.rule.substring(ast.tree.from));
        this.#matchers.push(...matchers.filter(m => !ast.propertyName || m.accepts(ast.propertyName)));
        this.#matchers.push(new TextMatcher());
    }
    leave({ node }) {
        for (const matcher of this.#matchers) {
            const match = matcher.matches(node, this);
            if (match) {
                this.computedText.push(match, node.from - this.ast.tree.from);
                this.#matchedNodes.set(this.#key(node), match);
                break;
            }
        }
    }
    matchText(node) {
        const matchers = this.#matchers.splice(0);
        this.#matchers.push(new TextMatcher());
        this.iterateExcludingSuccessors(node);
        this.#matchers.push(...matchers);
    }
    hasMatches(...matchTypes) {
        return Boolean(this.#matchedNodes.values().find(match => matchTypes.some(matchType => match instanceof matchType)));
    }
    getMatch(node) {
        return this.#matchedNodes.get(this.#key(node));
    }
    hasUnresolvedSubstitutions(node) {
        return this.hasUnresolvedSubstitutionsRange(node, node);
    }
    hasUnresolvedSubstitutionsRange(from, to) {
        return this.computedText.hasUnresolvedSubstitutions(from.from - this.ast.tree.from, to.to - this.ast.tree.from);
    }
    getComputedText(node, substitutionHook) {
        return this.getComputedTextRange(node, node, substitutionHook);
    }
    getLonghandValuesCount() {
        const [from, to] = ASTUtils.range(ASTUtils.siblings(ASTUtils.declValue(this.ast.tree)));
        if (!from || !to) {
            return 0;
        }
        return this.computedText.countTopLevelValues(from.from - this.ast.tree.from, to.to - this.ast.tree.from);
    }
    getComputedLonghandName(to) {
        const from = ASTUtils.declValue(this.ast.tree) ?? this.ast.tree;
        return this.computedText.countTopLevelValues(from.from - this.ast.tree.from, to.from - this.ast.tree.from);
    }
    getComputedPropertyValueText(substitutionHook) {
        const [from, to] = ASTUtils.range(ASTUtils.siblings(ASTUtils.declValue(this.ast.tree)));
        return this.getComputedTextRange(from ?? this.ast.tree, to ?? this.ast.tree, substitutionHook);
    }
    getComputedTextRange(from, to, substitutionHook) {
        if (!from || !to) {
            return '';
        }
        return this.computedText.get(from.from - this.ast.tree.from, to.to - this.ast.tree.from, substitutionHook);
    }
}
class ComputedTextChunk {
    match;
    offset;
    #cachedComputedText = null;
    #topLevelValueCount = null;
    constructor(match, offset) {
        this.match = match;
        this.offset = offset;
    }
    get end() {
        return this.offset + this.length;
    }
    get length() {
        return this.match.text.length;
    }
    get computedText() {
        if (this.#cachedComputedText === null) {
            this.#cachedComputedText = this.match.computedText();
        }
        return this.#cachedComputedText;
    }
    // If the match is top-level, i.e. is an outermost sub-expression in the property value, count the number of outermost
    // sub-expressions after applying any potential substitutions.
    get topLevelValueCount() {
        if (this.match.node.parent?.name !== 'Declaration') {
            // Not a top-level match.
            return 0;
        }
        const computedText = this.computedText;
        if (computedText === '') {
            // Substitutions elided the match altogether.
            return 0;
        }
        if (this.#topLevelValueCount === null) {
            // computedText may be null, in which case the match text was not replaced.
            this.#topLevelValueCount =
                ASTUtils
                    .siblings(ASTUtils.declValue(tokenizeDeclaration('--p', computedText ?? this.match.text)?.tree ?? null))
                    .length;
        }
        return this.#topLevelValueCount;
    }
}
/**
 * This class constructs the "computed" text from the input property text, i.e., it will strip comments and substitute
 * var() functions if possible. It's intended for use during the bottom-up tree matching process. The original text is
 * not modified. Instead, computed text slices are produced on the fly. During bottom-up matching, the sequence of
 * top-level comments and var() matches will be recorded. This produces an ordered sequence of text pieces that need to
 * be substituted into the original text. When a computed text slice is requested, it is generated by piecing together
 * original and computed slices as required.
 **/
export class ComputedText {
    #chunks = [];
    text;
    #topLevelValueCounts = new Map();
    #sorted = true;
    constructor(text) {
        this.text = text;
    }
    clear() {
        this.#chunks.splice(0);
        this.#topLevelValueCounts.clear();
    }
    get chunkCount() {
        this.#sortIfNecessary();
        return this.#chunks.length;
    }
    #sortIfNecessary() {
        if (this.#sorted) {
            return;
        }
        // A match that was pushed more than once is superseded by its last push.
        const lastPush = new Map();
        for (const chunk of this.#chunks) {
            lastPush.set(chunk.match, chunk);
        }
        if (lastPush.size < this.#chunks.length) {
            this.#chunks = this.#chunks.filter(chunk => lastPush.get(chunk.match) === chunk);
        }
        // Sort intervals by offset, with longer intervals first if the offset is identical.
        this.#chunks.sort((a, b) => {
            if (a.offset < b.offset) {
                return -1;
            }
            if (b.offset < a.offset) {
                return 1;
            }
            if (a.end > b.end) {
                return -1;
            }
            if (a.end < b.end) {
                return 1;
            }
            return 0;
        });
        this.#sorted = true;
    }
    // Add another substitutable match. The match will either be appended to the list of existing matches or it will
    // be substituted for the last match(es) if it encompasses them. Pushing a match again supersedes its earlier push.
    push(match, offset) {
        function hasComputedText(match) {
            return Boolean(match.computedText);
        }
        if (!hasComputedText(match) || offset < 0 || offset >= this.text.length) {
            return;
        }
        const chunk = new ComputedTextChunk(match, offset);
        if (chunk.end > this.text.length) {
            return;
        }
        this.#sorted = false;
        this.#chunks.push(chunk);
    }
    *#range(begin, end) {
        this.#sortIfNecessary();
        let i = this.#chunks.findIndex(c => c.offset >= begin);
        while (i >= 0 && i < this.#chunks.length && this.#chunks[i].end > begin && begin < end) {
            if (this.#chunks[i].end > end) {
                i++;
                continue;
            }
            yield this.#chunks[i];
            begin = this.#chunks[i].end;
            while (begin < end && i < this.#chunks.length && this.#chunks[i].offset < begin) {
                i++;
            }
        }
    }
    hasUnresolvedSubstitutions(begin, end) {
        for (const chunk of this.#range(begin, end)) {
            if (chunk.computedText === null) {
                return true;
            }
        }
        return false;
    }
    *#getPieces(begin, end) {
        for (const chunk of this.#range(begin, end)) {
            const piece = this.text.substring(begin, Math.min(chunk.offset, end));
            yield piece;
            if (end >= chunk.end) {
                yield chunk;
            }
            begin = chunk.end;
        }
        if (begin < end) {
            const piece = this.text.substring(begin, end);
            yield piece;
        }
    }
    // Get a slice of the computed text corresponding to the property text in the range [begin, end). The slice may not
    // start within a substitution chunk, e.g., it's invalid to request the computed text for the property value text
    // slice "1px var(--".
    get(begin, end, substitutionHook) {
        const pieces = [];
        const getText = (piece) => {
            if (typeof piece === 'string') {
                return piece;
            }
            const substitution = substitutionHook?.(piece.match) ?? null;
            if (substitution !== null) {
                return getText(substitution);
            }
            return piece.computedText ?? piece.match.text;
        };
        for (const piece of this.#getPieces(begin, end)) {
            const text = getText(piece);
            if (text.length === 0) {
                continue;
            }
            if (pieces.length > 0 && requiresSpace(pieces[pieces.length - 1], text)) {
                pieces.push(' ');
            }
            pieces.push(text);
        }
        return pieces.join('');
    }
    #countTopLevelValuesInStringPiece(piece) {
        let count = this.#topLevelValueCounts.get(piece);
        if (count === undefined) {
            count = ASTUtils.siblings(ASTUtils.declValue(tokenizeDeclaration('--p', piece)?.tree ?? null)).length;
            this.#topLevelValueCounts.set(piece, count);
        }
        return count;
    }
    countTopLevelValues(begin, end) {
        const pieces = Array.from(this.#getPieces(begin, end));
        const counts = pieces.map(chunk => (chunk instanceof ComputedTextChunk ? chunk.topLevelValueCount :
            this.#countTopLevelValuesInStringPiece(chunk)));
        const count = counts.reduce((sum, v) => sum + v, 0);
        return count;
    }
}
/**
 * This function determines whether concatenating two pieces of text requires any spacing in between. For example, there
 * shouldn't be any space between 'var' and '(', but there should be a space between '1px' and 'solid'. The node
 * sequences that make up the pieces of text may contain non-text nodes/trees. Any such element in between the texts is
 * ignored for the spacing requirement.
 **/
export function requiresSpace(a, b) {
    const tail = Array.isArray(a) ? a.findLast(node => node.textContent)?.textContent : a;
    const head = Array.isArray(b) ? b.find(node => node.textContent)?.textContent : b;
    const trailingChar = tail ? tail[tail.length - 1] : '';
    const leadingChar = head ? head[0] : '';
    const noSpaceAfter = ['', '(', '{', '}', ';', '['];
    const noSpaceBefore = ['', '(', ')', ',', ':', '*', '{', ';', ']'];
    return !/\s/.test(trailingChar) && !/\s/.test(leadingChar) && !noSpaceAfter.includes(trailingChar) &&
        !noSpaceBefore.includes(leadingChar);
}
export var ASTUtils;
(function (ASTUtils) {
    function siblings(node) {
        const result = [];
        while (node) {
            result.push(node);
            node = node.nextSibling;
        }
        return result;
    }
    ASTUtils.siblings = siblings;
    function children(node) {
        return siblings(node?.firstChild ?? null);
    }
    ASTUtils.children = children;
    function range(node) {
        return [node[0], node[node.length - 1]];
    }
    ASTUtils.range = range;
    function declValue(node) {
        if (node?.name !== 'Declaration') {
            return null;
        }
        return children(node).find(node => node.name === ':')?.nextSibling ?? null;
    }
    ASTUtils.declValue = declValue;
    function* stripComments(nodes) {
        for (const node of nodes) {
            if (node.type.name !== 'Comment') {
                yield node;
            }
        }
    }
    ASTUtils.stripComments = stripComments;
    function split(nodes) {
        const result = [];
        let current = [];
        for (const node of nodes) {
            if (node.name === ',') {
                result.push(current);
                current = [];
            }
            else {
                current.push(node);
            }
        }
        if (nodes.length > 0) {
            result.push(current);
        }
        return result;
    }
    ASTUtils.split = split;
    function callArgs(node) {
        const args = children(node?.getChild('ArgList') ?? null);
        const openParen = args.splice(0, 1)[0];
        const closingParen = args.pop();
        if (openParen?.name !== '(' || closingParen?.name !== ')') {
            return [];
        }
        return split(args);
    }
    ASTUtils.callArgs = callArgs;
    function equals(a, b) {
        return a.name === b.name && a.from === b.from && a.to === b.to;
    }
    ASTUtils.equals = equals;
})(ASTUtils || (ASTUtils = {}));
function declaration(rule) {
    const cssParser = CodeMirror.css.cssLanguage.parser;
    return cssParser.parse(rule).topNode.getChild('RuleSet')?.getChild('Block')?.getChild('Declaration') ?? null;
}
export function tokenizeDeclaration(propertyName, propertyValue) {
    const name = tokenizePropertyName(propertyName);
    if (!name) {
        return null;
    }
    const rule = `*{${name}: ${propertyValue};}`;
    const decl = declaration(rule);
    if (!decl || decl.type.isError) {
        return null;
    }
    const childNodes = ASTUtils.children(decl);
    if (childNodes.length < 2) {
        return null;
    }
    const [varName, colon, tree] = childNodes;
    if (!varName || varName.type.isError || !colon || colon.type.isError || tree?.type.isError) {
        return null;
    }
    // It's possible that there are nodes following the declaration when there are comments or syntax errors. We want to
    // render any comments, so pick up any trailing nodes following the declaration excluding the final semicolon and
    // brace.
    const trailingNodes = ASTUtils.siblings(decl).slice(1);
    const [semicolon, brace] = trailingNodes.splice(trailingNodes.length - 2, 2);
    if (semicolon?.name !== ';' && brace?.name !== '}') {
        return null;
    }
    const ast = new SyntaxTree(propertyValue, rule, decl, name, trailingNodes);
    if (ast.text(varName) !== name || colon.name !== ':') {
        return null;
    }
    return ast;
}
export function tokenizePropertyName(name) {
    const rule = `*{${name}: inherit;}`;
    const decl = declaration(rule);
    if (!decl || decl.type.isError) {
        return null;
    }
    const propertyName = decl.getChild('PropertyName') ?? decl.getChild('VariableName');
    if (!propertyName) {
        return null;
    }
    return nodeText(propertyName, rule);
}
export function matchDeclaration(name, value, matchers) {
    const ast = tokenizeDeclaration(name, value);
    const matchedResult = ast && BottomUpTreeMatching.walk(ast, matchers);
    ast?.trailingNodes.forEach(n => matchedResult?.matchText(n));
    return matchedResult;
}
export class TreeSearch extends TreeWalker {
    #found = null;
    #predicate;
    constructor(ast, predicate) {
        super(ast);
        this.#predicate = predicate;
    }
    enter({ node }) {
        if (this.#found) {
            return false;
        }
        if (this.#predicate(node)) {
            this.#found = this.#found ?? node;
            return false;
        }
        return true;
    }
    static find(ast, predicate) {
        return TreeSearch.walk(ast, predicate).#found;
    }
    static findAll(ast, predicate) {
        const foundNodes = [];
        TreeSearch.walk(ast, (node) => {
            if (predicate(node)) {
                foundNodes.push(node);
            }
            return false;
        });
        return foundNodes;
    }
}
//# sourceMappingURL=CSSPropertyParser.js.map