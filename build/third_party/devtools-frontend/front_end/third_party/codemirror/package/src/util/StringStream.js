import { countColumn } from "./misc.js";
// STRING STREAM
// Fed to the mode parsers, provides helper functions to make
// parsers more succinct.
class StringStream {
    constructor(string, tabSize, lineOracle) {
        this.pos = this.start = 0;
        this.string = string;
        this.tabSize = tabSize || 8;
        this.lastColumnPos = this.lastColumnValue = 0;
        this.lineStart = 0;
        this.lineOracle = lineOracle;
    }
    eol() { return this.pos >= this.string.length; }
    sol() { return this.pos == this.lineStart; }
    peek() { return this.string.charAt(this.pos) || undefined; }
    next() {
        if (this.pos < this.string.length)
            return this.string.charAt(this.pos++);
    }
    eat(match) {
        let ch = this.string.charAt(this.pos);
        let ok;
        if (typeof match == "string")
            ok = ch == match;
        else
            ok = ch && (match.test ? match.test(ch) : match(ch));
        if (ok) {
            ++this.pos;
            return ch;
        }
    }
    eatWhile(match) {
        let start = this.pos;
        while (this.eat(match)) { }
        return this.pos > start;
    }
    eatSpace() {
        let start = this.pos;
        while (/[\s\u00a0]/.test(this.string.charAt(this.pos)))
            ++this.pos;
        return this.pos > start;
    }
    skipToEnd() { this.pos = this.string.length; }
    skipTo(ch) {
        let found = this.string.indexOf(ch, this.pos);
        if (found > -1) {
            this.pos = found;
            return true;
        }
    }
    backUp(n) { this.pos -= n; }
    column() {
        if (this.lastColumnPos < this.start) {
            this.lastColumnValue = countColumn(this.string, this.start, this.tabSize, this.lastColumnPos, this.lastColumnValue);
            this.lastColumnPos = this.start;
        }
        return this.lastColumnValue - (this.lineStart ? countColumn(this.string, this.lineStart, this.tabSize) : 0);
    }
    indentation() {
        return countColumn(this.string, null, this.tabSize) -
            (this.lineStart ? countColumn(this.string, this.lineStart, this.tabSize) : 0);
    }
    match(pattern, consume, caseInsensitive) {
        if (typeof pattern == "string") {
            let cased = str => caseInsensitive ? str.toLowerCase() : str;
            let substr = this.string.substr(this.pos, pattern.length);
            if (cased(substr) == cased(pattern)) {
                if (consume !== false)
                    this.pos += pattern.length;
                return true;
            }
        }
        else {
            let match = this.string.slice(this.pos).match(pattern);
            if (match && match.index > 0)
                return null;
            if (match && consume !== false)
                this.pos += match[0].length;
            return match;
        }
    }
    current() { return this.string.slice(this.start, this.pos); }
    hideFirstChars(n, inner) {
        this.lineStart += n;
        try {
            return inner();
        }
        finally {
            this.lineStart -= n;
        }
    }
    lookAhead(n) {
        let oracle = this.lineOracle;
        return oracle && oracle.lookAhead(n);
    }
    baseToken() {
        let oracle = this.lineOracle;
        return oracle && oracle.baseToken(this.pos);
    }
}
export default StringStream;
//# sourceMappingURL=StringStream.js.map