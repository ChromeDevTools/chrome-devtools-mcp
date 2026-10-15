import { startWorker } from "../display/highlight_worker.js";
import { operation } from "../display/operations.js";
import { regChange, regLineChange } from "../display/view_tracking.js";
import { retreatFrontier } from "../line/highlight.js";
import { clipLine, clipPos, cmp, Pos } from "../line/pos.js";
import { sawReadOnlySpans } from "../line/saw_special_spans.js";
import { lineLength, removeReadOnlyRanges, stretchSpansOverChange, visualLine } from "../line/spans.js";
import { getBetween, getLine, lineNo } from "../line/utils_line.js";
import { estimateHeight } from "../measurement/position_measurement.js";
import { hasHandler, signal, signalCursorActivity } from "../util/event.js";
import { indexOf, lst, map, sel_dontScroll } from "../util/misc.js";
import { signalLater } from "../util/operation_group.js";
import { changeEnd, computeSelAfterChange } from "./change_measurement.js";
import { isWholeLineUpdate, linkedDocs, updateDoc } from "./document_data.js";
import { addChangeToHistory, historyChangeFromChange, mergeOldSpans, pushSelectionToHistory } from "./history.js";
import { Range, Selection } from "./selection.js";
import { setSelection, setSelectionNoUndo, skipAtomic } from "./selection_updates.js";
// UPDATING
// Allow "beforeChange" event handlers to influence a change
function filterChange(doc, change, update) {
    let obj = {
        canceled: false,
        from: change.from,
        to: change.to,
        text: change.text,
        origin: change.origin,
        cancel: () => obj.canceled = true
    };
    if (update)
        obj.update = (from, to, text, origin) => {
            if (from)
                obj.from = clipPos(doc, from);
            if (to)
                obj.to = clipPos(doc, to);
            if (text)
                obj.text = text;
            if (origin !== undefined)
                obj.origin = origin;
        };
    signal(doc, "beforeChange", doc, obj);
    if (doc.cm)
        signal(doc.cm, "beforeChange", doc.cm, obj);
    if (obj.canceled) {
        if (doc.cm)
            doc.cm.curOp.updateInput = 2;
        return null;
    }
    return { from: obj.from, to: obj.to, text: obj.text, origin: obj.origin };
}
// Apply a change to a document, and add it to the document's
// history, and propagating it to all linked documents.
export function makeChange(doc, change, ignoreReadOnly) {
    if (doc.cm) {
        if (!doc.cm.curOp)
            return operation(doc.cm, makeChange)(doc, change, ignoreReadOnly);
        if (doc.cm.state.suppressEdits)
            return;
    }
    if (hasHandler(doc, "beforeChange") || doc.cm && hasHandler(doc.cm, "beforeChange")) {
        change = filterChange(doc, change, true);
        if (!change)
            return;
    }
    // Possibly split or suppress the update based on the presence
    // of read-only spans in its range.
    let split = sawReadOnlySpans && !ignoreReadOnly && removeReadOnlyRanges(doc, change.from, change.to);
    if (split) {
        for (let i = split.length - 1; i >= 0; --i)
            makeChangeInner(doc, { from: split[i].from, to: split[i].to, text: i ? [""] : change.text, origin: change.origin });
    }
    else {
        makeChangeInner(doc, change);
    }
}
function makeChangeInner(doc, change) {
    if (change.text.length == 1 && change.text[0] == "" && cmp(change.from, change.to) == 0)
        return;
    let selAfter = computeSelAfterChange(doc, change);
    addChangeToHistory(doc, change, selAfter, doc.cm ? doc.cm.curOp.id : NaN);
    makeChangeSingleDoc(doc, change, selAfter, stretchSpansOverChange(doc, change));
    let rebased = [];
    linkedDocs(doc, (doc, sharedHist) => {
        if (!sharedHist && indexOf(rebased, doc.history) == -1) {
            rebaseHist(doc.history, change);
            rebased.push(doc.history);
        }
        makeChangeSingleDoc(doc, change, null, stretchSpansOverChange(doc, change));
    });
}
// Revert a change stored in a document's history.
export function makeChangeFromHistory(doc, type, allowSelectionOnly) {
    let suppress = doc.cm && doc.cm.state.suppressEdits;
    if (suppress && !allowSelectionOnly)
        return;
    let hist = doc.history, event, selAfter = doc.sel;
    let source = type == "undo" ? hist.done : hist.undone, dest = type == "undo" ? hist.undone : hist.done;
    // Verify that there is a useable event (so that ctrl-z won't
    // needlessly clear selection events)
    let i = 0;
    for (; i < source.length; i++) {
        event = source[i];
        if (allowSelectionOnly ? event.ranges && !event.equals(doc.sel) : !event.ranges)
            break;
    }
    if (i == source.length)
        return;
    hist.lastOrigin = hist.lastSelOrigin = null;
    for (;;) {
        event = source.pop();
        if (event.ranges) {
            pushSelectionToHistory(event, dest);
            if (allowSelectionOnly && !event.equals(doc.sel)) {
                setSelection(doc, event, { clearRedo: false });
                return;
            }
            selAfter = event;
        }
        else if (suppress) {
            source.push(event);
            return;
        }
        else
            break;
    }
    // Build up a reverse change object to add to the opposite history
    // stack (redo when undoing, and vice versa).
    let antiChanges = [];
    pushSelectionToHistory(selAfter, dest);
    dest.push({ changes: antiChanges, generation: hist.generation });
    hist.generation = event.generation || ++hist.maxGeneration;
    let filter = hasHandler(doc, "beforeChange") || doc.cm && hasHandler(doc.cm, "beforeChange");
    for (let i = event.changes.length - 1; i >= 0; --i) {
        let change = event.changes[i];
        change.origin = type;
        if (filter && !filterChange(doc, change, false)) {
            source.length = 0;
            return;
        }
        antiChanges.push(historyChangeFromChange(doc, change));
        let after = i ? computeSelAfterChange(doc, change) : lst(source);
        makeChangeSingleDoc(doc, change, after, mergeOldSpans(doc, change));
        if (!i && doc.cm)
            doc.cm.scrollIntoView({ from: change.from, to: changeEnd(change) });
        let rebased = [];
        // Propagate to the linked documents
        linkedDocs(doc, (doc, sharedHist) => {
            if (!sharedHist && indexOf(rebased, doc.history) == -1) {
                rebaseHist(doc.history, change);
                rebased.push(doc.history);
            }
            makeChangeSingleDoc(doc, change, null, mergeOldSpans(doc, change));
        });
    }
}
// Sub-views need their line numbers shifted when text is added
// above or below them in the parent document.
function shiftDoc(doc, distance) {
    if (distance == 0)
        return;
    doc.first += distance;
    doc.sel = new Selection(map(doc.sel.ranges, range => new Range(Pos(range.anchor.line + distance, range.anchor.ch), Pos(range.head.line + distance, range.head.ch))), doc.sel.primIndex);
    if (doc.cm) {
        regChange(doc.cm, doc.first, doc.first - distance, distance);
        for (let d = doc.cm.display, l = d.viewFrom; l < d.viewTo; l++)
            regLineChange(doc.cm, l, "gutter");
    }
}
// More lower-level change function, handling only a single document
// (not linked ones).
function makeChangeSingleDoc(doc, change, selAfter, spans) {
    if (doc.cm && !doc.cm.curOp)
        return operation(doc.cm, makeChangeSingleDoc)(doc, change, selAfter, spans);
    if (change.to.line < doc.first) {
        shiftDoc(doc, change.text.length - 1 - (change.to.line - change.from.line));
        return;
    }
    if (change.from.line > doc.lastLine())
        return;
    // Clip the change to the size of this doc
    if (change.from.line < doc.first) {
        let shift = change.text.length - 1 - (doc.first - change.from.line);
        shiftDoc(doc, shift);
        change = { from: Pos(doc.first, 0), to: Pos(change.to.line + shift, change.to.ch),
            text: [lst(change.text)], origin: change.origin };
    }
    let last = doc.lastLine();
    if (change.to.line > last) {
        change = { from: change.from, to: Pos(last, getLine(doc, last).text.length),
            text: [change.text[0]], origin: change.origin };
    }
    change.removed = getBetween(doc, change.from, change.to);
    if (!selAfter)
        selAfter = computeSelAfterChange(doc, change);
    if (doc.cm)
        makeChangeSingleDocInEditor(doc.cm, change, spans);
    else
        updateDoc(doc, change, spans);
    setSelectionNoUndo(doc, selAfter, sel_dontScroll);
    if (doc.cantEdit && skipAtomic(doc, Pos(doc.firstLine(), 0)))
        doc.cantEdit = false;
}
// Handle the interaction of a change to a document with the editor
// that this document is part of.
function makeChangeSingleDocInEditor(cm, change, spans) {
    let doc = cm.doc, display = cm.display, from = change.from, to = change.to;
    let recomputeMaxLength = false, checkWidthStart = from.line;
    if (!cm.options.lineWrapping) {
        checkWidthStart = lineNo(visualLine(getLine(doc, from.line)));
        doc.iter(checkWidthStart, to.line + 1, line => {
            if (line == display.maxLine) {
                recomputeMaxLength = true;
                return true;
            }
        });
    }
    if (doc.sel.contains(change.from, change.to) > -1)
        signalCursorActivity(cm);
    updateDoc(doc, change, spans, estimateHeight(cm));
    if (!cm.options.lineWrapping) {
        doc.iter(checkWidthStart, from.line + change.text.length, line => {
            let len = lineLength(line);
            if (len > display.maxLineLength) {
                display.maxLine = line;
                display.maxLineLength = len;
                display.maxLineChanged = true;
                recomputeMaxLength = false;
            }
        });
        if (recomputeMaxLength)
            cm.curOp.updateMaxLine = true;
    }
    retreatFrontier(doc, from.line);
    startWorker(cm, 400);
    let lendiff = change.text.length - (to.line - from.line) - 1;
    // Remember that these lines changed, for updating the display
    if (change.full)
        regChange(cm);
    else if (from.line == to.line && change.text.length == 1 && !isWholeLineUpdate(cm.doc, change))
        regLineChange(cm, from.line, "text");
    else
        regChange(cm, from.line, to.line + 1, lendiff);
    let changesHandler = hasHandler(cm, "changes"), changeHandler = hasHandler(cm, "change");
    if (changeHandler || changesHandler) {
        let obj = {
            from: from, to: to,
            text: change.text,
            removed: change.removed,
            origin: change.origin
        };
        if (changeHandler)
            signalLater(cm, "change", cm, obj);
        if (changesHandler)
            (cm.curOp.changeObjs || (cm.curOp.changeObjs = [])).push(obj);
    }
    cm.display.selForContextMenu = null;
}
export function replaceRange(doc, code, from, to, origin) {
    if (!to)
        to = from;
    if (cmp(to, from) < 0)
        [from, to] = [to, from];
    if (typeof code == "string")
        code = doc.splitLines(code);
    makeChange(doc, { from, to, text: code, origin });
}
// Rebasing/resetting history to deal with externally-sourced changes
function rebaseHistSelSingle(pos, from, to, diff) {
    if (to < pos.line) {
        pos.line += diff;
    }
    else if (from < pos.line) {
        pos.line = from;
        pos.ch = 0;
    }
}
// Tries to rebase an array of history events given a change in the
// document. If the change touches the same lines as the event, the
// event, and everything 'behind' it, is discarded. If the change is
// before the event, the event's positions are updated. Uses a
// copy-on-write scheme for the positions, to avoid having to
// reallocate them all on every rebase, but also avoid problems with
// shared position objects being unsafely updated.
function rebaseHistArray(array, from, to, diff) {
    for (let i = 0; i < array.length; ++i) {
        let sub = array[i], ok = true;
        if (sub.ranges) {
            if (!sub.copied) {
                sub = array[i] = sub.deepCopy();
                sub.copied = true;
            }
            for (let j = 0; j < sub.ranges.length; j++) {
                rebaseHistSelSingle(sub.ranges[j].anchor, from, to, diff);
                rebaseHistSelSingle(sub.ranges[j].head, from, to, diff);
            }
            continue;
        }
        for (let j = 0; j < sub.changes.length; ++j) {
            let cur = sub.changes[j];
            if (to < cur.from.line) {
                cur.from = Pos(cur.from.line + diff, cur.from.ch);
                cur.to = Pos(cur.to.line + diff, cur.to.ch);
            }
            else if (from <= cur.to.line) {
                ok = false;
                break;
            }
        }
        if (!ok) {
            array.splice(0, i + 1);
            i = 0;
        }
    }
}
function rebaseHist(hist, change) {
    let from = change.from.line, to = change.to.line, diff = change.text.length - (to - from) - 1;
    rebaseHistArray(hist.done, from, to, diff);
    rebaseHistArray(hist.undone, from, to, diff);
}
// Utility for applying a change to a line by handle or number,
// returning the number and optionally registering the line as
// changed.
export function changeLine(doc, handle, changeType, op) {
    let no = handle, line = handle;
    if (typeof handle == "number")
        line = getLine(doc, clipLine(doc, handle));
    else
        no = lineNo(handle);
    if (no == null)
        return null;
    if (op(line, no) && doc.cm)
        regLineChange(doc.cm, no, changeType);
    return line;
}
//# sourceMappingURL=changes.js.map