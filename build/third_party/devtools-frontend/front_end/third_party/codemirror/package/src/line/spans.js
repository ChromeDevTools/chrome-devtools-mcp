import { indexOf, lst } from "../util/misc.js";
import { cmp } from "./pos.js";
import { sawCollapsedSpans } from "./saw_special_spans.js";
import { getLine, isLine, lineNo } from "./utils_line.js";
// TEXTMARKER SPANS
export function MarkedSpan(marker, from, to) {
    this.marker = marker;
    this.from = from;
    this.to = to;
}
// Search an array of spans for a span matching the given marker.
export function getMarkedSpanFor(spans, marker) {
    if (spans)
        for (let i = 0; i < spans.length; ++i) {
            let span = spans[i];
            if (span.marker == marker)
                return span;
        }
}
// Remove a span from an array, returning undefined if no spans are
// left (we don't store arrays for lines without spans).
export function removeMarkedSpan(spans, span) {
    let r;
    for (let i = 0; i < spans.length; ++i)
        if (spans[i] != span)
            (r || (r = [])).push(spans[i]);
    return r;
}
// Add a span to a line.
export function addMarkedSpan(line, span) {
    line.markedSpans = line.markedSpans ? line.markedSpans.concat([span]) : [span];
    span.marker.attachLine(line);
}
// Used for the algorithm that adjusts markers for a change in the
// document. These functions cut an array of spans at a given
// character position, returning an array of remaining chunks (or
// undefined if nothing remains).
function markedSpansBefore(old, startCh, isInsert) {
    let nw;
    if (old)
        for (let i = 0; i < old.length; ++i) {
            let span = old[i], marker = span.marker;
            let startsBefore = span.from == null || (marker.inclusiveLeft ? span.from <= startCh : span.from < startCh);
            if (startsBefore || span.from == startCh && marker.type == "bookmark" && (!isInsert || !span.marker.insertLeft)) {
                let endsAfter = span.to == null || (marker.inclusiveRight ? span.to >= startCh : span.to > startCh);
                (nw || (nw = [])).push(new MarkedSpan(marker, span.from, endsAfter ? null : span.to));
            }
        }
    return nw;
}
function markedSpansAfter(old, endCh, isInsert) {
    let nw;
    if (old)
        for (let i = 0; i < old.length; ++i) {
            let span = old[i], marker = span.marker;
            let endsAfter = span.to == null || (marker.inclusiveRight ? span.to >= endCh : span.to > endCh);
            if (endsAfter || span.from == endCh && marker.type == "bookmark" && (!isInsert || span.marker.insertLeft)) {
                let startsBefore = span.from == null || (marker.inclusiveLeft ? span.from <= endCh : span.from < endCh);
                (nw || (nw = [])).push(new MarkedSpan(marker, startsBefore ? null : span.from - endCh, span.to == null ? null : span.to - endCh));
            }
        }
    return nw;
}
// Given a change object, compute the new set of marker spans that
// cover the line in which the change took place. Removes spans
// entirely within the change, reconnects spans belonging to the
// same marker that appear on both sides of the change, and cuts off
// spans partially within the change. Returns an array of span
// arrays with one element for each line in (after) the change.
export function stretchSpansOverChange(doc, change) {
    if (change.full)
        return null;
    let oldFirst = isLine(doc, change.from.line) && getLine(doc, change.from.line).markedSpans;
    let oldLast = isLine(doc, change.to.line) && getLine(doc, change.to.line).markedSpans;
    if (!oldFirst && !oldLast)
        return null;
    let startCh = change.from.ch, endCh = change.to.ch, isInsert = cmp(change.from, change.to) == 0;
    // Get the spans that 'stick out' on both sides
    let first = markedSpansBefore(oldFirst, startCh, isInsert);
    let last = markedSpansAfter(oldLast, endCh, isInsert);
    // Next, merge those two ends
    let sameLine = change.text.length == 1, offset = lst(change.text).length + (sameLine ? startCh : 0);
    if (first) {
        // Fix up .to properties of first
        for (let i = 0; i < first.length; ++i) {
            let span = first[i];
            if (span.to == null) {
                let found = getMarkedSpanFor(last, span.marker);
                if (!found)
                    span.to = startCh;
                else if (sameLine)
                    span.to = found.to == null ? null : found.to + offset;
            }
        }
    }
    if (last) {
        // Fix up .from in last (or move them into first in case of sameLine)
        for (let i = 0; i < last.length; ++i) {
            let span = last[i];
            if (span.to != null)
                span.to += offset;
            if (span.from == null) {
                let found = getMarkedSpanFor(first, span.marker);
                if (!found) {
                    span.from = offset;
                    if (sameLine)
                        (first || (first = [])).push(span);
                }
            }
            else {
                span.from += offset;
                if (sameLine)
                    (first || (first = [])).push(span);
            }
        }
    }
    // Make sure we didn't create any zero-length spans
    if (first)
        first = clearEmptySpans(first);
    if (last && last != first)
        last = clearEmptySpans(last);
    let newMarkers = [first];
    if (!sameLine) {
        // Fill gap with whole-line-spans
        let gap = change.text.length - 2, gapMarkers;
        if (gap > 0 && first)
            for (let i = 0; i < first.length; ++i)
                if (first[i].to == null)
                    (gapMarkers || (gapMarkers = [])).push(new MarkedSpan(first[i].marker, null, null));
        for (let i = 0; i < gap; ++i)
            newMarkers.push(gapMarkers);
        newMarkers.push(last);
    }
    return newMarkers;
}
// Remove spans that are empty and don't have a clearWhenEmpty
// option of false.
function clearEmptySpans(spans) {
    for (let i = 0; i < spans.length; ++i) {
        let span = spans[i];
        if (span.from != null && span.from == span.to && span.marker.clearWhenEmpty !== false)
            spans.splice(i--, 1);
    }
    if (!spans.length)
        return null;
    return spans;
}
// Used to 'clip' out readOnly ranges when making a change.
export function removeReadOnlyRanges(doc, from, to) {
    let markers = null;
    doc.iter(from.line, to.line + 1, line => {
        if (line.markedSpans)
            for (let i = 0; i < line.markedSpans.length; ++i) {
                let mark = line.markedSpans[i].marker;
                if (mark.readOnly && (!markers || indexOf(markers, mark) == -1))
                    (markers || (markers = [])).push(mark);
            }
    });
    if (!markers)
        return null;
    let parts = [{ from: from, to: to }];
    for (let i = 0; i < markers.length; ++i) {
        let mk = markers[i], m = mk.find(0);
        for (let j = 0; j < parts.length; ++j) {
            let p = parts[j];
            if (cmp(p.to, m.from) < 0 || cmp(p.from, m.to) > 0)
                continue;
            let newParts = [j, 1], dfrom = cmp(p.from, m.from), dto = cmp(p.to, m.to);
            if (dfrom < 0 || !mk.inclusiveLeft && !dfrom)
                newParts.push({ from: p.from, to: m.from });
            if (dto > 0 || !mk.inclusiveRight && !dto)
                newParts.push({ from: m.to, to: p.to });
            parts.splice.apply(parts, newParts);
            j += newParts.length - 3;
        }
    }
    return parts;
}
// Connect or disconnect spans from a line.
export function detachMarkedSpans(line) {
    let spans = line.markedSpans;
    if (!spans)
        return;
    for (let i = 0; i < spans.length; ++i)
        spans[i].marker.detachLine(line);
    line.markedSpans = null;
}
export function attachMarkedSpans(line, spans) {
    if (!spans)
        return;
    for (let i = 0; i < spans.length; ++i)
        spans[i].marker.attachLine(line);
    line.markedSpans = spans;
}
// Helpers used when computing which overlapping collapsed span
// counts as the larger one.
function extraLeft(marker) { return marker.inclusiveLeft ? -1 : 0; }
function extraRight(marker) { return marker.inclusiveRight ? 1 : 0; }
// Returns a number indicating which of two overlapping collapsed
// spans is larger (and thus includes the other). Falls back to
// comparing ids when the spans cover exactly the same range.
export function compareCollapsedMarkers(a, b) {
    let lenDiff = a.lines.length - b.lines.length;
    if (lenDiff != 0)
        return lenDiff;
    let aPos = a.find(), bPos = b.find();
    let fromCmp = cmp(aPos.from, bPos.from) || extraLeft(a) - extraLeft(b);
    if (fromCmp)
        return -fromCmp;
    let toCmp = cmp(aPos.to, bPos.to) || extraRight(a) - extraRight(b);
    if (toCmp)
        return toCmp;
    return b.id - a.id;
}
// Find out whether a line ends or starts in a collapsed span. If
// so, return the marker for that span.
function collapsedSpanAtSide(line, start) {
    let sps = sawCollapsedSpans && line.markedSpans, found;
    if (sps)
        for (let sp, i = 0; i < sps.length; ++i) {
            sp = sps[i];
            if (sp.marker.collapsed && (start ? sp.from : sp.to) == null &&
                (!found || compareCollapsedMarkers(found, sp.marker) < 0))
                found = sp.marker;
        }
    return found;
}
export function collapsedSpanAtStart(line) { return collapsedSpanAtSide(line, true); }
export function collapsedSpanAtEnd(line) { return collapsedSpanAtSide(line, false); }
export function collapsedSpanAround(line, ch) {
    let sps = sawCollapsedSpans && line.markedSpans, found;
    if (sps)
        for (let i = 0; i < sps.length; ++i) {
            let sp = sps[i];
            if (sp.marker.collapsed && (sp.from == null || sp.from < ch) && (sp.to == null || sp.to > ch) &&
                (!found || compareCollapsedMarkers(found, sp.marker) < 0))
                found = sp.marker;
        }
    return found;
}
// Test whether there exists a collapsed span that partially
// overlaps (covers the start or end, but not both) of a new span.
// Such overlap is not allowed.
export function conflictingCollapsedRange(doc, lineNo, from, to, marker) {
    let line = getLine(doc, lineNo);
    let sps = sawCollapsedSpans && line.markedSpans;
    if (sps)
        for (let i = 0; i < sps.length; ++i) {
            let sp = sps[i];
            if (!sp.marker.collapsed)
                continue;
            let found = sp.marker.find(0);
            let fromCmp = cmp(found.from, from) || extraLeft(sp.marker) - extraLeft(marker);
            let toCmp = cmp(found.to, to) || extraRight(sp.marker) - extraRight(marker);
            if (fromCmp >= 0 && toCmp <= 0 || fromCmp <= 0 && toCmp >= 0)
                continue;
            if (fromCmp <= 0 && (sp.marker.inclusiveRight && marker.inclusiveLeft ? cmp(found.to, from) >= 0 : cmp(found.to, from) > 0) ||
                fromCmp >= 0 && (sp.marker.inclusiveRight && marker.inclusiveLeft ? cmp(found.from, to) <= 0 : cmp(found.from, to) < 0))
                return true;
        }
}
// A visual line is a line as drawn on the screen. Folding, for
// example, can cause multiple logical lines to appear on the same
// visual line. This finds the start of the visual line that the
// given line is part of (usually that is the line itself).
export function visualLine(line) {
    let merged;
    while (merged = collapsedSpanAtStart(line))
        line = merged.find(-1, true).line;
    return line;
}
export function visualLineEnd(line) {
    let merged;
    while (merged = collapsedSpanAtEnd(line))
        line = merged.find(1, true).line;
    return line;
}
// Returns an array of logical lines that continue the visual line
// started by the argument, or undefined if there are no such lines.
export function visualLineContinued(line) {
    let merged, lines;
    while (merged = collapsedSpanAtEnd(line)) {
        line = merged.find(1, true).line;
        (lines || (lines = [])).push(line);
    }
    return lines;
}
// Get the line number of the start of the visual line that the
// given line number is part of.
export function visualLineNo(doc, lineN) {
    let line = getLine(doc, lineN), vis = visualLine(line);
    if (line == vis)
        return lineN;
    return lineNo(vis);
}
// Get the line number of the start of the next visual line after
// the given line.
export function visualLineEndNo(doc, lineN) {
    if (lineN > doc.lastLine())
        return lineN;
    let line = getLine(doc, lineN), merged;
    if (!lineIsHidden(doc, line))
        return lineN;
    while (merged = collapsedSpanAtEnd(line))
        line = merged.find(1, true).line;
    return lineNo(line) + 1;
}
// Compute whether a line is hidden. Lines count as hidden when they
// are part of a visual line that starts with another line, or when
// they are entirely covered by collapsed, non-widget span.
export function lineIsHidden(doc, line) {
    let sps = sawCollapsedSpans && line.markedSpans;
    if (sps)
        for (let sp, i = 0; i < sps.length; ++i) {
            sp = sps[i];
            if (!sp.marker.collapsed)
                continue;
            if (sp.from == null)
                return true;
            if (sp.marker.widgetNode)
                continue;
            if (sp.from == 0 && sp.marker.inclusiveLeft && lineIsHiddenInner(doc, line, sp))
                return true;
        }
}
function lineIsHiddenInner(doc, line, span) {
    if (span.to == null) {
        let end = span.marker.find(1, true);
        return lineIsHiddenInner(doc, end.line, getMarkedSpanFor(end.line.markedSpans, span.marker));
    }
    if (span.marker.inclusiveRight && span.to == line.text.length)
        return true;
    for (let sp, i = 0; i < line.markedSpans.length; ++i) {
        sp = line.markedSpans[i];
        if (sp.marker.collapsed && !sp.marker.widgetNode && sp.from == span.to &&
            (sp.to == null || sp.to != span.from) &&
            (sp.marker.inclusiveLeft || span.marker.inclusiveRight) &&
            lineIsHiddenInner(doc, line, sp))
            return true;
    }
}
// Find the height above the given line.
export function heightAtLine(lineObj) {
    lineObj = visualLine(lineObj);
    let h = 0, chunk = lineObj.parent;
    for (let i = 0; i < chunk.lines.length; ++i) {
        let line = chunk.lines[i];
        if (line == lineObj)
            break;
        else
            h += line.height;
    }
    for (let p = chunk.parent; p; chunk = p, p = chunk.parent) {
        for (let i = 0; i < p.children.length; ++i) {
            let cur = p.children[i];
            if (cur == chunk)
                break;
            else
                h += cur.height;
        }
    }
    return h;
}
// Compute the character length of a line, taking into account
// collapsed ranges (see markText) that might hide parts, and join
// other lines onto it.
export function lineLength(line) {
    if (line.height == 0)
        return 0;
    let len = line.text.length, merged, cur = line;
    while (merged = collapsedSpanAtStart(cur)) {
        let found = merged.find(0, true);
        cur = found.from.line;
        len += found.from.ch - found.to.ch;
    }
    cur = line;
    while (merged = collapsedSpanAtEnd(cur)) {
        let found = merged.find(0, true);
        len -= cur.text.length - found.from.ch;
        cur = found.to.line;
        len += cur.text.length - found.to.ch;
    }
    return len;
}
// Find the longest line in the document.
export function findMaxLine(cm) {
    let d = cm.display, doc = cm.doc;
    d.maxLine = getLine(doc, doc.first);
    d.maxLineLength = lineLength(d.maxLine);
    d.maxLineChanged = true;
    doc.iter(line => {
        let len = lineLength(line);
        if (len > d.maxLineLength) {
            d.maxLineLength = len;
            d.maxLine = line;
        }
    });
}
//# sourceMappingURL=spans.js.map