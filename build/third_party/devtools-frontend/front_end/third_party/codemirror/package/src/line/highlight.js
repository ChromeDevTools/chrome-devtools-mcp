import { copyState, innerMode, startState } from "../modes.js";
import { countColumn } from "../util/misc.js";
import StringStream from "../util/StringStream.js";
import { clipPos } from "./pos.js";
import { getLine, lineNo } from "./utils_line.js";
class SavedContext {
    constructor(state, lookAhead) {
        this.state = state;
        this.lookAhead = lookAhead;
    }
}
class Context {
    constructor(doc, state, line, lookAhead) {
        this.state = state;
        this.doc = doc;
        this.line = line;
        this.maxLookAhead = lookAhead || 0;
        this.baseTokens = null;
        this.baseTokenPos = 1;
    }
    lookAhead(n) {
        let line = this.doc.getLine(this.line + n);
        if (line != null && n > this.maxLookAhead)
            this.maxLookAhead = n;
        return line;
    }
    baseToken(n) {
        if (!this.baseTokens)
            return null;
        while (this.baseTokens[this.baseTokenPos] <= n)
            this.baseTokenPos += 2;
        let type = this.baseTokens[this.baseTokenPos + 1];
        return { type: type && type.replace(/( |^)overlay .*/, ""),
            size: this.baseTokens[this.baseTokenPos] - n };
    }
    nextLine() {
        this.line++;
        if (this.maxLookAhead > 0)
            this.maxLookAhead--;
    }
    static fromSaved(doc, saved, line) {
        if (saved instanceof SavedContext)
            return new Context(doc, copyState(doc.mode, saved.state), line, saved.lookAhead);
        else
            return new Context(doc, copyState(doc.mode, saved), line);
    }
    save(copy) {
        let state = copy !== false ? copyState(this.doc.mode, this.state) : this.state;
        return this.maxLookAhead > 0 ? new SavedContext(state, this.maxLookAhead) : state;
    }
}
// Compute a style array (an array starting with a mode generation
// -- for invalidation -- followed by pairs of end positions and
// style strings), which is used to highlight the tokens on the
// line.
export function highlightLine(cm, line, context, forceToEnd) {
    // A styles array always starts with a number identifying the
    // mode/overlays that it is based on (for easy invalidation).
    let st = [cm.state.modeGen], lineClasses = {};
    // Compute the base array of styles
    runMode(cm, line.text, cm.doc.mode, context, (end, style) => st.push(end, style), lineClasses, forceToEnd);
    let state = context.state;
    // Run overlays, adjust style array.
    for (let o = 0; o < cm.state.overlays.length; ++o) {
        context.baseTokens = st;
        let overlay = cm.state.overlays[o], i = 1, at = 0;
        context.state = true;
        runMode(cm, line.text, overlay.mode, context, (end, style) => {
            let start = i;
            // Ensure there's a token end at the current position, and that i points at it
            while (at < end) {
                let i_end = st[i];
                if (i_end > end)
                    st.splice(i, 1, end, st[i + 1], i_end);
                i += 2;
                at = Math.min(end, i_end);
            }
            if (!style)
                return;
            if (overlay.opaque) {
                st.splice(start, i - start, end, "overlay " + style);
                i = start + 2;
            }
            else {
                for (; start < i; start += 2) {
                    let cur = st[start + 1];
                    st[start + 1] = (cur ? cur + " " : "") + "overlay " + style;
                }
            }
        }, lineClasses);
        context.state = state;
        context.baseTokens = null;
        context.baseTokenPos = 1;
    }
    return { styles: st, classes: lineClasses.bgClass || lineClasses.textClass ? lineClasses : null };
}
export function getLineStyles(cm, line, updateFrontier) {
    if (!line.styles || line.styles[0] != cm.state.modeGen) {
        let context = getContextBefore(cm, lineNo(line));
        let resetState = line.text.length > cm.options.maxHighlightLength && copyState(cm.doc.mode, context.state);
        let result = highlightLine(cm, line, context);
        if (resetState)
            context.state = resetState;
        line.stateAfter = context.save(!resetState);
        line.styles = result.styles;
        if (result.classes)
            line.styleClasses = result.classes;
        else if (line.styleClasses)
            line.styleClasses = null;
        if (updateFrontier === cm.doc.highlightFrontier)
            cm.doc.modeFrontier = Math.max(cm.doc.modeFrontier, ++cm.doc.highlightFrontier);
    }
    return line.styles;
}
export function getContextBefore(cm, n, precise) {
    let doc = cm.doc, display = cm.display;
    if (!doc.mode.startState)
        return new Context(doc, true, n);
    let start = findStartLine(cm, n, precise);
    let saved = start > doc.first && getLine(doc, start - 1).stateAfter;
    let context = saved ? Context.fromSaved(doc, saved, start) : new Context(doc, startState(doc.mode), start);
    doc.iter(start, n, line => {
        processLine(cm, line.text, context);
        let pos = context.line;
        line.stateAfter = pos == n - 1 || pos % 5 == 0 || pos >= display.viewFrom && pos < display.viewTo ? context.save() : null;
        context.nextLine();
    });
    if (precise)
        doc.modeFrontier = context.line;
    return context;
}
// Lightweight form of highlight -- proceed over this line and
// update state, but don't save a style array. Used for lines that
// aren't currently visible.
export function processLine(cm, text, context, startAt) {
    let mode = cm.doc.mode;
    let stream = new StringStream(text, cm.options.tabSize, context);
    stream.start = stream.pos = startAt || 0;
    if (text == "")
        callBlankLine(mode, context.state);
    while (!stream.eol()) {
        readToken(mode, stream, context.state);
        stream.start = stream.pos;
    }
}
function callBlankLine(mode, state) {
    if (mode.blankLine)
        return mode.blankLine(state);
    if (!mode.innerMode)
        return;
    let inner = innerMode(mode, state);
    if (inner.mode.blankLine)
        return inner.mode.blankLine(inner.state);
}
function readToken(mode, stream, state, inner) {
    for (let i = 0; i < 10; i++) {
        if (inner)
            inner[0] = innerMode(mode, state).mode;
        let style = mode.token(stream, state);
        if (stream.pos > stream.start)
            return style;
    }
    throw new Error("Mode " + mode.name + " failed to advance stream.");
}
class Token {
    constructor(stream, type, state) {
        this.start = stream.start;
        this.end = stream.pos;
        this.string = stream.current();
        this.type = type || null;
        this.state = state;
    }
}
// Utility for getTokenAt and getLineTokens
export function takeToken(cm, pos, precise, asArray) {
    let doc = cm.doc, mode = doc.mode, style;
    pos = clipPos(doc, pos);
    let line = getLine(doc, pos.line), context = getContextBefore(cm, pos.line, precise);
    let stream = new StringStream(line.text, cm.options.tabSize, context), tokens;
    if (asArray)
        tokens = [];
    while ((asArray || stream.pos < pos.ch) && !stream.eol()) {
        stream.start = stream.pos;
        style = readToken(mode, stream, context.state);
        if (asArray)
            tokens.push(new Token(stream, style, copyState(doc.mode, context.state)));
    }
    return asArray ? tokens : new Token(stream, style, context.state);
}
function extractLineClasses(type, output) {
    if (type)
        for (;;) {
            let lineClass = type.match(/(?:^|\s+)line-(background-)?(\S+)/);
            if (!lineClass)
                break;
            type = type.slice(0, lineClass.index) + type.slice(lineClass.index + lineClass[0].length);
            let prop = lineClass[1] ? "bgClass" : "textClass";
            if (output[prop] == null)
                output[prop] = lineClass[2];
            else if (!(new RegExp("(?:^|\\s)" + lineClass[2] + "(?:$|\\s)")).test(output[prop]))
                output[prop] += " " + lineClass[2];
        }
    return type;
}
// Run the given mode's parser over a line, calling f for each token.
function runMode(cm, text, mode, context, f, lineClasses, forceToEnd) {
    let flattenSpans = mode.flattenSpans;
    if (flattenSpans == null)
        flattenSpans = cm.options.flattenSpans;
    let curStart = 0, curStyle = null;
    let stream = new StringStream(text, cm.options.tabSize, context), style;
    let inner = cm.options.addModeClass && [null];
    if (text == "")
        extractLineClasses(callBlankLine(mode, context.state), lineClasses);
    while (!stream.eol()) {
        if (stream.pos > cm.options.maxHighlightLength) {
            flattenSpans = false;
            if (forceToEnd)
                processLine(cm, text, context, stream.pos);
            stream.pos = text.length;
            style = null;
        }
        else {
            style = extractLineClasses(readToken(mode, stream, context.state, inner), lineClasses);
        }
        if (inner) {
            let mName = inner[0].name;
            if (mName)
                style = "m-" + (style ? mName + " " + style : mName);
        }
        if (!flattenSpans || curStyle != style) {
            while (curStart < stream.start) {
                curStart = Math.min(stream.start, curStart + 5000);
                f(curStart, curStyle);
            }
            curStyle = style;
        }
        stream.start = stream.pos;
    }
    while (curStart < stream.pos) {
        // Webkit seems to refuse to render text nodes longer than 57444
        // characters, and returns inaccurate measurements in nodes
        // starting around 5000 chars.
        let pos = Math.min(stream.pos, curStart + 5000);
        f(pos, curStyle);
        curStart = pos;
    }
}
// Finds the line to start with when starting a parse. Tries to
// find a line with a stateAfter, so that it can start with a
// valid state. If that fails, it returns the line with the
// smallest indentation, which tends to need the least context to
// parse correctly.
function findStartLine(cm, n, precise) {
    let minindent, minline, doc = cm.doc;
    let lim = precise ? -1 : n - (cm.doc.mode.innerMode ? 1000 : 100);
    for (let search = n; search > lim; --search) {
        if (search <= doc.first)
            return doc.first;
        let line = getLine(doc, search - 1), after = line.stateAfter;
        if (after && (!precise || search + (after instanceof SavedContext ? after.lookAhead : 0) <= doc.modeFrontier))
            return search;
        let indented = countColumn(line.text, null, cm.options.tabSize);
        if (minline == null || minindent > indented) {
            minline = search - 1;
            minindent = indented;
        }
    }
    return minline;
}
export function retreatFrontier(doc, n) {
    doc.modeFrontier = Math.min(doc.modeFrontier, n);
    if (doc.highlightFrontier < n - 10)
        return;
    let start = doc.first;
    for (let line = n - 1; line > start; line--) {
        let saved = getLine(doc, line).stateAfter;
        // change is on 3
        // state on line 1 looked ahead 2 -- so saw 3
        // test 1 + 2 < 3 should cover this
        if (saved && (!(saved instanceof SavedContext) || line + saved.lookAhead < n)) {
            start = line + 1;
            break;
        }
    }
    doc.highlightFrontier = Math.min(doc.highlightFrontier, start);
}
//# sourceMappingURL=highlight.js.map