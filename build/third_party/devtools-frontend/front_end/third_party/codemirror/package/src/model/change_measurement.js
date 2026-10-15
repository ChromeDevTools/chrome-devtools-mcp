import { cmp, Pos } from "../line/pos.js";
import { lst } from "../util/misc.js";
import { normalizeSelection, Range, Selection } from "./selection.js";
// Compute the position of the end of a change (its 'to' property
// refers to the pre-change end).
export function changeEnd(change) {
    if (!change.text)
        return change.to;
    return Pos(change.from.line + change.text.length - 1, lst(change.text).length + (change.text.length == 1 ? change.from.ch : 0));
}
// Adjust a position to refer to the post-change position of the
// same text, or the end of the change if the change covers it.
function adjustForChange(pos, change) {
    if (cmp(pos, change.from) < 0)
        return pos;
    if (cmp(pos, change.to) <= 0)
        return changeEnd(change);
    let line = pos.line + change.text.length - (change.to.line - change.from.line) - 1, ch = pos.ch;
    if (pos.line == change.to.line)
        ch += changeEnd(change).ch - change.to.ch;
    return Pos(line, ch);
}
export function computeSelAfterChange(doc, change) {
    let out = [];
    for (let i = 0; i < doc.sel.ranges.length; i++) {
        let range = doc.sel.ranges[i];
        out.push(new Range(adjustForChange(range.anchor, change), adjustForChange(range.head, change)));
    }
    return normalizeSelection(doc.cm, out, doc.sel.primIndex);
}
function offsetPos(pos, old, nw) {
    if (pos.line == old.line)
        return Pos(nw.line, pos.ch - old.ch + nw.ch);
    else
        return Pos(nw.line + (pos.line - old.line), pos.ch);
}
// Used by replaceSelections to allow moving the selection to the
// start or around the replaced test. Hint may be "start" or "around".
export function computeReplacedSel(doc, changes, hint) {
    let out = [];
    let oldPrev = Pos(doc.first, 0), newPrev = oldPrev;
    for (let i = 0; i < changes.length; i++) {
        let change = changes[i];
        let from = offsetPos(change.from, oldPrev, newPrev);
        let to = offsetPos(changeEnd(change), oldPrev, newPrev);
        oldPrev = change.to;
        newPrev = to;
        if (hint == "around") {
            let range = doc.sel.ranges[i], inv = cmp(range.head, range.anchor) < 0;
            out[i] = new Range(inv ? to : from, inv ? from : to);
        }
        else {
            out[i] = new Range(from, from);
        }
    }
    return new Selection(out, doc.sel.primIndex);
}
//# sourceMappingURL=change_measurement.js.map