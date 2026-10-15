import { getOrder } from "../util/bidi.js";
import { ie, ie_version, webkit } from "../util/browser.js";
import { elt, eltP, joinClasses } from "../util/dom.js";
import { eventMixin, signal } from "../util/event.js";
import { hasBadBidiRects, zeroWidthElement } from "../util/feature_detection.js";
import { lst, spaceStr } from "../util/misc.js";
import { getLineStyles } from "./highlight.js";
import { attachMarkedSpans, compareCollapsedMarkers, detachMarkedSpans, lineIsHidden, visualLineContinued } from "./spans.js";
import { getLine, lineNo, updateLineHeight } from "./utils_line.js";
// LINE DATA STRUCTURE
// Line objects. These hold state related to a line, including
// highlighting info (the styles array).
export class Line {
    constructor(text, markedSpans, estimateHeight) {
        this.text = text;
        attachMarkedSpans(this, markedSpans);
        this.height = estimateHeight ? estimateHeight(this) : 1;
    }
    lineNo() { return lineNo(this); }
}
eventMixin(Line);
// Change the content (text, markers) of a line. Automatically
// invalidates cached information and tries to re-estimate the
// line's height.
export function updateLine(line, text, markedSpans, estimateHeight) {
    line.text = text;
    if (line.stateAfter)
        line.stateAfter = null;
    if (line.styles)
        line.styles = null;
    if (line.order != null)
        line.order = null;
    detachMarkedSpans(line);
    attachMarkedSpans(line, markedSpans);
    let estHeight = estimateHeight ? estimateHeight(line) : 1;
    if (estHeight != line.height)
        updateLineHeight(line, estHeight);
}
// Detach a line from the document tree and its markers.
export function cleanUpLine(line) {
    line.parent = null;
    detachMarkedSpans(line);
}
// Convert a style as returned by a mode (either null, or a string
// containing one or more styles) to a CSS style. This is cached,
// and also looks for line-wide styles.
let styleToClassCache = {}, styleToClassCacheWithMode = {};
function interpretTokenStyle(style, options) {
    if (!style || /^\s*$/.test(style))
        return null;
    let cache = options.addModeClass ? styleToClassCacheWithMode : styleToClassCache;
    return cache[style] ||
        (cache[style] = style.replace(/\S+/g, "cm-$&"));
}
// Render the DOM representation of the text of a line. Also builds
// up a 'line map', which points at the DOM nodes that represent
// specific stretches of text, and is used by the measuring code.
// The returned object contains the DOM node, this map, and
// information about line-wide styles that were set by the mode.
export function buildLineContent(cm, lineView) {
    // The padding-right forces the element to have a 'border', which
    // is needed on Webkit to be able to get line-level bounding
    // rectangles for it (in measureChar).
    let content = eltP("span", null, null, webkit ? "padding-right: .1px" : null);
    let builder = { pre: eltP("pre", [content], "CodeMirror-line"), content: content,
        col: 0, pos: 0, cm: cm,
        trailingSpace: false,
        splitSpaces: cm.getOption("lineWrapping") };
    lineView.measure = {};
    // Iterate over the logical lines that make up this visual line.
    for (let i = 0; i <= (lineView.rest ? lineView.rest.length : 0); i++) {
        let line = i ? lineView.rest[i - 1] : lineView.line, order;
        builder.pos = 0;
        builder.addToken = buildToken;
        // Optionally wire in some hacks into the token-rendering
        // algorithm, to deal with browser quirks.
        if (hasBadBidiRects(cm.display.measure) && (order = getOrder(line, cm.doc.direction)))
            builder.addToken = buildTokenBadBidi(builder.addToken, order);
        builder.map = [];
        let allowFrontierUpdate = lineView != cm.display.externalMeasured && lineNo(line);
        insertLineContent(line, builder, getLineStyles(cm, line, allowFrontierUpdate));
        if (line.styleClasses) {
            if (line.styleClasses.bgClass)
                builder.bgClass = joinClasses(line.styleClasses.bgClass, builder.bgClass || "");
            if (line.styleClasses.textClass)
                builder.textClass = joinClasses(line.styleClasses.textClass, builder.textClass || "");
        }
        // Ensure at least a single node is present, for measuring.
        if (builder.map.length == 0)
            builder.map.push(0, 0, builder.content.appendChild(zeroWidthElement(cm.display.measure)));
        // Store the map and a cache object for the current logical line
        if (i == 0) {
            lineView.measure.map = builder.map;
            lineView.measure.cache = {};
        }
        else {
            ;
            (lineView.measure.maps || (lineView.measure.maps = [])).push(builder.map);
            (lineView.measure.caches || (lineView.measure.caches = [])).push({});
        }
    }
    // See issue #2901
    if (webkit) {
        let last = builder.content.lastChild;
        if (/\bcm-tab\b/.test(last.className) || (last.querySelector && last.querySelector(".cm-tab")))
            builder.content.className = "cm-tab-wrap-hack";
    }
    signal(cm, "renderLine", cm, lineView.line, builder.pre);
    if (builder.pre.className)
        builder.textClass = joinClasses(builder.pre.className, builder.textClass || "");
    return builder;
}
export function defaultSpecialCharPlaceholder(ch) {
    let token = elt("span", "\u2022", "cm-invalidchar");
    token.title = "\\u" + ch.charCodeAt(0).toString(16);
    token.setAttribute("aria-label", token.title);
    return token;
}
// Build up the DOM representation for a single token, and add it to
// the line map. Takes care to render special characters separately.
function buildToken(builder, text, style, startStyle, endStyle, css, attributes) {
    if (!text)
        return;
    let displayText = builder.splitSpaces ? splitSpaces(text, builder.trailingSpace) : text;
    let special = builder.cm.state.specialChars, mustWrap = false;
    let content;
    if (!special.test(text)) {
        builder.col += text.length;
        content = document.createTextNode(displayText);
        builder.map.push(builder.pos, builder.pos + text.length, content);
        if (ie && ie_version < 9)
            mustWrap = true;
        builder.pos += text.length;
    }
    else {
        content = document.createDocumentFragment();
        let pos = 0;
        while (true) {
            special.lastIndex = pos;
            let m = special.exec(text);
            let skipped = m ? m.index - pos : text.length - pos;
            if (skipped) {
                let txt = document.createTextNode(displayText.slice(pos, pos + skipped));
                if (ie && ie_version < 9)
                    content.appendChild(elt("span", [txt]));
                else
                    content.appendChild(txt);
                builder.map.push(builder.pos, builder.pos + skipped, txt);
                builder.col += skipped;
                builder.pos += skipped;
            }
            if (!m)
                break;
            pos += skipped + 1;
            let txt;
            if (m[0] == "\t") {
                let tabSize = builder.cm.options.tabSize, tabWidth = tabSize - builder.col % tabSize;
                txt = content.appendChild(elt("span", spaceStr(tabWidth), "cm-tab"));
                txt.setAttribute("role", "presentation");
                txt.setAttribute("cm-text", "\t");
                builder.col += tabWidth;
            }
            else if (m[0] == "\r" || m[0] == "\n") {
                txt = content.appendChild(elt("span", m[0] == "\r" ? "\u240d" : "\u2424", "cm-invalidchar"));
                txt.setAttribute("cm-text", m[0]);
                builder.col += 1;
            }
            else {
                txt = builder.cm.options.specialCharPlaceholder(m[0]);
                txt.setAttribute("cm-text", m[0]);
                if (ie && ie_version < 9)
                    content.appendChild(elt("span", [txt]));
                else
                    content.appendChild(txt);
                builder.col += 1;
            }
            builder.map.push(builder.pos, builder.pos + 1, txt);
            builder.pos++;
        }
    }
    builder.trailingSpace = displayText.charCodeAt(text.length - 1) == 32;
    if (style || startStyle || endStyle || mustWrap || css || attributes) {
        let fullStyle = style || "";
        if (startStyle)
            fullStyle += startStyle;
        if (endStyle)
            fullStyle += endStyle;
        let token = elt("span", [content], fullStyle, css);
        if (attributes) {
            for (let attr in attributes)
                if (attributes.hasOwnProperty(attr) && attr != "style" && attr != "class")
                    token.setAttribute(attr, attributes[attr]);
        }
        return builder.content.appendChild(token);
    }
    builder.content.appendChild(content);
}
// Change some spaces to NBSP to prevent the browser from collapsing
// trailing spaces at the end of a line when rendering text (issue #1362).
function splitSpaces(text, trailingBefore) {
    if (text.length > 1 && !/  /.test(text))
        return text;
    let spaceBefore = trailingBefore, result = "";
    for (let i = 0; i < text.length; i++) {
        let ch = text.charAt(i);
        if (ch == " " && spaceBefore && (i == text.length - 1 || text.charCodeAt(i + 1) == 32))
            ch = "\u00a0";
        result += ch;
        spaceBefore = ch == " ";
    }
    return result;
}
// Work around nonsense dimensions being reported for stretches of
// right-to-left text.
function buildTokenBadBidi(inner, order) {
    return (builder, text, style, startStyle, endStyle, css, attributes) => {
        style = style ? style + " cm-force-border" : "cm-force-border";
        let start = builder.pos, end = start + text.length;
        for (;;) {
            // Find the part that overlaps with the start of this text
            let part;
            for (let i = 0; i < order.length; i++) {
                part = order[i];
                if (part.to > start && part.from <= start)
                    break;
            }
            if (part.to >= end)
                return inner(builder, text, style, startStyle, endStyle, css, attributes);
            inner(builder, text.slice(0, part.to - start), style, startStyle, null, css, attributes);
            startStyle = null;
            text = text.slice(part.to - start);
            start = part.to;
        }
    };
}
function buildCollapsedSpan(builder, size, marker, ignoreWidget) {
    let widget = !ignoreWidget && marker.widgetNode;
    if (widget)
        builder.map.push(builder.pos, builder.pos + size, widget);
    if (!ignoreWidget && builder.cm.display.input.needsContentAttribute) {
        if (!widget)
            widget = builder.content.appendChild(document.createElement("span"));
        widget.setAttribute("cm-marker", marker.id);
    }
    if (widget) {
        builder.cm.display.input.setUneditable(widget);
        builder.content.appendChild(widget);
    }
    builder.pos += size;
    builder.trailingSpace = false;
}
// Outputs a number of spans to make up a line, taking highlighting
// and marked text into account.
function insertLineContent(line, builder, styles) {
    let spans = line.markedSpans, allText = line.text, at = 0;
    if (!spans) {
        for (let i = 1; i < styles.length; i += 2)
            builder.addToken(builder, allText.slice(at, at = styles[i]), interpretTokenStyle(styles[i + 1], builder.cm.options));
        return;
    }
    let len = allText.length, pos = 0, i = 1, text = "", style, css;
    let nextChange = 0, spanStyle, spanEndStyle, spanStartStyle, collapsed, attributes;
    for (;;) {
        if (nextChange == pos) { // Update current marker set
            spanStyle = spanEndStyle = spanStartStyle = css = "";
            attributes = null;
            collapsed = null;
            nextChange = Infinity;
            let foundBookmarks = [], endStyles;
            for (let j = 0; j < spans.length; ++j) {
                let sp = spans[j], m = sp.marker;
                if (m.type == "bookmark" && sp.from == pos && m.widgetNode) {
                    foundBookmarks.push(m);
                }
                else if (sp.from <= pos && (sp.to == null || sp.to > pos || m.collapsed && sp.to == pos && sp.from == pos)) {
                    if (sp.to != null && sp.to != pos && nextChange > sp.to) {
                        nextChange = sp.to;
                        spanEndStyle = "";
                    }
                    if (m.className)
                        spanStyle += " " + m.className;
                    if (m.css)
                        css = (css ? css + ";" : "") + m.css;
                    if (m.startStyle && sp.from == pos)
                        spanStartStyle += " " + m.startStyle;
                    if (m.endStyle && sp.to == nextChange)
                        (endStyles || (endStyles = [])).push(m.endStyle, sp.to);
                    // support for the old title property
                    // https://github.com/codemirror/CodeMirror/pull/5673
                    if (m.title)
                        (attributes || (attributes = {})).title = m.title;
                    if (m.attributes) {
                        for (let attr in m.attributes)
                            (attributes || (attributes = {}))[attr] = m.attributes[attr];
                    }
                    if (m.collapsed && (!collapsed || compareCollapsedMarkers(collapsed.marker, m) < 0))
                        collapsed = sp;
                }
                else if (sp.from > pos && nextChange > sp.from) {
                    nextChange = sp.from;
                }
            }
            if (endStyles)
                for (let j = 0; j < endStyles.length; j += 2)
                    if (endStyles[j + 1] == nextChange)
                        spanEndStyle += " " + endStyles[j];
            if (!collapsed || collapsed.from == pos)
                for (let j = 0; j < foundBookmarks.length; ++j)
                    buildCollapsedSpan(builder, 0, foundBookmarks[j]);
            if (collapsed && (collapsed.from || 0) == pos) {
                buildCollapsedSpan(builder, (collapsed.to == null ? len + 1 : collapsed.to) - pos, collapsed.marker, collapsed.from == null);
                if (collapsed.to == null)
                    return;
                if (collapsed.to == pos)
                    collapsed = false;
            }
        }
        if (pos >= len)
            break;
        let upto = Math.min(len, nextChange);
        while (true) {
            if (text) {
                let end = pos + text.length;
                if (!collapsed) {
                    let tokenText = end > upto ? text.slice(0, upto - pos) : text;
                    builder.addToken(builder, tokenText, style ? style + spanStyle : spanStyle, spanStartStyle, pos + tokenText.length == nextChange ? spanEndStyle : "", css, attributes);
                }
                if (end >= upto) {
                    text = text.slice(upto - pos);
                    pos = upto;
                    break;
                }
                pos = end;
                spanStartStyle = "";
            }
            text = allText.slice(at, at = styles[i++]);
            style = interpretTokenStyle(styles[i++], builder.cm.options);
        }
    }
}
// These objects are used to represent the visible (currently drawn)
// part of the document. A LineView may correspond to multiple
// logical lines, if those are connected by collapsed ranges.
export function LineView(doc, line, lineN) {
    // The starting line
    this.line = line;
    // Continuing lines, if any
    this.rest = visualLineContinued(line);
    // Number of logical lines in this visual line
    this.size = this.rest ? lineNo(lst(this.rest)) - lineN + 1 : 1;
    this.node = this.text = null;
    this.hidden = lineIsHidden(doc, line);
}
// Create a range of LineView objects for the given lines.
export function buildViewArray(cm, from, to) {
    let array = [], nextPos;
    for (let pos = from; pos < to; pos = nextPos) {
        let view = new LineView(cm.doc, getLine(cm.doc, pos), pos);
        nextPos = pos + view.size;
        array.push(view);
    }
    return array;
}
//# sourceMappingURL=line_data.js.map