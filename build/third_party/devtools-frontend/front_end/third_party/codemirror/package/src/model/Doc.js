import { docMethodOp } from "../display/operations.js";
import { ensureCursorVisible, scrollToCoords } from "../display/scrolling.js";
import CodeMirror from "../edit/CodeMirror.js";
import { Line } from "../line/line_data.js";
import { clipPos, clipPosArray, Pos } from "../line/pos.js";
import { visualLine } from "../line/spans.js";
import { getBetween, getLine, getLines, isLine, lineNo } from "../line/utils_line.js";
import { classTest } from "../util/dom.js";
import { splitLinesAuto } from "../util/feature_detection.js";
import { createObj, isEmpty, map, sel_dontScroll } from "../util/misc.js";
import { computeReplacedSel } from "./change_measurement.js";
import { changeLine, makeChange, makeChangeFromHistory, replaceRange } from "./changes.js";
import { BranchChunk, LeafChunk } from "./chunk.js";
import { directionChanged, linkedDocs, updateDoc } from "./document_data.js";
import { copyHistoryArray, History } from "./history.js";
import { addLineWidget } from "./line_widget.js";
import { copySharedMarkers, detachSharedMarkers, findSharedMarkers, markText } from "./mark_text.js";
import { normalizeSelection, Range, simpleSelection } from "./selection.js";
import { extendSelection, extendSelections, setSelection, setSelectionReplaceHistory, setSimpleSelection } from "./selection_updates.js";
let nextDocId = 0;
let Doc = function (text, mode, firstLine, lineSep, direction) {
    if (!(this instanceof Doc))
        return new Doc(text, mode, firstLine, lineSep, direction);
    if (firstLine == null)
        firstLine = 0;
    BranchChunk.call(this, [new LeafChunk([new Line("", null)])]);
    this.first = firstLine;
    this.scrollTop = this.scrollLeft = 0;
    this.cantEdit = false;
    this.cleanGeneration = 1;
    this.modeFrontier = this.highlightFrontier = firstLine;
    let start = Pos(firstLine, 0);
    this.sel = simpleSelection(start);
    this.history = new History(null);
    this.id = ++nextDocId;
    this.modeOption = mode;
    this.lineSep = lineSep;
    this.direction = (direction == "rtl") ? "rtl" : "ltr";
    this.extend = false;
    if (typeof text == "string")
        text = this.splitLines(text);
    updateDoc(this, { from: start, to: start, text: text });
    setSelection(this, simpleSelection(start), sel_dontScroll);
};
Doc.prototype = createObj(BranchChunk.prototype, {
    constructor: Doc,
    // Iterate over the document. Supports two forms -- with only one
    // argument, it calls that for each line in the document. With
    // three, it iterates over the range given by the first two (with
    // the second being non-inclusive).
    iter: function (from, to, op) {
        if (op)
            this.iterN(from - this.first, to - from, op);
        else
            this.iterN(this.first, this.first + this.size, from);
    },
    // Non-public interface for adding and removing lines.
    insert: function (at, lines) {
        let height = 0;
        for (let i = 0; i < lines.length; ++i)
            height += lines[i].height;
        this.insertInner(at - this.first, lines, height);
    },
    remove: function (at, n) { this.removeInner(at - this.first, n); },
    // From here, the methods are part of the public interface. Most
    // are also available from CodeMirror (editor) instances.
    getValue: function (lineSep) {
        let lines = getLines(this, this.first, this.first + this.size);
        if (lineSep === false)
            return lines;
        return lines.join(lineSep || this.lineSeparator());
    },
    setValue: docMethodOp(function (code) {
        let top = Pos(this.first, 0), last = this.first + this.size - 1;
        makeChange(this, { from: top, to: Pos(last, getLine(this, last).text.length),
            text: this.splitLines(code), origin: "setValue", full: true }, true);
        if (this.cm)
            scrollToCoords(this.cm, 0, 0);
        setSelection(this, simpleSelection(top), sel_dontScroll);
    }),
    replaceRange: function (code, from, to, origin) {
        from = clipPos(this, from);
        to = to ? clipPos(this, to) : from;
        replaceRange(this, code, from, to, origin);
    },
    getRange: function (from, to, lineSep) {
        let lines = getBetween(this, clipPos(this, from), clipPos(this, to));
        if (lineSep === false)
            return lines;
        return lines.join(lineSep || this.lineSeparator());
    },
    getLine: function (line) { let l = this.getLineHandle(line); return l && l.text; },
    getLineHandle: function (line) { if (isLine(this, line))
        return getLine(this, line); },
    getLineNumber: function (line) { return lineNo(line); },
    getLineHandleVisualStart: function (line) {
        if (typeof line == "number")
            line = getLine(this, line);
        return visualLine(line);
    },
    lineCount: function () { return this.size; },
    firstLine: function () { return this.first; },
    lastLine: function () { return this.first + this.size - 1; },
    clipPos: function (pos) { return clipPos(this, pos); },
    getCursor: function (start) {
        let range = this.sel.primary(), pos;
        if (start == null || start == "head")
            pos = range.head;
        else if (start == "anchor")
            pos = range.anchor;
        else if (start == "end" || start == "to" || start === false)
            pos = range.to();
        else
            pos = range.from();
        return pos;
    },
    listSelections: function () { return this.sel.ranges; },
    somethingSelected: function () { return this.sel.somethingSelected(); },
    setCursor: docMethodOp(function (line, ch, options) {
        setSimpleSelection(this, clipPos(this, typeof line == "number" ? Pos(line, ch || 0) : line), null, options);
    }),
    setSelection: docMethodOp(function (anchor, head, options) {
        setSimpleSelection(this, clipPos(this, anchor), clipPos(this, head || anchor), options);
    }),
    extendSelection: docMethodOp(function (head, other, options) {
        extendSelection(this, clipPos(this, head), other && clipPos(this, other), options);
    }),
    extendSelections: docMethodOp(function (heads, options) {
        extendSelections(this, clipPosArray(this, heads), options);
    }),
    extendSelectionsBy: docMethodOp(function (f, options) {
        let heads = map(this.sel.ranges, f);
        extendSelections(this, clipPosArray(this, heads), options);
    }),
    setSelections: docMethodOp(function (ranges, primary, options) {
        if (!ranges.length)
            return;
        let out = [];
        for (let i = 0; i < ranges.length; i++)
            out[i] = new Range(clipPos(this, ranges[i].anchor), clipPos(this, ranges[i].head || ranges[i].anchor));
        if (primary == null)
            primary = Math.min(ranges.length - 1, this.sel.primIndex);
        setSelection(this, normalizeSelection(this.cm, out, primary), options);
    }),
    addSelection: docMethodOp(function (anchor, head, options) {
        let ranges = this.sel.ranges.slice(0);
        ranges.push(new Range(clipPos(this, anchor), clipPos(this, head || anchor)));
        setSelection(this, normalizeSelection(this.cm, ranges, ranges.length - 1), options);
    }),
    getSelection: function (lineSep) {
        let ranges = this.sel.ranges, lines;
        for (let i = 0; i < ranges.length; i++) {
            let sel = getBetween(this, ranges[i].from(), ranges[i].to());
            lines = lines ? lines.concat(sel) : sel;
        }
        if (lineSep === false)
            return lines;
        else
            return lines.join(lineSep || this.lineSeparator());
    },
    getSelections: function (lineSep) {
        let parts = [], ranges = this.sel.ranges;
        for (let i = 0; i < ranges.length; i++) {
            let sel = getBetween(this, ranges[i].from(), ranges[i].to());
            if (lineSep !== false)
                sel = sel.join(lineSep || this.lineSeparator());
            parts[i] = sel;
        }
        return parts;
    },
    replaceSelection: function (code, collapse, origin) {
        let dup = [];
        for (let i = 0; i < this.sel.ranges.length; i++)
            dup[i] = code;
        this.replaceSelections(dup, collapse, origin || "+input");
    },
    replaceSelections: docMethodOp(function (code, collapse, origin) {
        let changes = [], sel = this.sel;
        for (let i = 0; i < sel.ranges.length; i++) {
            let range = sel.ranges[i];
            changes[i] = { from: range.from(), to: range.to(), text: this.splitLines(code[i]), origin: origin };
        }
        let newSel = collapse && collapse != "end" && computeReplacedSel(this, changes, collapse);
        for (let i = changes.length - 1; i >= 0; i--)
            makeChange(this, changes[i]);
        if (newSel)
            setSelectionReplaceHistory(this, newSel);
        else if (this.cm)
            ensureCursorVisible(this.cm);
    }),
    undo: docMethodOp(function () { makeChangeFromHistory(this, "undo"); }),
    redo: docMethodOp(function () { makeChangeFromHistory(this, "redo"); }),
    undoSelection: docMethodOp(function () { makeChangeFromHistory(this, "undo", true); }),
    redoSelection: docMethodOp(function () { makeChangeFromHistory(this, "redo", true); }),
    setExtending: function (val) { this.extend = val; },
    getExtending: function () { return this.extend; },
    historySize: function () {
        let hist = this.history, done = 0, undone = 0;
        for (let i = 0; i < hist.done.length; i++)
            if (!hist.done[i].ranges)
                ++done;
        for (let i = 0; i < hist.undone.length; i++)
            if (!hist.undone[i].ranges)
                ++undone;
        return { undo: done, redo: undone };
    },
    clearHistory: function () {
        this.history = new History(this.history);
        linkedDocs(this, doc => doc.history = this.history, true);
    },
    markClean: function () {
        this.cleanGeneration = this.changeGeneration(true);
    },
    changeGeneration: function (forceSplit) {
        if (forceSplit)
            this.history.lastOp = this.history.lastSelOp = this.history.lastOrigin = null;
        return this.history.generation;
    },
    isClean: function (gen) {
        return this.history.generation == (gen || this.cleanGeneration);
    },
    getHistory: function () {
        return { done: copyHistoryArray(this.history.done),
            undone: copyHistoryArray(this.history.undone) };
    },
    setHistory: function (histData) {
        let hist = this.history = new History(this.history);
        hist.done = copyHistoryArray(histData.done.slice(0), null, true);
        hist.undone = copyHistoryArray(histData.undone.slice(0), null, true);
    },
    setGutterMarker: docMethodOp(function (line, gutterID, value) {
        return changeLine(this, line, "gutter", line => {
            let markers = line.gutterMarkers || (line.gutterMarkers = {});
            markers[gutterID] = value;
            if (!value && isEmpty(markers))
                line.gutterMarkers = null;
            return true;
        });
    }),
    clearGutter: docMethodOp(function (gutterID) {
        this.iter(line => {
            if (line.gutterMarkers && line.gutterMarkers[gutterID]) {
                changeLine(this, line, "gutter", () => {
                    line.gutterMarkers[gutterID] = null;
                    if (isEmpty(line.gutterMarkers))
                        line.gutterMarkers = null;
                    return true;
                });
            }
        });
    }),
    lineInfo: function (line) {
        let n;
        if (typeof line == "number") {
            if (!isLine(this, line))
                return null;
            n = line;
            line = getLine(this, line);
            if (!line)
                return null;
        }
        else {
            n = lineNo(line);
            if (n == null)
                return null;
        }
        return { line: n, handle: line, text: line.text, gutterMarkers: line.gutterMarkers,
            textClass: line.textClass, bgClass: line.bgClass, wrapClass: line.wrapClass,
            widgets: line.widgets };
    },
    addLineClass: docMethodOp(function (handle, where, cls) {
        return changeLine(this, handle, where == "gutter" ? "gutter" : "class", line => {
            let prop = where == "text" ? "textClass"
                : where == "background" ? "bgClass"
                    : where == "gutter" ? "gutterClass" : "wrapClass";
            if (!line[prop])
                line[prop] = cls;
            else if (classTest(cls).test(line[prop]))
                return false;
            else
                line[prop] += " " + cls;
            return true;
        });
    }),
    removeLineClass: docMethodOp(function (handle, where, cls) {
        return changeLine(this, handle, where == "gutter" ? "gutter" : "class", line => {
            let prop = where == "text" ? "textClass"
                : where == "background" ? "bgClass"
                    : where == "gutter" ? "gutterClass" : "wrapClass";
            let cur = line[prop];
            if (!cur)
                return false;
            else if (cls == null)
                line[prop] = null;
            else {
                let found = cur.match(classTest(cls));
                if (!found)
                    return false;
                let end = found.index + found[0].length;
                line[prop] = cur.slice(0, found.index) + (!found.index || end == cur.length ? "" : " ") + cur.slice(end) || null;
            }
            return true;
        });
    }),
    addLineWidget: docMethodOp(function (handle, node, options) {
        return addLineWidget(this, handle, node, options);
    }),
    removeLineWidget: function (widget) { widget.clear(); },
    markText: function (from, to, options) {
        return markText(this, clipPos(this, from), clipPos(this, to), options, options && options.type || "range");
    },
    setBookmark: function (pos, options) {
        let realOpts = { replacedWith: options && (options.nodeType == null ? options.widget : options),
            insertLeft: options && options.insertLeft,
            clearWhenEmpty: false, shared: options && options.shared,
            handleMouseEvents: options && options.handleMouseEvents };
        pos = clipPos(this, pos);
        return markText(this, pos, pos, realOpts, "bookmark");
    },
    findMarksAt: function (pos) {
        pos = clipPos(this, pos);
        let markers = [], spans = getLine(this, pos.line).markedSpans;
        if (spans)
            for (let i = 0; i < spans.length; ++i) {
                let span = spans[i];
                if ((span.from == null || span.from <= pos.ch) &&
                    (span.to == null || span.to >= pos.ch))
                    markers.push(span.marker.parent || span.marker);
            }
        return markers;
    },
    findMarks: function (from, to, filter) {
        from = clipPos(this, from);
        to = clipPos(this, to);
        let found = [], lineNo = from.line;
        this.iter(from.line, to.line + 1, line => {
            let spans = line.markedSpans;
            if (spans)
                for (let i = 0; i < spans.length; i++) {
                    let span = spans[i];
                    if (!(span.to != null && lineNo == from.line && from.ch >= span.to ||
                        span.from == null && lineNo != from.line ||
                        span.from != null && lineNo == to.line && span.from >= to.ch) &&
                        (!filter || filter(span.marker)))
                        found.push(span.marker.parent || span.marker);
                }
            ++lineNo;
        });
        return found;
    },
    getAllMarks: function () {
        let markers = [];
        this.iter(line => {
            let sps = line.markedSpans;
            if (sps)
                for (let i = 0; i < sps.length; ++i)
                    if (sps[i].from != null)
                        markers.push(sps[i].marker);
        });
        return markers;
    },
    posFromIndex: function (off) {
        let ch, lineNo = this.first, sepSize = this.lineSeparator().length;
        this.iter(line => {
            let sz = line.text.length + sepSize;
            if (sz > off) {
                ch = off;
                return true;
            }
            off -= sz;
            ++lineNo;
        });
        return clipPos(this, Pos(lineNo, ch));
    },
    indexFromPos: function (coords) {
        coords = clipPos(this, coords);
        let index = coords.ch;
        if (coords.line < this.first || coords.ch < 0)
            return 0;
        let sepSize = this.lineSeparator().length;
        this.iter(this.first, coords.line, line => {
            index += line.text.length + sepSize;
        });
        return index;
    },
    copy: function (copyHistory) {
        let doc = new Doc(getLines(this, this.first, this.first + this.size), this.modeOption, this.first, this.lineSep, this.direction);
        doc.scrollTop = this.scrollTop;
        doc.scrollLeft = this.scrollLeft;
        doc.sel = this.sel;
        doc.extend = false;
        if (copyHistory) {
            doc.history.undoDepth = this.history.undoDepth;
            doc.setHistory(this.getHistory());
        }
        return doc;
    },
    linkedDoc: function (options) {
        if (!options)
            options = {};
        let from = this.first, to = this.first + this.size;
        if (options.from != null && options.from > from)
            from = options.from;
        if (options.to != null && options.to < to)
            to = options.to;
        let copy = new Doc(getLines(this, from, to), options.mode || this.modeOption, from, this.lineSep, this.direction);
        if (options.sharedHist)
            copy.history = this.history;
        (this.linked || (this.linked = [])).push({ doc: copy, sharedHist: options.sharedHist });
        copy.linked = [{ doc: this, isParent: true, sharedHist: options.sharedHist }];
        copySharedMarkers(copy, findSharedMarkers(this));
        return copy;
    },
    unlinkDoc: function (other) {
        if (other instanceof CodeMirror)
            other = other.doc;
        if (this.linked)
            for (let i = 0; i < this.linked.length; ++i) {
                let link = this.linked[i];
                if (link.doc != other)
                    continue;
                this.linked.splice(i, 1);
                other.unlinkDoc(this);
                detachSharedMarkers(findSharedMarkers(this));
                break;
            }
        // If the histories were shared, split them again
        if (other.history == this.history) {
            let splitIds = [other.id];
            linkedDocs(other, doc => splitIds.push(doc.id), true);
            other.history = new History(null);
            other.history.done = copyHistoryArray(this.history.done, splitIds);
            other.history.undone = copyHistoryArray(this.history.undone, splitIds);
        }
    },
    iterLinkedDocs: function (f) { linkedDocs(this, f); },
    getMode: function () { return this.mode; },
    getEditor: function () { return this.cm; },
    splitLines: function (str) {
        if (this.lineSep)
            return str.split(this.lineSep);
        return splitLinesAuto(str);
    },
    lineSeparator: function () { return this.lineSep || "\n"; },
    setDirection: docMethodOp(function (dir) {
        if (dir != "rtl")
            dir = "ltr";
        if (dir == this.direction)
            return;
        this.direction = dir;
        this.iter(line => line.order = null);
        if (this.cm)
            directionChanged(this.cm);
    })
});
// Public alias.
Doc.prototype.eachLine = Doc.prototype.iter;
export default Doc;
//# sourceMappingURL=Doc.js.map