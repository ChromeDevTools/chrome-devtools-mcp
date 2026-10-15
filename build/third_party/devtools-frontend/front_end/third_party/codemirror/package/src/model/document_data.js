import { loadMode } from "../display/mode_state.js";
import { runInOp } from "../display/operations.js";
import { regChange } from "../display/view_tracking.js";
import { Line, updateLine } from "../line/line_data.js";
import { findMaxLine } from "../line/spans.js";
import { getLine } from "../line/utils_line.js";
import { estimateLineHeights } from "../measurement/position_measurement.js";
import { addClass, rmClass } from "../util/dom.js";
import { lst } from "../util/misc.js";
import { signalLater } from "../util/operation_group.js";
// DOCUMENT DATA STRUCTURE
// By default, updates that start and end at the beginning of a line
// are treated specially, in order to make the association of line
// widgets and marker elements with the text behave more intuitive.
export function isWholeLineUpdate(doc, change) {
    return change.from.ch == 0 && change.to.ch == 0 && lst(change.text) == "" &&
        (!doc.cm || doc.cm.options.wholeLineUpdateBefore);
}
// Perform a change on the document data structure.
export function updateDoc(doc, change, markedSpans, estimateHeight) {
    function spansFor(n) { return markedSpans ? markedSpans[n] : null; }
    function update(line, text, spans) {
        updateLine(line, text, spans, estimateHeight);
        signalLater(line, "change", line, change);
    }
    function linesFor(start, end) {
        let result = [];
        for (let i = start; i < end; ++i)
            result.push(new Line(text[i], spansFor(i), estimateHeight));
        return result;
    }
    let from = change.from, to = change.to, text = change.text;
    let firstLine = getLine(doc, from.line), lastLine = getLine(doc, to.line);
    let lastText = lst(text), lastSpans = spansFor(text.length - 1), nlines = to.line - from.line;
    // Adjust the line structure
    if (change.full) {
        doc.insert(0, linesFor(0, text.length));
        doc.remove(text.length, doc.size - text.length);
    }
    else if (isWholeLineUpdate(doc, change)) {
        // This is a whole-line replace. Treated specially to make
        // sure line objects move the way they are supposed to.
        let added = linesFor(0, text.length - 1);
        update(lastLine, lastLine.text, lastSpans);
        if (nlines)
            doc.remove(from.line, nlines);
        if (added.length)
            doc.insert(from.line, added);
    }
    else if (firstLine == lastLine) {
        if (text.length == 1) {
            update(firstLine, firstLine.text.slice(0, from.ch) + lastText + firstLine.text.slice(to.ch), lastSpans);
        }
        else {
            let added = linesFor(1, text.length - 1);
            added.push(new Line(lastText + firstLine.text.slice(to.ch), lastSpans, estimateHeight));
            update(firstLine, firstLine.text.slice(0, from.ch) + text[0], spansFor(0));
            doc.insert(from.line + 1, added);
        }
    }
    else if (text.length == 1) {
        update(firstLine, firstLine.text.slice(0, from.ch) + text[0] + lastLine.text.slice(to.ch), spansFor(0));
        doc.remove(from.line + 1, nlines);
    }
    else {
        update(firstLine, firstLine.text.slice(0, from.ch) + text[0], spansFor(0));
        update(lastLine, lastText + lastLine.text.slice(to.ch), lastSpans);
        let added = linesFor(1, text.length - 1);
        if (nlines > 1)
            doc.remove(from.line + 1, nlines - 1);
        doc.insert(from.line + 1, added);
    }
    signalLater(doc, "change", doc, change);
}
// Call f for all linked documents.
export function linkedDocs(doc, f, sharedHistOnly) {
    function propagate(doc, skip, sharedHist) {
        if (doc.linked)
            for (let i = 0; i < doc.linked.length; ++i) {
                let rel = doc.linked[i];
                if (rel.doc == skip)
                    continue;
                let shared = sharedHist && rel.sharedHist;
                if (sharedHistOnly && !shared)
                    continue;
                f(rel.doc, shared);
                propagate(rel.doc, doc, shared);
            }
    }
    propagate(doc, null, true);
}
// Attach a document to an editor.
export function attachDoc(cm, doc) {
    if (doc.cm)
        throw new Error("This document is already in use.");
    cm.doc = doc;
    doc.cm = cm;
    estimateLineHeights(cm);
    loadMode(cm);
    setDirectionClass(cm);
    if (!cm.options.lineWrapping)
        findMaxLine(cm);
    cm.options.mode = doc.modeOption;
    regChange(cm);
}
function setDirectionClass(cm) {
    ;
    (cm.doc.direction == "rtl" ? addClass : rmClass)(cm.display.lineDiv, "CodeMirror-rtl");
}
export function directionChanged(cm) {
    runInOp(cm, () => {
        setDirectionClass(cm);
        regChange(cm);
    });
}
//# sourceMappingURL=document_data.js.map