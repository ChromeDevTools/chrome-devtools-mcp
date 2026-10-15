import { cmp, copyPos } from "../line/pos.js";
import { stretchSpansOverChange } from "../line/spans.js";
import { getBetween } from "../line/utils_line.js";
import { signal } from "../util/event.js";
import { indexOf, lst } from "../util/misc.js";
import { changeEnd } from "./change_measurement.js";
import { linkedDocs } from "./document_data.js";
import { Selection } from "./selection.js";
export function History(prev) {
    // Arrays of change events and selections. Doing something adds an
    // event to done and clears undo. Undoing moves events from done
    // to undone, redoing moves them in the other direction.
    this.done = [];
    this.undone = [];
    this.undoDepth = prev ? prev.undoDepth : Infinity;
    // Used to track when changes can be merged into a single undo
    // event
    this.lastModTime = this.lastSelTime = 0;
    this.lastOp = this.lastSelOp = null;
    this.lastOrigin = this.lastSelOrigin = null;
    // Used by the isClean() method
    this.generation = this.maxGeneration = prev ? prev.maxGeneration : 1;
}
// Create a history change event from an updateDoc-style change
// object.
export function historyChangeFromChange(doc, change) {
    let histChange = { from: copyPos(change.from), to: changeEnd(change), text: getBetween(doc, change.from, change.to) };
    attachLocalSpans(doc, histChange, change.from.line, change.to.line + 1);
    linkedDocs(doc, doc => attachLocalSpans(doc, histChange, change.from.line, change.to.line + 1), true);
    return histChange;
}
// Pop all selection events off the end of a history array. Stop at
// a change event.
function clearSelectionEvents(array) {
    while (array.length) {
        let last = lst(array);
        if (last.ranges)
            array.pop();
        else
            break;
    }
}
// Find the top change event in the history. Pop off selection
// events that are in the way.
function lastChangeEvent(hist, force) {
    if (force) {
        clearSelectionEvents(hist.done);
        return lst(hist.done);
    }
    else if (hist.done.length && !lst(hist.done).ranges) {
        return lst(hist.done);
    }
    else if (hist.done.length > 1 && !hist.done[hist.done.length - 2].ranges) {
        hist.done.pop();
        return lst(hist.done);
    }
}
// Register a change in the history. Merges changes that are within
// a single operation, or are close together with an origin that
// allows merging (starting with "+") into a single event.
export function addChangeToHistory(doc, change, selAfter, opId) {
    let hist = doc.history;
    hist.undone.length = 0;
    let time = +new Date, cur;
    let last;
    if ((hist.lastOp == opId ||
        hist.lastOrigin == change.origin && change.origin &&
            ((change.origin.charAt(0) == "+" && hist.lastModTime > time - (doc.cm ? doc.cm.options.historyEventDelay : 500)) ||
                change.origin.charAt(0) == "*")) &&
        (cur = lastChangeEvent(hist, hist.lastOp == opId))) {
        // Merge this change into the last event
        last = lst(cur.changes);
        if (cmp(change.from, change.to) == 0 && cmp(change.from, last.to) == 0) {
            // Optimized case for simple insertion -- don't want to add
            // new changesets for every character typed
            last.to = changeEnd(change);
        }
        else {
            // Add new sub-event
            cur.changes.push(historyChangeFromChange(doc, change));
        }
    }
    else {
        // Can not be merged, start a new event.
        let before = lst(hist.done);
        if (!before || !before.ranges)
            pushSelectionToHistory(doc.sel, hist.done);
        cur = { changes: [historyChangeFromChange(doc, change)],
            generation: hist.generation };
        hist.done.push(cur);
        while (hist.done.length > hist.undoDepth) {
            hist.done.shift();
            if (!hist.done[0].ranges)
                hist.done.shift();
        }
    }
    hist.done.push(selAfter);
    hist.generation = ++hist.maxGeneration;
    hist.lastModTime = hist.lastSelTime = time;
    hist.lastOp = hist.lastSelOp = opId;
    hist.lastOrigin = hist.lastSelOrigin = change.origin;
    if (!last)
        signal(doc, "historyAdded");
}
function selectionEventCanBeMerged(doc, origin, prev, sel) {
    let ch = origin.charAt(0);
    return ch == "*" ||
        ch == "+" &&
            prev.ranges.length == sel.ranges.length &&
            prev.somethingSelected() == sel.somethingSelected() &&
            new Date - doc.history.lastSelTime <= (doc.cm ? doc.cm.options.historyEventDelay : 500);
}
// Called whenever the selection changes, sets the new selection as
// the pending selection in the history, and pushes the old pending
// selection into the 'done' array when it was significantly
// different (in number of selected ranges, emptiness, or time).
export function addSelectionToHistory(doc, sel, opId, options) {
    let hist = doc.history, origin = options && options.origin;
    // A new event is started when the previous origin does not match
    // the current, or the origins don't allow matching. Origins
    // starting with * are always merged, those starting with + are
    // merged when similar and close together in time.
    if (opId == hist.lastSelOp ||
        (origin && hist.lastSelOrigin == origin &&
            (hist.lastModTime == hist.lastSelTime && hist.lastOrigin == origin ||
                selectionEventCanBeMerged(doc, origin, lst(hist.done), sel))))
        hist.done[hist.done.length - 1] = sel;
    else
        pushSelectionToHistory(sel, hist.done);
    hist.lastSelTime = +new Date;
    hist.lastSelOrigin = origin;
    hist.lastSelOp = opId;
    if (options && options.clearRedo !== false)
        clearSelectionEvents(hist.undone);
}
export function pushSelectionToHistory(sel, dest) {
    let top = lst(dest);
    if (!(top && top.ranges && top.equals(sel)))
        dest.push(sel);
}
// Used to store marked span information in the history.
function attachLocalSpans(doc, change, from, to) {
    let existing = change["spans_" + doc.id], n = 0;
    doc.iter(Math.max(doc.first, from), Math.min(doc.first + doc.size, to), line => {
        if (line.markedSpans)
            (existing || (existing = change["spans_" + doc.id] = {}))[n] = line.markedSpans;
        ++n;
    });
}
// When un/re-doing restores text containing marked spans, those
// that have been explicitly cleared should not be restored.
function removeClearedSpans(spans) {
    if (!spans)
        return null;
    let out;
    for (let i = 0; i < spans.length; ++i) {
        if (spans[i].marker.explicitlyCleared) {
            if (!out)
                out = spans.slice(0, i);
        }
        else if (out)
            out.push(spans[i]);
    }
    return !out ? spans : out.length ? out : null;
}
// Retrieve and filter the old marked spans stored in a change event.
function getOldSpans(doc, change) {
    let found = change["spans_" + doc.id];
    if (!found)
        return null;
    let nw = [];
    for (let i = 0; i < change.text.length; ++i)
        nw.push(removeClearedSpans(found[i]));
    return nw;
}
// Used for un/re-doing changes from the history. Combines the
// result of computing the existing spans with the set of spans that
// existed in the history (so that deleting around a span and then
// undoing brings back the span).
export function mergeOldSpans(doc, change) {
    let old = getOldSpans(doc, change);
    let stretched = stretchSpansOverChange(doc, change);
    if (!old)
        return stretched;
    if (!stretched)
        return old;
    for (let i = 0; i < old.length; ++i) {
        let oldCur = old[i], stretchCur = stretched[i];
        if (oldCur && stretchCur) {
            spans: for (let j = 0; j < stretchCur.length; ++j) {
                let span = stretchCur[j];
                for (let k = 0; k < oldCur.length; ++k)
                    if (oldCur[k].marker == span.marker)
                        continue spans;
                oldCur.push(span);
            }
        }
        else if (stretchCur) {
            old[i] = stretchCur;
        }
    }
    return old;
}
// Used both to provide a JSON-safe object in .getHistory, and, when
// detaching a document, to split the history in two
export function copyHistoryArray(events, newGroup, instantiateSel) {
    let copy = [];
    for (let i = 0; i < events.length; ++i) {
        let event = events[i];
        if (event.ranges) {
            copy.push(instantiateSel ? Selection.prototype.deepCopy.call(event) : event);
            continue;
        }
        let changes = event.changes, newChanges = [];
        copy.push({ changes: newChanges });
        for (let j = 0; j < changes.length; ++j) {
            let change = changes[j], m;
            newChanges.push({ from: change.from, to: change.to, text: change.text });
            if (newGroup)
                for (var prop in change)
                    if (m = prop.match(/^spans_(\d+)$/)) {
                        if (indexOf(newGroup, Number(m[1])) > -1) {
                            lst(newChanges)[prop] = change[prop];
                            delete change[prop];
                        }
                    }
        }
    }
    return copy;
}
//# sourceMappingURL=history.js.map