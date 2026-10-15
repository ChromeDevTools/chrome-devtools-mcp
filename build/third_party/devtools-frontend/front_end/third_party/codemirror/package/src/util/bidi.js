import { lst } from "./misc.js";
// BIDI HELPERS
export function iterateBidiSections(order, from, to, f) {
    if (!order)
        return f(from, to, "ltr", 0);
    let found = false;
    for (let i = 0; i < order.length; ++i) {
        let part = order[i];
        if (part.from < to && part.to > from || from == to && part.to == from) {
            f(Math.max(part.from, from), Math.min(part.to, to), part.level == 1 ? "rtl" : "ltr", i);
            found = true;
        }
    }
    if (!found)
        f(from, to, "ltr");
}
export let bidiOther = null;
export function getBidiPartAt(order, ch, sticky) {
    let found;
    bidiOther = null;
    for (let i = 0; i < order.length; ++i) {
        let cur = order[i];
        if (cur.from < ch && cur.to > ch)
            return i;
        if (cur.to == ch) {
            if (cur.from != cur.to && sticky == "before")
                found = i;
            else
                bidiOther = i;
        }
        if (cur.from == ch) {
            if (cur.from != cur.to && sticky != "before")
                found = i;
            else
                bidiOther = i;
        }
    }
    return found != null ? found : bidiOther;
}
// Bidirectional ordering algorithm
// See http://unicode.org/reports/tr9/tr9-13.html for the algorithm
// that this (partially) implements.
// One-char codes used for character types:
// L (L):   Left-to-Right
// R (R):   Right-to-Left
// r (AL):  Right-to-Left Arabic
// 1 (EN):  European Number
// + (ES):  European Number Separator
// % (ET):  European Number Terminator
// n (AN):  Arabic Number
// , (CS):  Common Number Separator
// m (NSM): Non-Spacing Mark
// b (BN):  Boundary Neutral
// s (B):   Paragraph Separator
// t (S):   Segment Separator
// w (WS):  Whitespace
// N (ON):  Other Neutrals
// Returns null if characters are ordered as they appear
// (left-to-right), or an array of sections ({from, to, level}
// objects) in the order in which they occur visually.
let bidiOrdering = (function () {
    // Character types for codepoints 0 to 0xff
    let lowTypes = "bbbbbbbbbtstwsbbbbbbbbbbbbbbssstwNN%%%NNNNNN,N,N1111111111NNNNNNNLLLLLLLLLLLLLLLLLLLLLLLLLLNNNNNNLLLLLLLLLLLLLLLLLLLLLLLLLLNNNNbbbbbbsbbbbbbbbbbbbbbbbbbbbbbbbbb,N%%%%NNNNLNNNNN%%11NLNNN1LNNNNNLLLLLLLLLLLLLLLLLLLLLLLNLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLN";
    // Character types for codepoints 0x600 to 0x6f9
    let arabicTypes = "nnnnnnNNr%%r,rNNmmmmmmmmmmmrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrmmmmmmmmmmmmmmmmmmmmmnnnnnnnnnn%nnrrrmrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrmmmmmmmnNmmmmmmrrmmNmmmmrr1111111111";
    function charType(code) {
        if (code <= 0xf7)
            return lowTypes.charAt(code);
        else if (0x590 <= code && code <= 0x5f4)
            return "R";
        else if (0x600 <= code && code <= 0x6f9)
            return arabicTypes.charAt(code - 0x600);
        else if (0x6ee <= code && code <= 0x8ac)
            return "r";
        else if (0x2000 <= code && code <= 0x200b)
            return "w";
        else if (code == 0x200c)
            return "b";
        else
            return "L";
    }
    let bidiRE = /[\u0590-\u05f4\u0600-\u06ff\u0700-\u08ac]/;
    let isNeutral = /[stwN]/, isStrong = /[LRr]/, countsAsLeft = /[Lb1n]/, countsAsNum = /[1n]/;
    function BidiSpan(level, from, to) {
        this.level = level;
        this.from = from;
        this.to = to;
    }
    return function (str, direction) {
        let outerType = direction == "ltr" ? "L" : "R";
        if (str.length == 0 || direction == "ltr" && !bidiRE.test(str))
            return false;
        let len = str.length, types = [];
        for (let i = 0; i < len; ++i)
            types.push(charType(str.charCodeAt(i)));
        // W1. Examine each non-spacing mark (NSM) in the level run, and
        // change the type of the NSM to the type of the previous
        // character. If the NSM is at the start of the level run, it will
        // get the type of sor.
        for (let i = 0, prev = outerType; i < len; ++i) {
            let type = types[i];
            if (type == "m")
                types[i] = prev;
            else
                prev = type;
        }
        // W2. Search backwards from each instance of a European number
        // until the first strong type (R, L, AL, or sor) is found. If an
        // AL is found, change the type of the European number to Arabic
        // number.
        // W3. Change all ALs to R.
        for (let i = 0, cur = outerType; i < len; ++i) {
            let type = types[i];
            if (type == "1" && cur == "r")
                types[i] = "n";
            else if (isStrong.test(type)) {
                cur = type;
                if (type == "r")
                    types[i] = "R";
            }
        }
        // W4. A single European separator between two European numbers
        // changes to a European number. A single common separator between
        // two numbers of the same type changes to that type.
        for (let i = 1, prev = types[0]; i < len - 1; ++i) {
            let type = types[i];
            if (type == "+" && prev == "1" && types[i + 1] == "1")
                types[i] = "1";
            else if (type == "," && prev == types[i + 1] &&
                (prev == "1" || prev == "n"))
                types[i] = prev;
            prev = type;
        }
        // W5. A sequence of European terminators adjacent to European
        // numbers changes to all European numbers.
        // W6. Otherwise, separators and terminators change to Other
        // Neutral.
        for (let i = 0; i < len; ++i) {
            let type = types[i];
            if (type == ",")
                types[i] = "N";
            else if (type == "%") {
                let end;
                for (end = i + 1; end < len && types[end] == "%"; ++end) { }
                let replace = (i && types[i - 1] == "!") || (end < len && types[end] == "1") ? "1" : "N";
                for (let j = i; j < end; ++j)
                    types[j] = replace;
                i = end - 1;
            }
        }
        // W7. Search backwards from each instance of a European number
        // until the first strong type (R, L, or sor) is found. If an L is
        // found, then change the type of the European number to L.
        for (let i = 0, cur = outerType; i < len; ++i) {
            let type = types[i];
            if (cur == "L" && type == "1")
                types[i] = "L";
            else if (isStrong.test(type))
                cur = type;
        }
        // N1. A sequence of neutrals takes the direction of the
        // surrounding strong text if the text on both sides has the same
        // direction. European and Arabic numbers act as if they were R in
        // terms of their influence on neutrals. Start-of-level-run (sor)
        // and end-of-level-run (eor) are used at level run boundaries.
        // N2. Any remaining neutrals take the embedding direction.
        for (let i = 0; i < len; ++i) {
            if (isNeutral.test(types[i])) {
                let end;
                for (end = i + 1; end < len && isNeutral.test(types[end]); ++end) { }
                let before = (i ? types[i - 1] : outerType) == "L";
                let after = (end < len ? types[end] : outerType) == "L";
                let replace = before == after ? (before ? "L" : "R") : outerType;
                for (let j = i; j < end; ++j)
                    types[j] = replace;
                i = end - 1;
            }
        }
        // Here we depart from the documented algorithm, in order to avoid
        // building up an actual levels array. Since there are only three
        // levels (0, 1, 2) in an implementation that doesn't take
        // explicit embedding into account, we can build up the order on
        // the fly, without following the level-based algorithm.
        let order = [], m;
        for (let i = 0; i < len;) {
            if (countsAsLeft.test(types[i])) {
                let start = i;
                for (++i; i < len && countsAsLeft.test(types[i]); ++i) { }
                order.push(new BidiSpan(0, start, i));
            }
            else {
                let pos = i, at = order.length, isRTL = direction == "rtl" ? 1 : 0;
                for (++i; i < len && types[i] != "L"; ++i) { }
                for (let j = pos; j < i;) {
                    if (countsAsNum.test(types[j])) {
                        if (pos < j) {
                            order.splice(at, 0, new BidiSpan(1, pos, j));
                            at += isRTL;
                        }
                        let nstart = j;
                        for (++j; j < i && countsAsNum.test(types[j]); ++j) { }
                        order.splice(at, 0, new BidiSpan(2, nstart, j));
                        at += isRTL;
                        pos = j;
                    }
                    else
                        ++j;
                }
                if (pos < i)
                    order.splice(at, 0, new BidiSpan(1, pos, i));
            }
        }
        if (direction == "ltr") {
            if (order[0].level == 1 && (m = str.match(/^\s+/))) {
                order[0].from = m[0].length;
                order.unshift(new BidiSpan(0, 0, m[0].length));
            }
            if (lst(order).level == 1 && (m = str.match(/\s+$/))) {
                lst(order).to -= m[0].length;
                order.push(new BidiSpan(0, len - m[0].length, len));
            }
        }
        return direction == "rtl" ? order.reverse() : order;
    };
})();
// Get the bidi ordering for the given line (and cache it). Returns
// false for lines that are fully left-to-right, and an array of
// BidiSpan objects otherwise.
export function getOrder(line, direction) {
    let order = line.order;
    if (order == null)
        order = line.order = bidiOrdering(line.text, direction);
    return order;
}
//# sourceMappingURL=bidi.js.map