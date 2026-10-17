import { getContextBefore } from "../line/highlight.js";
import { Pos } from "../line/pos.js";
import { getLine } from "../line/utils_line.js";
import { replaceRange } from "../model/changes.js";
import { Range } from "../model/selection.js";
import { replaceOneSelection } from "../model/selection_updates.js";
import { countColumn, Pass, spaceStr } from "../util/misc.js";
// Indent the given line. The how parameter can be "smart",
// "add"/null, "subtract", or "prev". When aggressive is false
// (typically set to true for forced single-line indents), empty
// lines are not indented, and places where the mode returns Pass
// are left alone.
export function indentLine(cm, n, how, aggressive) {
    let doc = cm.doc, state;
    if (how == null)
        how = "add";
    if (how == "smart") {
        // Fall back to "prev" when the mode doesn't have an indentation
        // method.
        if (!doc.mode.indent)
            how = "prev";
        else
            state = getContextBefore(cm, n).state;
    }
    let tabSize = cm.options.tabSize;
    let line = getLine(doc, n), curSpace = countColumn(line.text, null, tabSize);
    if (line.stateAfter)
        line.stateAfter = null;
    let curSpaceString = line.text.match(/^\s*/)[0], indentation;
    if (!aggressive && !/\S/.test(line.text)) {
        indentation = 0;
        how = "not";
    }
    else if (how == "smart") {
        indentation = doc.mode.indent(state, line.text.slice(curSpaceString.length), line.text);
        if (indentation == Pass || indentation > 150) {
            if (!aggressive)
                return;
            how = "prev";
        }
    }
    if (how == "prev") {
        if (n > doc.first)
            indentation = countColumn(getLine(doc, n - 1).text, null, tabSize);
        else
            indentation = 0;
    }
    else if (how == "add") {
        indentation = curSpace + cm.options.indentUnit;
    }
    else if (how == "subtract") {
        indentation = curSpace - cm.options.indentUnit;
    }
    else if (typeof how == "number") {
        indentation = curSpace + how;
    }
    indentation = Math.max(0, indentation);
    let indentString = "", pos = 0;
    if (cm.options.indentWithTabs)
        for (let i = Math.floor(indentation / tabSize); i; --i) {
            pos += tabSize;
            indentString += "\t";
        }
    if (pos < indentation)
        indentString += spaceStr(indentation - pos);
    if (indentString != curSpaceString) {
        replaceRange(doc, indentString, Pos(n, 0), Pos(n, curSpaceString.length), "+input");
        line.stateAfter = null;
        return true;
    }
    else {
        // Ensure that, if the cursor was in the whitespace at the start
        // of the line, it is moved to the end of that space.
        for (let i = 0; i < doc.sel.ranges.length; i++) {
            let range = doc.sel.ranges[i];
            if (range.head.line == n && range.head.ch < curSpaceString.length) {
                let pos = Pos(n, curSpaceString.length);
                replaceOneSelection(doc, i, new Range(pos, pos));
                break;
            }
        }
    }
}
//# sourceMappingURL=indent.js.map