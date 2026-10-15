import { getLine } from "./utils_line.js";
// A Pos instance represents a position within the text.
export function Pos(line, ch, sticky = null) {
    if (!(this instanceof Pos))
        return new Pos(line, ch, sticky);
    this.line = line;
    this.ch = ch;
    this.sticky = sticky;
}
// Compare two positions, return 0 if they are the same, a negative
// number when a is less, and a positive number otherwise.
export function cmp(a, b) { return a.line - b.line || a.ch - b.ch; }
export function equalCursorPos(a, b) { return a.sticky == b.sticky && cmp(a, b) == 0; }
export function copyPos(x) { return Pos(x.line, x.ch); }
export function maxPos(a, b) { return cmp(a, b) < 0 ? b : a; }
export function minPos(a, b) { return cmp(a, b) < 0 ? a : b; }
// Most of the external API clips given positions to make sure they
// actually exist within the document.
export function clipLine(doc, n) { return Math.max(doc.first, Math.min(n, doc.first + doc.size - 1)); }
export function clipPos(doc, pos) {
    if (pos.line < doc.first)
        return Pos(doc.first, 0);
    let last = doc.first + doc.size - 1;
    if (pos.line > last)
        return Pos(last, getLine(doc, last).text.length);
    return clipToLen(pos, getLine(doc, pos.line).text.length);
}
function clipToLen(pos, linelen) {
    let ch = pos.ch;
    if (ch == null || ch > linelen)
        return Pos(pos.line, linelen);
    else if (ch < 0)
        return Pos(pos.line, 0);
    else
        return pos;
}
export function clipPosArray(doc, array) {
    let out = [];
    for (let i = 0; i < array.length; i++)
        out[i] = clipPos(doc, array[i]);
    return out;
}
//# sourceMappingURL=pos.js.map